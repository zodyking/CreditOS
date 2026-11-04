#!/bin/sh
# Dokploy's Environment tab supplies POSTGRES_USER, POSTGRES_PASSWORD and
# POSTGRES_DB. This turns those fields into DATABASE_URL (with the password
# URL-encoded) whenever the compose file pointed us at a database host.
# `pnpm dev` never sets POSTGRES_HOST, so an explicit DATABASE_URL is kept.
set -eu
if [ -n "${POSTGRES_PASSWORD:-}" ] && [ -n "${POSTGRES_HOST:-}" ]; then
  DATABASE_URL="$(node -e '
    const u = new URL("postgresql://localhost");
    u.username = process.env.POSTGRES_USER || "creditos";
    u.password = process.env.POSTGRES_PASSWORD;
    u.hostname = process.env.POSTGRES_HOST;
    u.port = process.env.POSTGRES_PORT || "5432";
    u.pathname = "/" + (process.env.POSTGRES_DB || "creditos");
    process.stdout.write(u.href);
  ')"
  export DATABASE_URL
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "creditos: set POSTGRES_PASSWORD, POSTGRES_USER and POSTGRES_DB in the Dokploy Environment tab, or set DATABASE_URL." >&2
  exit 1
fi
exec "$@"
