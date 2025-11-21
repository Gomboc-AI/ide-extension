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

# NOTE: Hash comparison cannot be done here because ORL flushes files to disk
# AFTER this hook returns. Files are still in memory (AST) when this hook runs.
# Hash comparison will be done in the IDE extension after ORL completes and
# files are flushed. The workaround data from post_remediate_rule_finding.sh
# will be used until then.

# Aggregate per-rule JSON files into final diagnostics
rulesDir="$BASE/.orl/diagnostics/rules"

# Use a subshell with error handling to prevent script failure
(
  set +e  # Disable exit on error in subshell
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
    # Validate JSON before including it
    if ! jq empty "$f" 2>/dev/null; then
      # Invalid JSON - skip this file
      continue
    fi
    if [ $first -eq 0 ]; then printf ','; fi
    first=0
    cat "$f" 2>/dev/null || true
  done
  printf ']}\n'
) > "$aggregate.tmp" 2>/dev/null || printf '{"version":1,"generatedAt":"%s","rules":[]}\n' "$(timestamp)" > "$aggregate.tmp"

# Validate the aggregated JSON before finalizing
if [ -s "$aggregate.tmp" ] && jq empty "$aggregate.tmp" 2>/dev/null; then
  mv "$aggregate.tmp" "$aggregate" 2>/dev/null || cp "$aggregate.tmp" "$aggregate" || true
else
  # Fallback: create minimal valid diagnostics.json
  printf '{"version":1,"generatedAt":"%s","rules":[]}\n' "$(timestamp)" > "$aggregate"
  rm -f "$aggregate.tmp" 2>/dev/null || true
fi

