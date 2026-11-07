#!/usr/bin/env bash
# Renders the January 2027 post images to ../images with headless Chrome (1080x1080).
set -euo pipefail
cd "$(dirname "$0")"
out=../images
rm -rf "$out"
mkdir -p "$out"

render() {
  google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1080 --virtual-time-budget=3000 --allow-file-access-from-files \
    --screenshot="$out/$1.png" "file://$PWD/post.html#$2" 2>/dev/null
}

render 01-new-year-plan new-year-plan
render 02-gbp-posts gbp-posts
render 03-inventory-tracker inventory-tracker
render 04-batch-posting batch-posting
render 05-invoice-biller invoice-biller
render 06-website-care website-care
render 07-lead-pipeline lead-pipeline
render 08-review-replies review-replies
render 09-auto-scheduler auto-scheduler
render 10-auto-blogger auto-blogger
render 11-gbp-photos gbp-photos
render 12-gbp-analytics gbp-analytics

ls "$out"
