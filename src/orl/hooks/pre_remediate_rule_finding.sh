#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
rule_esc=$(json_escape "$rule")
ruleDir="$BASE/.orl/diagnostics/rules/$rule_esc"
mkdir -p "$ruleDir" || true

# Source common functions (get_resource_hash, extract_resources)
# common.sh is in the same directory as this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

# Extract resources from all files with findings
resources_json="$ruleDir/resources_before.json"
printf '{' > "$resources_json.tmp" || true
first_file=1

if [ -n "$files_csv" ]; then
  OLDIFS=$IFS
  IFS=','; set -- $files_csv; IFS=$OLDIFS
  for file_path in "$@"; do
    file_path=$(printf '%s' "$file_path" | sed -e 's/^ *//' -e 's/ *$//')
    [ -z "$file_path" ] && continue
    
    # Normalize path (remove /workspace prefix if present, add if missing)
    if [ "${file_path#/workspace/}" != "$file_path" ]; then
      normalized_path="${file_path#/workspace/}"
    elif [ "${file_path#./}" != "$file_path" ]; then
      normalized_path="${file_path#./}"
    else
      normalized_path="$file_path"
    fi
    full_path="$BASE/$normalized_path"
    
    if [ ! -f "$full_path" ]; then continue; fi
    
    if [ $first_file -eq 0 ]; then printf ',' >> "$resources_json.tmp" || true; fi
    first_file=0
    
    file_esc=$(json_escape "$normalized_path")
    printf '"%s":[' "$file_esc" >> "$resources_json.tmp" || true
    
    first_resource=1
    # Extract resources and write to temp file (capture stderr for debugging)
    extract_resources "$full_path" > "$ruleDir/tmp_resources.txt" 2>"$ruleDir/tmp_resources.err" || true
    # Read resources line by line (each resource is on its own line)
    while IFS= read -r resource_json || [ -n "$resource_json" ]; do
      [ -z "$resource_json" ] && continue
      if [ $first_resource -eq 0 ]; then printf ',' >> "$resources_json.tmp" || true; fi
      first_resource=0
      printf '%s' "$resource_json" >> "$resources_json.tmp" || true
    done < "$ruleDir/tmp_resources.txt" 2>/dev/null || true
    rm -f "$ruleDir/tmp_resources.txt" "$ruleDir/tmp_resources.err" 2>/dev/null || true
    
    printf ']' >> "$resources_json.tmp" || true
  done
fi

printf '}\n' >> "$resources_json.tmp" || true
mv "$resources_json.tmp" "$resources_json" 2>/dev/null || cp "$resources_json.tmp" "$resources_json" || true

