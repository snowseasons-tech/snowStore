#!/usr/bin/env bash
# Run the storefront locally: `wrangler pages dev` on :8788 serving dist/ and functions/, backed by
# fake-upstash.mjs on :8790 and throwaway local values (never the repo's .env).
#   .claude/skills/run-snowstore/dev.sh start                  build dist/, start both servers, wait until ready
#   .claude/skills/run-snowstore/dev.sh check                  smoke-test the running site with curl
#   .claude/skills/run-snowstore/dev.sh seed-user <email> <ids> [password]   portal account (default password local-pass-123)
#   .claude/skills/run-snowstore/dev.sh keys                   dump everything the Functions wrote to the fake store
#   .claude/skills/run-snowstore/dev.sh stop
set -euo pipefail
SKILL_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SKILL_DIR/../../.." && pwd)
SITE_PORT=${SITE_PORT:-8788}
STORE_PORT=${STORE_PORT:-8790}
RUN=/tmp/snowstore-dev
WRANGLER=${WRANGLER:-"npx --yes wrangler@4.151.2"}
SITE="http://127.0.0.1:$SITE_PORT"
STORE="http://127.0.0.1:$STORE_PORT"
mkdir -p "$RUN"

# Local stand-ins for the production secrets. The bucket host doesn't exist: signed URLs are built locally and
# only need to look right (driver.mjs `stub r2.example.invalid` answers them in the browser).
BINDINGS=(
  "SITE_URL=$SITE"
  "UPSTASH_REDIS_REST_URL=$STORE"
  "UPSTASH_REDIS_REST_TOKEN=local-dev"
  "S3_ENDPOINT=https://r2.example.invalid"
  "S3_BUCKET=local-bucket"
  "S3_ACCESS_KEY_ID=local-key"
  "S3_SECRET_ACCESS_KEY=local-secret"
)

# Each server runs in its own process group (setsid), so stop can end npm -> wrangler -> workerd together.
# Killing only the port's listener leaves wrangler and workerd running and holding the inspector port 9229.
stop_group() {
  local f="$RUN/$1.pgid"
  [ -f "$f" ] || return 0
  local pgid; pgid=$(cat "$f")
  kill -- "-$pgid" 2>/dev/null || true
  for _ in $(seq 1 50); do kill -0 -- "-$pgid" 2>/dev/null || break; sleep 0.1; done
  kill -9 -- "-$pgid" 2>/dev/null || true
  rm -f "$f"
}
launch() { # name, then the command; records the process group id
  local name=$1; shift
  setsid "$@" > "$RUN/$name.log" 2>&1 < /dev/null &
  echo $! > "$RUN/$name.pgid"
}
wait_for() { # url, seconds, label
  for _ in $(seq 1 $(( $2 * 5 ))); do curl -sf -o /dev/null "$1" && return 0; sleep 0.2; done
  echo "$3 did not come up; see $RUN/$3.log" >&2
  tail -20 "$RUN/$3.log" >&2
  return 1
}

case "${1:-}" in
  start)
    "$0" stop
    (cd "$ROOT" && npm run build:pages > "$RUN/build.log")
    launch store node "$SKILL_DIR/fake-upstash.mjs" "$STORE_PORT"
    wait_for "$STORE/__keys" 10 store
    args=(); for b in "${BINDINGS[@]}"; do args+=(--binding "$b"); done
    # Without this, wrangler also loads the repo's real .env ("Using secrets defined in .env"); --env-file does
    # not replace it for `pages dev`.
    (cd "$ROOT" && export CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false && launch site $WRANGLER pages dev dist \
      --ip 127.0.0.1 --port "$SITE_PORT" --show-interactive-dev-session=false "${args[@]}")
    wait_for "$SITE/" 90 site
    echo "storefront: $SITE   fake store: $STORE   logs: $RUN/{site,store}.log"
    ;;
  stop)
    stop_group site
    stop_group store
    ;;
  check)
    fail=0
    t() { # label, expected, actual
      if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
    }
    t "home page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/")"
    t "home has kit form" 1 "$(curl -s "$SITE/" | grep -c 'id="kit-form"')"
    t "portal page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/storefront/portal")"
    t "kit rejects bad email" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/kit" -H 'Content-Type: application/json' -d '{"email":"nope"}')"
    t "kit signup returns signed URL" 1 "$(curl -s -X POST "$SITE/api/kit" -H 'Content-Type: application/json' -d '{"email":"smoke@example.com"}' | grep -c '"url":"https://r2.example.invalid/local-bucket/landing-page-kit/landing-page.html?X-Amz')"
    t "subscriber recorded" 1 "$(curl -s "$STORE/__keys" | grep -c 'subscriber:smoke@example.com')"
    t "me without session" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/api/me")"
    exit $fail
    ;;
  seed-user)
    [ $# -ge 3 ] || { echo "usage: $0 seed-user <email> <product,ids> [password]" >&2; exit 1; }
    printf '%s\n' "${4:-local-pass-123}" | (cd "$ROOT" && UPSTASH_REDIS_REST_URL="$STORE" UPSTASH_REDIS_REST_TOKEN=local-dev \
      node scripts/add-user.js "$2" "$3")
    echo
    ;;
  keys)
    curl -s "$STORE/__keys" | python3 -m json.tool
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
