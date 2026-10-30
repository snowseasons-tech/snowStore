#!/usr/bin/env bash
# Manage one subscriber's private Social Studio.
#   hosted/subscriber.sh create <id> <max-accounts>   create and start it; prints SETUP_LINK=...
#   hosted/subscriber.sh limit  <id> <max-accounts>   change the plan's account limit
#   hosted/subscriber.sh stop   <id>                  stop it and keep the data
#   hosted/subscriber.sh start  <id>                  start it again
#   hosted/subscriber.sh delete <id> --yes            delete the server and all its data
set -euo pipefail
H="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
DATA="${HOSTED_DATA:-$H/subscribers}"
OPS="${HOSTED_OPS:-$H/ops.env}"
[[ -f "$OPS" ]] || { echo "$OPS is missing; copy ops.env.example" >&2; exit 1; }
set -a; . "$OPS"; set +a

cmd="${1:-}"; id="${2:-}"; arg="${3:-}"
[[ "$id" =~ ^[a-z0-9]{6,40}$ ]] || { echo "usage: see the top of $0" >&2; exit 2; }
dir="$DATA/$id"
dc() { SUBSCRIBER_ENV="$dir/.env" docker compose -p "ss-$id" --env-file "$dir/.env" -f "$H/compose.yml" "$@"; }
reload() { ${CADDY_RELOAD:-caddy reload --config /etc/caddy/Caddyfile}; }
need_limit() { [[ "$arg" =~ ^[1-9][0-9]*$ ]] || { echo "max-accounts must be a positive number" >&2; exit 2; }; }
need_dir() { [[ -d "$dir" ]] || { echo "no subscriber $id" >&2; exit 1; }; }

case "$cmd" in
  create)
    need_limit
    [[ -e "$dir" ]] && { echo "$dir already exists" >&2; exit 1; }
    umask 077
    mkdir -p "$DATA"
    port="$( (cat "$DATA"/*/.env 2>/dev/null || true) | sed -n 's/^PORT=//p' | sort -n | tail -1)"
    port="$(( ${port:-18000} + 1 ))"
    code="$(openssl rand -hex 24)"
    mkdir -p "$dir"
    {
      echo "IMAGE=$IMAGE"
      echo "PORT=$port"
      echo "SUBSCRIBER_ID=$id"
      echo "MAX_ACCOUNTS=$arg"
      echo "SETUP_CODE=$code"
      echo "ALLOW_REGISTRATION=0"
      echo "PUBLIC_URL=https://$id.$HOSTED_DOMAIN"
      echo "OAUTH_REDIRECT_URL=https://oauth.$HOSTED_DOMAIN"
      echo "MYSQL_PASSWORD=$(openssl rand -hex 24)"
      echo "MYSQL_ROOT_PASSWORD=$(openssl rand -hex 24)"
      echo "SECRET_KEY=$(openssl rand -hex 32)"
      echo "FERNET_KEY=$(openssl rand 32 | openssl base64 -A | tr '+/' '-_')"
      for key in META_APP_ID META_APP_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET LLM_BASE_URL LLM_MODEL LLM_API_KEY \
        SMTP_HOST SMTP_PORT SMTP_SECURITY SMTP_USERNAME SMTP_PASSWORD SMTP_FROM; do
        echo "$key=${!key:-}"
      done
    } > "$dir/.env"
    printf '%s.%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$id" "$HOSTED_DOMAIN" "$port" > "$dir/Caddyfile"
    dc up -d
    reload
    echo "SETUP_LINK=https://$id.$HOSTED_DOMAIN/?setup=$code"
    ;;
  limit)
    need_limit; need_dir
    sed -i "s/^MAX_ACCOUNTS=.*/MAX_ACCOUNTS=$arg/" "$dir/.env"
    dc up -d
    ;;
  stop)  need_dir; dc stop ;;
  start) need_dir; dc start ;;
  delete)
    need_dir
    [[ "$arg" == --yes ]] || { echo "delete needs --yes; this removes all of the subscriber's data" >&2; exit 2; }
    dc down -v
    rm -rf "$dir"
    reload
    ;;
  *) echo "usage: see the top of $0" >&2; exit 2 ;;
esac
