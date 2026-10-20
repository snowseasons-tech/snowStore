#!/usr/bin/env bash
# One-time server setup for done-for-you clients: installs the Lead Pipeline and Blogen
# dependencies from this repo and creates managed/ops.env and managed/clients/.
#   managed/setup.sh
set -euo pipefail
M="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
R="$(dirname "$M")"

for c in python3 node npm flock timeout crontab; do
  command -v "$c" >/dev/null || { echo "Missing '$c'. Install it first (see managed/README.md)." >&2; exit 1; }
done

echo "Lead Pipeline: creating virtualenv and installing requirements..."
python3 -m venv "$R/Lead-Pipeline/.venv"
"$R/Lead-Pipeline/.venv/bin/pip" install -q -r "$R/Lead-Pipeline/requirements.txt"

echo "Blogen: installing node packages..."
(cd "$R/Blogen" && npm install --no-audit --no-fund)

mkdir -p "$M/clients"
chmod 700 "$M/clients"
if [[ ! -f "$M/ops.env" ]]; then
  cp "$M/ops.env.example" "$M/ops.env"
  chmod 600 "$M/ops.env"
  echo "Created managed/ops.env: add your RESEND_API_KEY and MAIL_FROM."
fi
echo "Done. Add a client with: managed/new-client.sh <client-id> lead|blog"
