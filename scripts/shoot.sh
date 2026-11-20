#!/usr/bin/env bash
# 用本机 headless Chrome 给 preview/*.html 截图
# 用法: bash scripts/shoot.sh preview/xxx.html screenshots/xxx.png [宽=390] [高=1200]
set -uo pipefail
CHROME="${CHROME:-$HOME/.local/chrome-for-testing/chrome-linux64/chrome}"
HTML="$1"; OUT="$2"; W="${3:-390}"; H="${4:-1200}"
mkdir -p "$(dirname "$OUT")"
ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
"$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=3000 \
  --window-size="${W},${H}" --screenshot="$OUT" "file://$ABS" 2>/dev/null
if [ ! -s "$OUT" ]; then echo "FAIL: screenshot not written"; exit 1; fi
echo "OK $OUT $(stat -c%s "$OUT") bytes"
