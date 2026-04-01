#!/bin/bash
set -e

MSG="${1:-fix og-image}"
DIR="$(cd "$(dirname "$0")" && pwd)"

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
echo "Waiting 30s for CDN propagation..."
sleep 30

# Run verification
"$DIR/verify-deploy.sh"
