#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/self-hosted-supabase" >&2
  exit 64
fi

self_host_dir=$(cd "$1" && pwd)
migration_file=$(CDPATH= cd -- "$(dirname -- "$0")/../../supabase/migrations" && pwd)/20260820173000_production_hardening.sql

if [ ! -f "$self_host_dir/docker-compose.yml" ]; then
  echo "No official self-hosted Supabase docker-compose.yml found in $self_host_dir" >&2
  exit 1
fi

cd "$self_host_dir"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration_file"
