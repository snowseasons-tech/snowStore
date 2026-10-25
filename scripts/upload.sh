#!/usr/bin/env bash
# Upload a deliverable to the private bucket, reading S3_* values from .env (gitignored).
#   scripts/upload.sh <local file> <fileKey>
#   scripts/upload.sh products/vanilla-webpage/index.html vanilla-webpage/vanilla-webpage.html
# .env needs: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (S3_REGION optional, defaults to auto).
set -euo pipefail
cd "$(dirname "$0")/.."

[ $# -eq 2 ] || { echo "usage: scripts/upload.sh <local file> <fileKey>" >&2; exit 1; }
[ -f .env ] || { echo "No .env in $(pwd). Create it with the S3_* values." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
. ./.env
set +a

exec node scripts/upload.js "$1" "$2"
