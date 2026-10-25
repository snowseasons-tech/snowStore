#!/usr/bin/env bash
# Create a folder for a new done-for-you client.
#   managed/new-client.sh <client-id> lead|blog
# client-id: lowercase letters, digits and dashes, e.g. acme-plumbing
set -euo pipefail
M="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
R="$(dirname "$M")"

id="${1:-}"; service="${2:-}"
[[ "$id" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]] || { echo "usage: $0 <client-id> lead|blog  (id: a-z, 0-9, dashes)" >&2; exit 2; }
[[ "$service" == lead || "$service" == blog ]] || { echo "service must be 'lead' or 'blog'" >&2; exit 2; }
C="$M/clients/$id"
[[ -e "$C" ]] && { echo "$C already exists" >&2; exit 1; }

umask 077
mkdir -p "$C/logs"
if [[ "$service" == lead ]]; then run="15 2 * * *"; else run="0 6 * * 1"; fi
cat > "$C/client.env" <<EOF
# Settings for $id. Shell syntax: KEY="value".
CLIENT_NAME="$id"
SERVICE=$service
# Who receives the report (comma-separate several addresses).
REPORT_TO=""
# When the job runs and when the report is emailed (cron syntax, server time).
RUN_SCHEDULE="$run"
REPORT_SCHEDULE="0 8 * * 1"
EOF

if [[ "$service" == lead ]]; then
  mkdir -p "$C/data"
  cat > "$C/companies_queue.txt" <<'EOF'
# One company name per line. New names are searched on the next nightly run,
# then moved to companies_done.txt.
EOF
  cat >> "$C/client.env" <<'EOF'
# Optional pipeline tuning (see Lead-Pipeline/run_pipeline.sh), e.g.:
# SCRAPE_LIMIT=50
# SEARCH_REGION=us-en
EOF
else
  # Start from the Blogen example config, with output kept in this client's folder.
  node -e '
    const fs = require("fs"), [src, out, dir] = process.argv.slice(1);
    const cfg = JSON.parse(fs.readFileSync(src, "utf8"));
    cfg.outDir = dir + "/out";
    for (const t of cfg.topics || []) delete t.commentaryFile;
    fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + "\n");
  ' "$R/Blogen/sources.json" "$C/sources.json" "$C"
  cat >> "$C/client.env" <<'EOF'
# Extra blogen arguments, e.g. --publish ghost   (drafts unless you add --live)
BLOG_ARGS=""
# Publishing credentials, if the client gave you access:
# WP_USER=""
# WP_APP_PASSWORD=""
# GHOST_ADMIN_KEY=""
EOF
fi

echo "Created $C"
echo "Next:"
echo "  1. Edit $C/client.env (CLIENT_NAME, REPORT_TO, schedules)"
if [[ "$service" == lead ]]; then
  echo "  2. Add company names to $C/companies_queue.txt"
else
  echo "  2. Edit topics and sources in $C/sources.json"
fi
echo "  3. Test:     managed/run.sh $id$([[ $service == lead ]] && echo ' --dry-run')"
echo "              node managed/report.mjs $id --dry"
echo "  4. Schedule: managed/install-cron.sh $id"
