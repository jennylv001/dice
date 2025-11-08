#!/usr/bin/env python3
"""Basic runtime test for build_extension script.

Runs the build in minimal mode and asserts required files exist.
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "build_extension.py"
OUT_DIR = REPO_ROOT / "extension_unpacked_test"

REQUIRED = [
    "manifest.json",
    "background.iife.js",
    "content/index.iife.js",
    "side-panel/index.html",
    "icon-32.png",
    "icon-128.png",
]

def run_build():
    if OUT_DIR.exists():
        import shutil
        shutil.rmtree(OUT_DIR)
    cmd = [sys.executable, str(SCRIPT), "--output", str(OUT_DIR), "--mode", "minimal"]
    subprocess.run(cmd, check=True)

def assert_files():
    missing = []
    for rel in REQUIRED:
        if not (OUT_DIR / rel).exists():
            missing.append(rel)
    if missing:
        raise AssertionError(f"Missing expected files: {missing}")

def main():
    run_build()
    assert_files()
    print("test_build_extension: OK")

if __name__ == "__main__":
    main()
