#!/usr/bin/env bash
# Run one client's job (cron calls this). Emails an alert to OPS_EMAIL if the job fails.
#   managed/run.sh <client-id> [extra args]
# Extra args go to the underlying tool, e.g. --dry-run for the lead pipeline or --dry for blogen.
set -uo pipefail
M="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
R="$(dirname "$M")"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"   # cron's PATH is minimal

id="${1:-}"; shift || true
C="$M/clients/$id"
[[ -n "$id" && -f "$C/client.env" ]] || { echo "usage: $0 <client-id>  (no client '$id')" >&2; exit 2; }
set -a
[[ -f "$M/ops.env" ]] && . "$M/ops.env"
. "$C/client.env"
set +a

case "$SERVICE" in
  lead)
    # The pipeline handles its own lock, logs and timeouts; point every path at this client.
    DATA_DIR="$C/data" QUEUE_FILE="$C/companies_queue.txt" DONE_FILE="$C/companies_done.txt" \
    LOG_DIR="$C/logs" LOCK_FILE="$C/.run.lock" PROJECT_DIR="$R/Lead-Pipeline" \
      "$R/Lead-Pipeline/run_pipeline.sh" "$@"
    rc=$?
    ;;
  blog)
    mkdir -p "$C/logs"
    exec 9>"$C/.run.lock"
    flock -n 9 || { echo "$id: previous run still active, skipping" >&2; exit 0; }
    read -ra extra <<< "${BLOG_ARGS:-}"
    log="$C/logs/blog_$(date +%F_%H%M%S).log"
    (cd "$R/Blogen" && timeout "${BLOGEN_TIMEOUT:-2h}" node blogen.mjs --config "$C/sources.json" "${extra[@]}" "$@") >"$log" 2>&1
    rc=$?
    find "$C/logs" -name 'blog_*.log' -mtime +30 -delete 2>/dev/null
    (( rc == 0 )) || tail -n 20 "$log" >&2
    ;;
  *) echo "$id: SERVICE must be lead or blog (got '$SERVICE')" >&2; exit 2 ;;
esac

if (( rc != 0 )); then
  node "$M/report.mjs" --alert "$id" "$SERVICE job failed (exit code $rc). Logs: $C/logs"
fi
exit "$rc"
