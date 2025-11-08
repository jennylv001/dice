# Unpacked Extension Build Guide

This project includes a Chrome extension implemented in Manifest V3. Use the build script to assemble a minimal unpacked folder suitable for loading via `chrome://extensions`.

## Requirements
- Python 3.9+
- This repository cloned locally

## Build Modes
- `minimal`: Only files directly referenced in `manifest.json` (background service worker, content script, side panel HTML, icons, locales).
- `full`: Also includes files matching web accessible resource glob patterns (e.g. `*.js`, `*.css`).

## Build
```bash
python scripts/build_extension.py --output extension_unpacked --mode minimal
```
(Replace `minimal` with `full` if you need broader file coverage.)

Result: `extension_unpacked/` contains `manifest.json` plus required assets.

## Load in Chrome
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension_unpacked` directory
5. Confirm the extension loads without warnings

## Folder Contents (Minimal)
- `manifest.json`
- `background.iife.js`
- `content/index.iife.js`
- `side-panel/index.html`
- Icons: `icon-32.png`, `icon-128.png` (placeholders auto-created if missing)
- Locales: `_locales/en/messages.json` (and any other locale folders present)

## Regenerating After Changes
Re-run the build command any time you modify scripts or the manifest. The output directory is replaced each run.

## Troubleshooting
- Missing icons: Script will generate transparent placeholders.
- New locale: Add folder under `_locales/<code>/messages.json` and rebuild.
- 404 in content script: Verify path matches manifest entry (case-sensitive).

## Extending
If you add Options or Permission pages later, update `manifest.json` accordingly and rebuild.

---
Generated automatically by `scripts/build_extension.py`.
