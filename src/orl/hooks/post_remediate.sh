#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
aggregate="$BASE/.orl/diagnostics/diagnostics.json"
rules="${1:-0}"
case "$rules" in ''|*[!0-9-]*) rules=0;; esac
printf '{"event":"post_remediate","rulesExecuted":%s,"time":"%s"}\n' "$rules" "$(timestamp)" >> "$manifest"
# Aggregate per-rule JSON files into final diagnostics
rulesDir="$BASE/.orl/diagnostics/rules"
{
  printf '{'
  printf '"version":1,'
  printf '"generatedAt":"%s",' "$(timestamp)"
  printf '"rules":['
  first=1
  for f in "$rulesDir"/*.json; do
    if [ ! -f "$f" ]; then continue; fi
    # Skip resource tracking files (they have / in the name)
    case "$f" in
      */resources_*.json) continue ;;
    esac
    if [ $first -eq 0 ]; then printf ','; fi
    first=0
    cat "$f"
  done
  printf ']}\n'
} > "$aggregate"

