#!/usr/bin/env bash
# Builds every app: installs its dependencies, loads its code and runs its tests.
# Plain HTML and spreadsheet products have nothing to build.
#   scripts/build-apps.sh            all apps
#   scripts/build-apps.sh launcher   only the apps whose path contains "launcher"
# Exits non-zero if any app fails, after trying them all. It builds only; it never deploys.
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
only="${1:-}"
failed=()

step() {  # step PATH KIND
  [[ -z "$only" || "$1" == *"$only"* ]] || return 0
  echo "== $1 ($2)"
  if "build_$2" "$1"; then echo "ok $1"; else echo "FAILED $1"; failed+=("$1"); fi
}
build_vite() { (cd "$1" && npm ci --silent && npm run build --silent); }
# Node and Python apps run in a throwaway copy, so nothing lands in the folders that get zipped for sale.
build_node() {
  local tmp rc
  tmp="$(mktemp -d)"; cp -r "$1/." "$tmp"
  ( cd "$tmp" && npm install --silent --omit=optional --ignore-scripts \
    && echo '{"topics":[],"outDir":"out"}' > build-check.json \
    && node blogen.mjs --config build-check.json --dry ); rc=$?
  rm -rf "$tmp"; return "$rc"
}
# Installs the app's real requirements, imports its scripts, then runs its tests if it has any.
build_python() {
  local tmp rc
  tmp="$(mktemp -d)"; cp -r "$1/." "$tmp"
  ( set -e
    root="$(dirname "$(find "$tmp" -name requirements.txt | sort | head -1)")"
    python3 -m venv "$tmp/.venv"
    "$tmp/.venv/bin/pip" install -q -r "$root/requirements.txt"
    cd "$root"
    if [[ -d tests ]]; then
      "$tmp/.venv/bin/pip" install -q -r requirements-dev.txt
      "$tmp/.venv/bin/python" -m pytest -q -p no:cacheprovider
    else
      for f in *.py; do
        case "$f" in test_*) ;; *) "$tmp/.venv/bin/python" -c "import ${f%.py}" ;; esac
      done
      if ls test_*.py >/dev/null 2>&1; then "$tmp/.venv/bin/python" -m unittest discover -q; fi
    fi ); rc=$?
  rm -rf "$tmp"; return "$rc"
}

step launcher vite
step Blogen node
step products/blog-gen node
step Lead-Pipeline python
step products/lead-generator python
step products/reports/gumroad-scraper python
step products/social-studio python

if (( ${#failed[@]} )); then echo "Failed: ${failed[*]}"; exit 1; fi
echo "All apps built."
