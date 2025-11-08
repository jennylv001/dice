import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
UNPACKED = REPO_ROOT / "extension_unpacked"


def load_manifest(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_manifest_web_accessible_patterns():
    m = load_manifest(REPO_ROOT / "manifest.json")
    war = m.get("web_accessible_resources", [])
    assert war, "web_accessible_resources missing"
    resources = war[0]["resources"]
    expected = {
        "ui-agent-bridge.js",
        "side-panel/assets/*.js",
        "side-panel/assets/*.css",
        "options/assets/*.js",
        "options/assets/*.css",
    }
    for e in expected:
        assert e in resources, f"Missing pattern {e} in web_accessible_resources"


def test_unpacked_presence():
    # Ensure build output exists
    assert UNPACKED.exists(), "extension_unpacked missing; run build script first"
    # ui-agent-bridge.js at root
    assert (UNPACKED / "ui-agent-bridge.js").exists(), "ui-agent-bridge.js not copied"
    # side-panel assets
    side_assets = UNPACKED / "side-panel" / "assets"
    assert side_assets.exists(), "side-panel/assets directory missing"
    js_files = list(side_assets.glob("*.js"))
    css_files = list(side_assets.glob("*.css"))
    assert js_files, "No JS assets in side-panel/assets"
    assert css_files, "No CSS assets in side-panel/assets"
    # options page + assets
    opt_index = UNPACKED / "options" / "index.html"
    assert opt_index.exists(), "options/index.html not copied"
    opt_assets = UNPACKED / "options" / "assets"
    assert opt_assets.exists(), "options/assets directory missing"
    assert list(opt_assets.glob("*.js")), "No JS assets in options/assets"
    assert list(opt_assets.glob("*.css")), "No CSS assets in options/assets"


def test_side_panel_html_references_exist():
    panel_html = UNPACKED / "side-panel" / "index.html"
    assert panel_html.exists(), "side-panel/index.html missing"
    text = panel_html.read_text(encoding="utf-8", errors="ignore")
    # Simple regex-less presence checks
    assert "ui-agent-bridge.js" in text, "Bridge script reference missing in side-panel/index.html"
    # Ensure at least one hashed asset reference still present
    assert "assets/" in text, "No assets references in side-panel/index.html"
