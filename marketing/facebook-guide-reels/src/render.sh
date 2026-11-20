#!/usr/bin/env bash
# Renders the 1080x1920 slides in slides.html with headless Chrome, then joins them into the reel MP4s with ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"
out=../reels
frames=$(mktemp -d)
trap 'rm -rf "$frames"' EXIT
rm -rf "$out"
mkdir -p "$out"

shot() {
  google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1920 --virtual-time-budget=3000 --allow-file-access-from-files \
    --screenshot="$2" "file://$PWD/slides.html#$1" 2>/dev/null
}

# reel <name> <slide>:<seconds> ...  Each slide fades into the next over 0.35s; a silent audio track is added so
# Facebook accepts the file and you can pick music in the app.
reel() {
  local name=$1; shift
  local inputs=() filter="" prev="0:v" offset=0 fade=0.35 i=0 total=0
  for spec in "$@"; do
    local slide=${spec%%:*} secs=${spec##*:}
    shot "$slide" "$frames/$name-$i.png"
    inputs+=(-loop 1 -t "$secs" -i "$frames/$name-$i.png")
    if (( i > 0 )); then
      offset=$(echo "$total - $fade * $i" | bc)
      filter+="[$prev][$i:v]xfade=transition=fade:duration=$fade:offset=$offset[v$i];"
      prev="v$i"
    fi
    total=$(echo "$total + $secs" | bc)
    i=$((i + 1))
  done
  filter+="[$prev]format=yuv420p[out]"
  ffmpeg -loglevel error -y "${inputs[@]}" -f lavfi -i anullsrc=r=44100:cl=stereo \
    -filter_complex "$filter" -map "[out]" -map "$i:a" -shortest \
    -r 30 -c:v libx264 -preset slow -crf 18 -c:a aac -movflags +faststart "$out/$name.mp4"
  cp "$frames/$name-0.png" "$out/$name-cover.png"
}

reel 01-try-before-you-buy lesson-hook:2.5 lesson-1:3.5 lesson-cta:4
reel 02-fill-in-the-blank fill-hook:2.5 fill-1:4 fill-cta:4
reel 03-fixes-nobody-sees fix-hook:2.5 fix-1:4 fix-cta:4
ls "$out"
