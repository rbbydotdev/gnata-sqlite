#!/bin/bash
# Verify all deployed pages are working and not returning 404/redirect HTML

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

BASE="https://rbby.dev/gnata-sqlite"
FAIL=0

check_page() {
  local url="$1"
  local label="$2"

  STATUS=$(curl -sL -o /tmp/verify-page.html -w "%{http_code}" "$url")

  # Check for 404 HTML or redirect script
  IS_404=false
  if grep -q 'window.location.replace' /tmp/verify-page.html 2>/dev/null; then
    IS_404=true
  fi
  if grep -q '<title>404</title>' /tmp/verify-page.html 2>/dev/null; then
    IS_404=true
  fi
  # Check if it's the GitHub Pages 404
  if [ "$STATUS" = "404" ]; then
    IS_404=true
  fi
  # Check if content is suspiciously small (likely 404 redirect)
  SIZE=$(wc -c < /tmp/verify-page.html | tr -d ' ')
  if [ "$SIZE" -lt 500 ]; then
    IS_404=true
  fi

  if [ "$IS_404" = true ]; then
    echo -e "${RED}FAIL${NC} [$STATUS] $label ($url) — got 404 or redirect page (${SIZE}B)"
    FAIL=1
  else
    echo -e "${GREEN}OK${NC}   [$STATUS] $label ($url) (${SIZE}B)"
  fi
}

check_asset() {
  local url="$1"
  local label="$2"
  local expect_type="$3"

  STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$url")
  CTYPE=$(curl -sL -o /dev/null -w "%{content_type}" "$url")

  if [ "$STATUS" = "200" ]; then
    if [ -n "$expect_type" ] && ! echo "$CTYPE" | grep -q "$expect_type"; then
      echo -e "${YELLOW}WARN${NC} [$STATUS] $label — wrong content-type: $CTYPE (expected $expect_type)"
      FAIL=1
    else
      echo -e "${GREEN}OK${NC}   [$STATUS] $label ($CTYPE)"
    fi
  else
    echo -e "${RED}FAIL${NC} [$STATUS] $label ($url)"
    FAIL=1
  fi
}

echo "=== Checking pages ==="
check_page "$BASE/"                                "Docs landing"
check_page "$BASE/docs"                            "Docs index"
check_page "$BASE/docs/tutorials/getting-started"  "Getting Started"
check_page "$BASE/docs/tutorials/react-widget"     "React Widget docs"
check_page "$BASE/docs/explanation/architecture"    "Architecture docs"
check_page "$BASE/playground/"                      "Playground root"
check_page "$BASE/playground/gnata"                 "Playground gnata mode"
check_page "$BASE/playground/sqlite"                "Playground sqlite mode"

echo ""
echo "=== Checking OG image ==="
# Extract OG URL from deployed HTML
OG_URL=$(curl -sL "$BASE/" | python3 -c "
import re, sys
html = sys.stdin.read()
m = re.search(r'og:image\x22 content=\x22([^\x22]+)\x22', html)
print(m.group(1) if m else '')
")

if [ -n "$OG_URL" ]; then
  echo "OG URL in HTML: $OG_URL"
  check_asset "$OG_URL" "OG image" "image"
else
  echo -e "${RED}FAIL${NC} Could not find og:image in HTML"
  FAIL=1
fi

echo ""
echo "=== Checking key assets ==="
check_asset "$BASE/gnata.wasm"          "gnata.wasm"          "application/wasm"
check_asset "$BASE/gnata-lsp.wasm"      "gnata-lsp.wasm"      "application/wasm"
check_asset "$BASE/playground/gnata.wasm" "playground gnata.wasm" "application/wasm"

echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All checks passed!${NC}"
else
  echo -e "${RED}Some checks failed.${NC}"
fi
exit $FAIL
