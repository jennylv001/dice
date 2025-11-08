#!/usr/bin/env python3
"""
Build Chrome extension unpacked folder based on manifest.json.

Modes:
  minimal: Only files explicitly referenced in manifest fields (background, content_scripts, side_panel, icons, locales).
  full:    Also include files matching web_accessible_resources glob patterns (e.g. *.js, *.css) from repository root.

Usage:
  python scripts/build_extension.py --output extension_unpacked --mode minimal
  python scripts/build_extension.py --output extension_unpacked --mode full

Exit codes:
  0 success
  1 fatal error
"""
from __future__ import annotations
import argparse
import json
import shutil
import sys
import fnmatch
import re
from pathlib import Path
from typing import Dict, List, Set

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "manifest.json"

TRANSPARENT_32_PX_PNG_BASE64 = (
    b"iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAGXRFWHRTb2Z0d2FyZQBwYWludC5uZXQgNC4yLjE1hXshUgAAABNJREFUWIXt0LENgEAMwEAwjKj+/5M8QxG0iVIXKu1unXwLE1x5AfL8jz8u4cQBAgQIECBAn8A0dyP3+AD4GZJcrkAAAAASUVORK5CYII="
)

class BuildError(Exception):
    pass

def load_manifest(path: Path) -> Dict:
    if not path.exists():
        raise BuildError(f"manifest.json not found at {path}")
    with path.open("r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            raise BuildError(f"Invalid manifest.json: {e}")

def collect_minimal_resources(manifest: Dict) -> Set[Path]:
    resources: Set[Path] = set()
    # background
    bg = manifest.get("background", {}).get("service_worker")
    if bg:
        resources.add(Path(bg))
    # content scripts
    for cs in manifest.get("content_scripts", []):
        for js in cs.get("js", []):
            resources.add(Path(js))
    # side panel
    sp = manifest.get("side_panel", {}).get("default_path")
    if sp:
        resources.add(Path(sp))
    # icons
    action_icon = manifest.get("action", {}).get("default_icon")
    if action_icon:
        resources.add(Path(action_icon))
    for _size, icon_path in manifest.get("icons", {}).items():
        resources.add(Path(icon_path))
    # locales (copy entire _locales dir)
    locales_dir = REPO_ROOT / "_locales"
    if locales_dir.exists():
        for p in locales_dir.rglob("*"):
            if p.is_file():
                resources.add(p.relative_to(REPO_ROOT))
    return resources

def extract_html_asset_refs(html_path: Path) -> Set[Path]:
    """Parse a simple HTML file and collect local relative asset paths from
    <script src> and <link href> tags. Only relative (no scheme) paths are considered.
    """
    refs: Set[Path] = set()
    if not html_path.exists():
        return refs
    try:
        text = html_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return refs
    # Regex captures src or href attributes; exclude external (://) and absolute starting with http/https.
    attr_pattern = re.compile(r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", re.IGNORECASE)
    for m in attr_pattern.finditer(text):
        raw = m.group(1).strip()
        if not raw or "://" in raw or raw.startswith("data:"):
            continue
        # Normalize ../ and ./ relative to html_path parent
        candidate = (html_path.parent / raw).resolve()
        if candidate.is_file():
            try:
                refs.add(candidate.relative_to(REPO_ROOT))
            except ValueError:
                # Asset outside repo root; ignore for packaging
                pass
        else:
            # We still record non-existent reference; Build step will validate
            rel_candidate = candidate
            if str(rel_candidate).startswith(str(REPO_ROOT)):
                try:
                    refs.add(rel_candidate.relative_to(REPO_ROOT))
                except ValueError:
                    pass
    return refs

def include_side_panel_and_options_assets(resources: Set[Path]) -> Set[Path]:
    """Ensure hashed asset bundles referenced by side panel / options HTML are copied.
    We parse each HTML entry point, add discovered asset files, and include entire assets/ subdirectory if present.
    Missing referenced assets trigger fatal BuildError later.
    """
    entry_files = []
    # Side panel
    sp_html = REPO_ROOT / "side-panel" / "index.html"
    if sp_html.exists():
        entry_files.append(sp_html)
    # Options page (present though not in manifest currently)
    opt_html = REPO_ROOT / "options" / "index.html"
    if opt_html.exists():
        entry_files.append(opt_html)

    asset_dirs = set()
    for html in entry_files:
        # Add the HTML itself (already added for side_panel via manifest; ensure options included if needed)
        try:
            resources.add(html.relative_to(REPO_ROOT))
        except ValueError:
            pass
        refs = extract_html_asset_refs(html)
        for ref in refs:
            resources.add(ref)
            # Track its parent assets dir if path matches /assets/
            parts = ref.parts
            if "assets" in parts:
                # Find assets directory path
                idx = parts.index("assets")
                asset_dir = REPO_ROOT / Path(*parts[: idx + 1])
                asset_dirs.add(asset_dir)

    # Include all files under each assets directory
    for adir in asset_dirs:
        if adir.exists() and adir.is_dir():
            for p in adir.rglob("*"):
                if p.is_file():
                    try:
                        resources.add(p.relative_to(REPO_ROOT))
                    except ValueError:
                        pass
    return resources

def include_extra_runtime_dirs(resources: Set[Path]) -> Set[Path]:
    """Ensure folders containing statically imported runtime modules are included.

    Currently we need `agent_js/` because `background.iife.js` has a top-level
    ES module import of `./agent_js/bootstrap.js` not declared in manifest.json.
    Without copying this directory, the service worker will 404 that import at runtime.
    """
    # ALSO include legacy `agent/` runtime which is imported by background.iife.js
    # If omitted the service worker registration fails with status code 3 due to
    # module fetch error ("An unknown error occurred when fetching the script.").
    extra_dirs = ["agent_js", "agent"]
    for name in extra_dirs:
        dir_path = REPO_ROOT / name
        if not dir_path.exists() or not dir_path.is_dir():
            continue
        for p in dir_path.rglob("*"):
            if p.is_file():
                resources.add(p.relative_to(REPO_ROOT))
    return resources

def collect_full_resources(manifest: Dict, minimal: Set[Path]) -> Set[Path]:
    resources = set(minimal)
    wa = manifest.get("web_accessible_resources", [])
    patterns: List[str] = []
    for entry in wa:
        patterns.extend(entry.get("resources", []))
    # Expand glob patterns limited to repo root wildcard (*.js, *.css)
    for pattern in patterns:
        if any(ch in pattern for ch in ["*", "?"]):
            for candidate in REPO_ROOT.rglob("*"):
                if candidate.is_file() and fnmatch.fnmatch(candidate.name, pattern):
                    resources.add(candidate.relative_to(REPO_ROOT))
        else:
            p = REPO_ROOT / pattern
            if p.exists():
                resources.add(p.relative_to(REPO_ROOT))
    return resources

def ensure_parent(dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)

def copy_resource(rel_path: Path, out_root: Path):
    src = REPO_ROOT / rel_path
    dest = out_root / rel_path
    ensure_parent(dest)
    if not src.exists():
        # If missing icon, create transparent placeholder
        if rel_path.name in {"icon-32.png", "icon-128.png"}:
            import base64
            with dest.open("wb") as f:
                f.write(base64.b64decode(TRANSPARENT_32_PX_PNG_BASE64))
            print(f"[placeholder] Created missing {rel_path}")
            return
        print(f"[warn] Missing {rel_path}, skipped")
        return
    shutil.copy2(src, dest)

def write_manifest(manifest: Dict, out_root: Path):
    # Write original manifest (no mutation for now)
    dest = out_root / "manifest.json"
    ensure_parent(dest)
    with dest.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

def build(output: Path, mode: str):
    manifest = load_manifest(MANIFEST_PATH)
    minimal_resources = collect_minimal_resources(manifest)
    # Include extra runtime directories required by static imports.
    minimal_resources = include_extra_runtime_dirs(minimal_resources)
    # Include side panel / options hashed asset bundles
    minimal_resources = include_side_panel_and_options_assets(minimal_resources)
    if mode == "minimal":
        all_resources = minimal_resources
    elif mode == "full":
        all_resources = collect_full_resources(manifest, minimal_resources)
    else:
        raise BuildError(f"Unknown mode: {mode}")

    if output.exists():
        print(f"[info] Removing existing output dir {output}")
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)

    write_manifest(manifest, output)
    missing: List[Path] = []
    for rel in sorted(all_resources):
        src = REPO_ROOT / rel
        if not src.exists() and rel.name not in {"icon-32.png", "icon-128.png"}:
            missing.append(rel)
        copy_resource(rel, output)

    if missing:
        raise BuildError(
            "Missing referenced asset(s): " + ", ".join(str(p) for p in missing)
        )

    print(f"[done] Built {mode} extension at {output} (files: {len(all_resources) + 1})")

def parse_args(argv: List[str]):
    ap = argparse.ArgumentParser(description="Build unpacked Chrome extension folder")
    ap.add_argument("--output", default="extension_unpacked", help="Output directory path")
    ap.add_argument("--mode", choices=["minimal", "full"], default="minimal", help="Resource inclusion mode")
    return ap.parse_args(argv)

def main(argv: List[str]):
    args = parse_args(argv)
    try:
        build(Path(args.output).resolve(), args.mode)
        return 0
    except BuildError as e:
        print(f"[error] {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
