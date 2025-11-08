#!/usr/bin/env python3
"""Validate that side-panel and options asset bundles are included in minimal build.

Assumptions:
 - side-panel/index.html exists and references at least one JS and CSS under side-panel/assets/.
 - options/index.html may exist; if so its assets must be included.
 - build script should fail fast if referenced assets missing (exit code 1), so here we only check presence post-build.
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "build_extension.py"
OUT_DIR = REPO_ROOT / "extension_unpacked_test"

def run_build():
    if OUT_DIR.exists():
        import shutil
        shutil.rmtree(OUT_DIR)
    cmd = [sys.executable, str(SCRIPT), "--output", str(OUT_DIR), "--mode", "minimal"]
    subprocess.run(cmd, check=True)

def parse_asset_refs(html_path: Path) -> set[str]:
    if not html_path.exists():
        return set()
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    refs = set()
    # crude extract of src/href attributes
    import re
    for m in re.finditer(r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", text):
        raw = m.group(1)
        if "://" in raw or raw.startswith("data:"):
            continue
        # normalize relative path from HTML parent
        candidate = (html_path.parent / raw).resolve()
        if str(candidate).startswith(str(REPO_ROOT)):
            rel = candidate.relative_to(REPO_ROOT)
            refs.add(str(rel))
    return refs

def assert_side_panel_assets():
    side_panel_html = REPO_ROOT / "side-panel" / "index.html"
    if not side_panel_html.exists():
        print("[skip] side-panel/index.html not found")
        return
    refs = parse_asset_refs(side_panel_html)
    missing = [r for r in refs if not (OUT_DIR / r).exists()]
    if missing:
        raise AssertionError(
            f"Missing side panel assets after build: {missing}\nExpected in {OUT_DIR}"
        )

def assert_options_assets():
    options_html = REPO_ROOT / "options" / "index.html"
    if not options_html.exists():
        print("[skip] options/index.html not found")
        return
    refs = parse_asset_refs(options_html)
    missing = [r for r in refs if not (OUT_DIR / r).exists()]
    if missing:
        raise AssertionError(f"Missing options assets after build: {missing}")

def main():
    run_build()
    assert_side_panel_assets()
    assert_options_assets()
    print("test_side_panel_assets: OK")

if __name__ == "__main__":
    main()
