#!/bin/bash
set -e

MSG="${1:-fix og-image}"

# Stage and commit
git add -A
git commit -m "$MSG" || { echo "Nothing to commit"; exit 0; }
git push

# Wait for workflow to start
echo "Waiting for workflow to start..."
sleep 5

# Get the latest run ID
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Watching run $RUN_ID..."

# Wait for it to finish
gh run watch "$RUN_ID" --exit-status || { echo "Build failed!"; gh run view "$RUN_ID" --log-failed; exit 1; }

echo ""
echo "=== Deploy complete. Checking OG image ==="
echo ""

# Check what meta tag says
echo "--- Meta tags ---"
curl -sL https://rbby.dev/gnata-sqlite/ | grep -i 'og:image' | head -5 || echo "(no og:image found)"

echo ""

# Extract OG image URL (macOS-compatible)
OG_URL=$(python3 -c "
import re, urllib.request
html = urllib.request.urlopen('https://rbby.dev/gnata-sqlite/').read().decode()
m = re.search(r'og:image\" content=\"([^\"]+)\"', html)
print(m.group(1) if m else '')
")

if [ -n "$OG_URL" ]; then
  echo "OG image URL: $OG_URL"
  STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$OG_URL")
  CONTENT_TYPE=$(curl -sL -o /dev/null -w "%{content_type}" "$OG_URL")
  echo "HTTP status: $STATUS"
  echo "Content-Type: $CONTENT_TYPE"
  if [ "$STATUS" = "200" ] && echo "$CONTENT_TYPE" | grep -q "image"; then
    echo "OG image is working!"
  else
    echo "OG image is NOT working"
  fi
else
  echo "Could not extract og:image URL"
fi
