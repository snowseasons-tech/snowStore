#!/usr/bin/env bash
# Checks that every app builds. Plain HTML and spreadsheet products have nothing to build.
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
build_node() {
  local f
  for f in "$1"/*.mjs; do node --check "$f" || return 1; done
}
# Compiles into memory so no __pycache__ lands in the folders that get zipped for sale.
build_python() {
  python3 - "$1" <<'PY'
import pathlib, sys
ok = True
for f in pathlib.Path(sys.argv[1]).rglob("*.py"):
    try:
        compile(f.read_text(encoding="utf-8"), str(f), "exec")
    except SyntaxError as e:
        print(e)
        ok = False
sys.exit(0 if ok else 1)
PY
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
