#!/usr/bin/env bash
# Renders the 1080x1920 slides in vertical.html with headless Chrome, then joins them into the reel MP4s with ffmpeg.
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
    --screenshot="$2" "file://$PWD/vertical.html#$1" 2>/dev/null
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

reel 01-automate-before-january automate-hook:2.5 automate-1:2.2 automate-2:2.2 automate-3:2.2 automate-4:2.2 automate-cta:3.5
reel 02-gbp-tune-up gbp-hook:2.5 gbp-1:2 gbp-2:2 gbp-3:2 gbp-4:2 gbp-5:2 gbp-cta:4
shot story-poll "$out/03-story-poll.png"
ls "$out"
