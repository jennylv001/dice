#!/usr/bin/env python3
"""Convert SVG icons to PNG format for extension manifest.

Requires: pip install cairosvg
Usage: python scripts/convert_icons.py
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

def convert_svg_to_png():
    try:
        import cairosvg
    except ImportError:
        print("[error] cairosvg not installed. Installing...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cairosvg"])
        import cairosvg
    
    icons = [
        ("icon-128.svg", "icon-128.png", 128),
        ("icon-32.svg", "icon-32.png", 32),
    ]
    
    for svg_name, png_name, size in icons:
        svg_path = REPO_ROOT / svg_name
        png_path = REPO_ROOT / png_name
        
        if not svg_path.exists():
            print(f"[warn] {svg_name} not found, skipping")
            continue
        
        with svg_path.open('r') as f:
            svg_data = f.read()
        
        cairosvg.svg2png(
            bytestring=svg_data.encode('utf-8'),
            write_to=str(png_path),
            output_width=size,
            output_height=size
        )
        print(f"[done] {svg_name} → {png_name} ({size}x{size})")

if __name__ == "__main__":
    convert_svg_to_png()
