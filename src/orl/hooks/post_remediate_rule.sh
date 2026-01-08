#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
case "$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=$(json_escape "$rule")
printf '{"event":"post_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\n' "$rule_esc" "$prio" "$(timestamp)" >> "$manifest" || true

# Split an ORL-provided file list into individual paths.
# ORL sometimes passes a comma-separated list, but we've also observed it passing
# a whitespace-separated list (e.g. "a.tf b.tf c.tf"). We normalize both.
split_files() {
  input="$1"
  [ -z "$input" ] && return 0
  # If it has commas, treat commas as separators; otherwise split on whitespace.
  if printf '%s' "$input" | grep -q ','; then
    printf '%s' "$input" | tr ',' '\n'
  else
    # shellcheck disable=SC2001
    printf '%s' "$input" | tr ' \t\r\n' '\n'
  fi
}

# Build per-rule JSON with file paths and resource instances
rulesOut="$BASE/.orl/diagnostics/rules"
ruleDir="$rulesOut/$rule_esc"
mkdir -p "$rulesOut" "$ruleDir" || true

# Sanitize rule name for filename
rule_file=$(printf '%s' "$rule" | sed 's/[^a-zA-Z0-9._-]/_/g' | head -c 200)
ruleJson="$rulesOut/$rule_file.json"
ruleJsonTmp="$ruleJson.tmp"

# Read modified resources if available
modified_resources="$ruleDir/resources_modified.json"
if [ -f "$modified_resources" ] && command -v jq >/dev/null 2>&1; then
  # Include resource instances in the JSON
  printf '{"ruleName":"%s","priority":%s,"files":[' "$rule_esc" "$prio" > "$ruleJsonTmp" || true
  firstFile=1
  
  if [ -n "$files_csv" ]; then
    split_files "$files_csv" | while IFS= read -r p; do
      t=$(printf '%s' "$p" | sed -e 's/^ *//' -e 's/ *$//' || echo "")
      [ -z "$t" ] && continue
      
      # Normalize path
      if [ "${t#/workspace/}" != "$t" ]; then
        normalized_path="${t#/workspace/}"
      elif [ "${t#./}" != "$t" ]; then
        normalized_path="${t#./}"
      else
        normalized_path="$t"
      fi
      
      if [ "$firstFile" -eq 0 ]; then printf ',' >> "$ruleJsonTmp" || true; fi
      firstFile=0
      
      fileEsc=$(json_escape "$normalized_path")
      
      # Get resources for this file from modified_resources
      resources_json=$(jq -r --arg file "$normalized_path" '.[$file] // []' "$modified_resources" 2>/dev/null || echo "[]")
      
      printf '{"path":"%s","resources":%s}' "$fileEsc" "$resources_json" >> "$ruleJsonTmp" || true
    done
  fi
  printf ']}\n' >> "$ruleJsonTmp" || true
else
  # Fallback: no resource instances, just file paths
  printf '{"ruleName":"%s","priority":%s,"files":[' "$rule_esc" "$prio" > "$ruleJsonTmp" || true
  firstFile=1
  if [ -n "$files_csv" ]; then
    split_files "$files_csv" | while IFS= read -r p; do
      t=$(printf '%s' "$p" | sed -e 's/^ *//' -e 's/ *$//' || echo "")
      [ -z "$t" ] && continue
      if [ "$firstFile" -eq 0 ]; then printf ',' >> "$ruleJsonTmp" || true; fi
      firstFile=0
      fileEsc=$(printf '%s' "$t" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g' || echo "$t")
      printf '{"path":"%s","resources":[]}' "$fileEsc" >> "$ruleJsonTmp" || true
    done
  fi
  printf ']}\n' >> "$ruleJsonTmp" || true
fi

mv "$ruleJsonTmp" "$ruleJson" 2>/dev/null || cp "$ruleJsonTmp" "$ruleJson" || true

