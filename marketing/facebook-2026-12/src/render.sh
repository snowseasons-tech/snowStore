#!/usr/bin/env bash
# Renders the post images to ../images with headless Chrome and copies the existing product images alongside them.
set -euo pipefail
cd "$(dirname "$0")"
out=../images
rm -rf "$out"
mkdir -p "$out"
repo=../../..

render() {
  google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1080 --virtual-time-budget=3000 --allow-file-access-from-files \
    --screenshot="$out/$1.png" "file://$PWD/post.html#$2" 2>/dev/null
}

render 02-automate-before-january automate-before-january
render 05-gbp-refresh gbp-refresh
render 06-courses courses
render 08-happy-holidays happy-holidays
render 11-new-year new-year

cp "$repo/_assets/images/inventory-tracker.jpeg" "$out/01-inventory-tracker.jpeg"
cp "$repo/_assets/images/semester-ends-bookscan.jpeg" "$out/03-bookscan-live.jpeg"
cp "$repo/_assets/images/vanilla-webpage.jpeg" "$out/04-page-builder.jpeg"
cp "$repo/_assets/images/bloggen.jpeg" "$out/07-auto-blogger.jpeg"
cp "$repo/_assets/images/saas-financial-engine.jpg" "$out/09-saas-financial-engine.jpg"
cp "$repo/_assets/images/bi-dashboard.jpeg" "$out/10-bi-dashboard.jpeg"
ls "$out"
