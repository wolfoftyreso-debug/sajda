#!/usr/bin/env sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 /path/to/self-hosted-supabase /secure/backup/directory" >&2
  exit 64
fi

self_host_dir=$(cd "$1" && pwd)
backup_dir=$2
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_dir"

cd "$self_host_dir"
docker compose exec -T db pg_dump --format=custom --no-owner --no-privileges -U postgres postgres > "$backup_dir/name-quest-$timestamp.dump"
sha256sum "$backup_dir/name-quest-$timestamp.dump" > "$backup_dir/name-quest-$timestamp.dump.sha256"
echo "Created $backup_dir/name-quest-$timestamp.dump"
