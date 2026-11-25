#!/usr/bin/env bash
# Manual macOS packaging (Electron "manual distribution" + rebranding), usable from Linux.
# Usage: scripts/package-mac.sh <arm64|x64> <path-to-electron-darwin-zip> <app.asar>
set -euo pipefail
ARCH="$1"; ZIP="$2"; ASAR="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="Köroğlu Satranç"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUT="$ROOT/out/mac-$ARCH"
rm -rf "$OUT" && mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT/tmp"
APPDIR="Koroglu Satranc"
mv "$OUT/tmp/Electron.app" "$OUT/$APPDIR.app"
rm -rf "$OUT/tmp"
RES="$OUT/$APPDIR.app/Contents/Resources"
rm -f "$RES/default_app.asar"
cp "$ASAR" "$RES/app.asar"
mkdir -p "$RES/engines"
cp -R "$ROOT/resources/engines/darwin-$ARCH" "$RES/engines/"
chmod +x "$RES/engines/darwin-$ARCH/stockfish"
cp "$ROOT/resources/openings.json" "$ROOT/resources/puzzles.json" "$RES/"
cp -R "$ROOT/resources/maia" "$RES/"
cp -R "$ROOT/resources/licenses" "$RES/"
cp "$ROOT/build-src/icon.icns" "$RES/electron.icns"
python3 - "$OUT/$APPDIR.app/Contents/Info.plist" "$NAME" "$VERSION" <<'EOF'
import plistlib, sys
p, name, ver = sys.argv[1], sys.argv[2], sys.argv[3]
with open(p, 'rb') as f: d = plistlib.load(f)
d.update({'CFBundleName': name, 'CFBundleDisplayName': name, 'CFBundleIdentifier': 'com.koroglu.satranc',
          'CFBundleShortVersionString': ver, 'CFBundleVersion': ver,
          'LSApplicationCategoryType': 'public.app-category.education'})
with open(p, 'wb') as f: plistlib.dump(d, f)
EOF
echo "built $OUT/$APPDIR.app"
