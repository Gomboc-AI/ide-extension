#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
rule="${1:-unknown}"; prio="${2:-0}"
case "$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=$(json_escape "$rule")
printf '{"event":"pre_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\n' "$rule_esc" "$prio" "$(timestamp)" >> "$manifest"
# Snapshot current workspace for this rule's baseline
snapDir="$BASE/.orl/diag/rules/$rule_esc/before"
mkdir -p "$snapDir"
# Copy only IaC files; preserve directory structure
cd "$BASE"
find . -type d -name ".orl" -prune -o -type f \( -name "*.tf" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \) -print | while IFS= read -r f; do
  # Remove leading ./ from path
  rel_path=$(echo "$f" | sed 's|^\./||')
  dest="$snapDir/$rel_path"
  mkdir -p "$(dirname "$dest")"
  cp "$f" "$dest" 2>/dev/null || true
done

