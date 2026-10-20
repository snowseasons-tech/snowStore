#!/usr/bin/env bash
# Add (or refresh) a client's two cron jobs: the run and the report, using the schedules in client.env.
#   managed/install-cron.sh <client-id>
# Lines are tagged "# managed:<client-id>" so re-running replaces them and remove-client.sh can find them.
set -euo pipefail
M="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
id="${1:-}"; C="$M/clients/$id"
[[ -n "$id" && -f "$C/client.env" ]] || { echo "usage: $0 <client-id>" >&2; exit 2; }
set -a; . "$C/client.env"; set +a
[[ -n "${REPORT_TO:-}" ]] || { echo "Set REPORT_TO in $C/client.env first." >&2; exit 1; }
node="$(command -v node)"
tag="# managed:$id"
mkdir -p "$C/logs"
run_line="$RUN_SCHEDULE $M/run.sh $id >> $C/logs/cron.log 2>&1 $tag"
report_line="$REPORT_SCHEDULE $node $M/report.mjs $id >> $C/logs/cron.log 2>&1 $tag"
{ crontab -l 2>/dev/null | grep -vF "$tag" || true; echo "$run_line"; echo "$report_line"; } | crontab -
echo "Installed for $id:"
echo "  $run_line"
echo "  $report_line"
