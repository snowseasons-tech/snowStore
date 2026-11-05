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

render 01-welcome welcome
render 02-landing-page-kit landing-page-kit
render 03-gbp-dashboard gbp-dashboard
render 04-outgrown-spreadsheets outgrown-spreadsheets
render 06-website-checklist website-checklist
render 08-thanksgiving thanksgiving
render 09-sale-teaser sale-teaser
render 10-sale-live sale-live
render 11-sale-last-day sale-last-day
render 12-social-media social-media
render 13-custom-vs-prebuilt custom-vs-prebuilt

cp "$repo/_assets/images/invoice-generator.jpeg" "$out/05-invoice-generator.jpeg"
cp "$repo/_assets/images/booking-app.jpeg" "$out/07-auto-scheduler.jpeg"
cp "$repo/_assets/images/Leadgen.jpeg" "$out/11b-lead-pipeline.jpeg"
ls "$out"
