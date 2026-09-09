param(
  [Parameter(Mandatory = $true)]
  [string]$SelfHostedDirectory
)

$ErrorActionPreference = 'Stop'
$selfHost = (Resolve-Path -LiteralPath $SelfHostedDirectory).Path
$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\supabase\functions')).Path
$target = Join-Path $selfHost 'volumes\functions'

if (-not (Test-Path -LiteralPath (Join-Path $selfHost 'docker-compose.yml'))) {
  throw "No official self-hosted Supabase docker-compose.yml found in $selfHost"
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $_.Name) -Recurse -Force
}

Push-Location $selfHost
try {
  docker compose up -d --force-recreate functions
  docker compose ps functions
} finally {
  Pop-Location
}
