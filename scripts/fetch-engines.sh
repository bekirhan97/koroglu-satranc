#!/usr/bin/env bash
# Downloads Stockfish 17.1 for the given targets into resources/engines/<platform-arch>/.
# Usage: scripts/fetch-engines.sh win32-x64 darwin-arm64 darwin-x64 linux-x64
set -euo pipefail
BASE=https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
for t in "$@"; do
  case "$t" in
    win32-x64)    f=stockfish-windows-x86-64-sse41-popcnt.zip; exe=stockfish.exe ;;
    darwin-arm64) f=stockfish-macos-m1-apple-silicon.tar;      exe=stockfish ;;
    darwin-x64)   f=stockfish-macos-x86-64-sse41-popcnt.tar;   exe=stockfish ;;
    linux-x64)    f=stockfish-ubuntu-x86-64-sse41-popcnt.tar;  exe=stockfish ;;
    *) echo "bilinmeyen hedef $t"; exit 1 ;;
  esac
  curl -sSfL -o "$TMP/$f" "$BASE/$f"
  mkdir -p "$TMP/$t"
  if [[ $f == *.zip ]]; then unzip -q -o "$TMP/$f" -d "$TMP/$t"; else tar xf "$TMP/$f" -C "$TMP/$t"; fi
  bin="$(find "$TMP/$t" -type f -size +10M | head -1)"
  mkdir -p "$ROOT/resources/engines/$t"
  cp "$bin" "$ROOT/resources/engines/$t/$exe"
  chmod +x "$ROOT/resources/engines/$t/$exe"
  echo "$t -> $(basename "$bin")"
done
rm -rf "$TMP"
