#!/usr/bin/env bash
# Stop a client's scheduled jobs, and optionally delete their data (the Terms promise deletion
# within 30 days after a service ends).
#   managed/remove-client.sh <client-id>                 remove cron jobs only
#   managed/remove-client.sh <client-id> --delete-data   also delete the client folder (asks first)
set -euo pipefail
M="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
id="${1:-}"; C="$M/clients/$id"
[[ "$id" =~ ^[a-z0-9][a-z0-9-]{1,40}$ && -d "$C" ]] || { echo "usage: $0 <client-id> [--delete-data]" >&2; exit 2; }

tag="# managed:$id"
{ crontab -l 2>/dev/null | grep -vF "$tag" || true; } | crontab -
echo "Removed cron jobs for $id."

if [[ "${2:-}" == "--delete-data" ]]; then
  read -r -p "Permanently delete $C (inputs, reports, logs, credentials)? Type the client id to confirm: " answer
  [[ "$answer" == "$id" ]] || { echo "Not deleted."; exit 1; }
  rm -rf -- "$C"
  echo "Deleted $C."
else
  echo "Data kept in $C. Delete it within 30 days with: $0 $id --delete-data"
fi
