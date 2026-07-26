#!/usr/bin/env bash
# Next.js Turbopack용 네이티브 SWC 바이너리가 비어 있으면 재설치한다.
set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 0

NODE="$(node -p "process.platform + '-' + process.arch" 2>/dev/null)"
case "$NODE" in
  darwin-arm64) PKG="@next/swc-darwin-arm64" ;;
  darwin-x64) PKG="@next/swc-darwin-x64" ;;
  linux-x64) PKG="@next/swc-linux-x64-gnu" ;;
  linux-arm64) PKG="@next/swc-linux-arm64-gnu" ;;
  *) exit 0 ;;
esac

VERSION="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null)"
[ -z "$VERSION" ] && exit 0

DIR="node_modules/@next/${PKG##*/}"
BIN="$(find "$DIR" -name 'next-swc.*.node' 2>/dev/null | head -1)"

if [ -n "$BIN" ] && [ -s "$BIN" ]; then
  exit 0
fi

echo "[ensure-next-swc] missing or empty $PKG, reinstalling@$VERSION"
rm -rf "$DIR"
npm install "$PKG@$VERSION" --no-save --no-audit --no-fund >/dev/null 2>&1
exit 0
