#!/bin/sh
# Create the session and encryption secrets when Dokploy did not supply them.
# They are stored on the data volume so the next start uses the same values.
set -eu

data_dir="${DATA_DIR:-/data}"
mkdir -p "$data_dir"

ensure_secret() {
  key="$1"
  file="$2"
  bytes="$3"
  eval "current=\${$key-}"
  if [ -n "$current" ]; then
    printf '%s' "$current" > "$file"
    chmod 600 "$file"
    return
  fi
  if [ -s "$file" ]; then
    current=$(cat "$file")
    export "$key=$current"
    return
  fi
  current=$(node -e "process.stdout.write(require('crypto').randomBytes(${bytes}).toString('base64'))")
  printf '%s' "$current" > "$file"
  chmod 600 "$file"
  export "$key=$current"
  echo "[creditos] ${key} was not set. Generated one and saved it on the data volume."
}

ensure_secret NUXT_SESSION_PASSWORD "$data_dir/session-password" 48
ensure_secret APP_ENCRYPTION_KEY "$data_dir/encryption-key" 32

exec "$@"
