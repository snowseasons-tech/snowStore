#!/usr/bin/env bash
# Driver for the hardware price scraper + build planner. Run from tools/hardware-price-scraper.
# Usage: drive.sh setup | test | scrape "<query>" [category] [site] | plan [builder args] | db | timer
set -euo pipefail
cd "$(dirname "$0")/../../.."          # unit root = tools/hardware-price-scraper
PY=.venv/bin/python
export PYTHONDONTWRITEBYTECODE=1

case "${1:-}" in
  setup)   # idempotent: venv + deps (system python refuses pip installs, PEP 668)
    [ -x "$PY" ] || python3 -m venv .venv
    .venv/bin/pip install -q -r requirements.txt pytest
    $PY -c "import requests,bs4,pymysql,pytest;print('deps ok')" ;;
  test)    # offline unit tests; MariaDB ones use a scratch table and skip if the server is down
    $PY -m pytest -q tests ;;
  scrape)  # live scrape of ONE query into a scratch dir: never touches real history or MariaDB
    q="${2:?query}"; cat="${3:-gpu}"; shift 3 2>/dev/null || shift $#
    out=$(mktemp -d /tmp/scrape-XXXXXX)
    site_args=(); for s in "$@"; do site_args+=(--site "$s"); done
    $PY scraper.py -q "$q" --category "$cat" "${site_args[@]}" --delay 4 --top 5 --no-mariadb --no-cache --out "$out"
    echo "scratch output: $out/latest.csv" ;;
  plan)    # build planner from the real SQLite history; extra args go to builder.py
    shift; $PY builder.py "$@" ;;
  db)      # what is in MariaDB hardware.prices
    mariadb hardware -e "SELECT COUNT(*) AS rows_total, COUNT(DISTINCT ts) AS runs, MIN(ts) AS first, MAX(ts) AS latest FROM prices; SELECT site, COUNT(*) AS rows_n, MIN(price) AS min_price, MAX(price) AS max_price FROM prices GROUP BY site ORDER BY rows_n DESC;" ;;
  timer)   # daily systemd user timer
    systemctl --user list-timers hardware-price-scraper.timer --no-pager --full | sed -n 1,2p
    journalctl --user -u hardware-price-scraper.service -n 3 --no-pager 2>/dev/null | cut -c1-160 || true ;;
  *) sed -n 2,3p "$0"; exit 2 ;;
esac
