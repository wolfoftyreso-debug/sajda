#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/self-hosted-supabase" >&2
  exit 64
fi

self_host_dir=$(cd "$1" && pwd)
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../../supabase/functions" && pwd)
target_dir="$self_host_dir/volumes/functions"

if [ ! -f "$self_host_dir/docker-compose.yml" ]; then
  echo "No official self-hosted Supabase docker-compose.yml found in $self_host_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"
cp -R "$source_dir"/. "$target_dir"/

cd "$self_host_dir"
docker compose up -d --force-recreate functions
docker compose ps functions
