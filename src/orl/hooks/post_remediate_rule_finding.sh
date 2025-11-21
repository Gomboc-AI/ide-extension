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

# Read before snapshot
before_json="$ruleDir/resources_before.json"
modified_json="$ruleDir/resources_modified.json"
current_json="$ruleDir/resources_after.json"

# IMPORTANT: Files are not yet flushed to disk when this hook runs.
# ORL modifies files in memory (AST) and only flushes after all rules complete.
# So we can't read the modified files from disk - they still have old content.
# 
# SOLUTION: Since we know this rule touched certain files (from files_csv),
# we'll mark ALL resources in those files as potentially modified.
# This is less precise than hash comparison, but it's the best we can do without
# access to the modified content. The IDE extension can then use diff content
# analysis for more precise attribution.
#
# We use resources_before.json to get the list of resources in each file,
# and mark them all as modified since the rule touched that file.

# Mark all resources in files touched by this rule as potentially modified
# Debug: Log what we have
echo "DEBUG: before_json exists: $([ -f "$before_json" ] && echo 'yes' || echo 'no')" >> "$ruleDir/debug.log" 2>&1 || true
echo "DEBUG: files_csv: '$files_csv'" >> "$ruleDir/debug.log" 2>&1 || true
echo "DEBUG: jq available: $(command -v jq >/dev/null 2>&1 && echo 'yes' || echo 'no')" >> "$ruleDir/debug.log" 2>&1 || true

if [ -f "$before_json" ] && [ -n "$files_csv" ] && command -v jq >/dev/null 2>&1; then
  # Extract file paths from CSV
  OLDIFS=$IFS
  IFS=','; set -- $files_csv; IFS=$OLDIFS
  
  # Build JSON object with all resources from files that were touched
  printf '{' > "$modified_json.tmp" || true
  first_file=1
  
  for file_path in "$@"; do
    file_path=$(printf '%s' "$file_path" | sed -e 's/^ *//' -e 's/ *$//')
    [ -z "$file_path" ] && continue
    
    # Normalize path
    if [ "${file_path#/workspace/}" != "$file_path" ]; then
      normalized_path="${file_path#/workspace/}"
    elif [ "${file_path#./}" != "$file_path" ]; then
      normalized_path="${file_path#./}"
    else
      normalized_path="$file_path"
    fi
    
    echo "DEBUG: Processing file: '$normalized_path'" >> "$ruleDir/debug.log" 2>&1 || true
    
    # Get resources for this file from before_json (all resources in this file)
    resources=$(jq -r --arg file "$normalized_path" '.[$file] // []' "$before_json" 2>>"$ruleDir/debug.log" || echo "[]")
    
    echo "DEBUG: Resources found: $(echo "$resources" | wc -c) bytes" >> "$ruleDir/debug.log" 2>&1 || true
    
    if [ "$resources" != "[]" ] && [ -n "$resources" ]; then
      if [ $first_file -eq 0 ]; then printf ',' >> "$modified_json.tmp" || true; fi
      first_file=0
      file_esc=$(json_escape "$normalized_path")
      printf '"%s":%s' "$file_esc" "$resources" >> "$modified_json.tmp" || true
    fi
  done
  
  printf '}\n' >> "$modified_json.tmp" || true
  
  echo "DEBUG: Temp file size: $(wc -c < "$modified_json.tmp" 2>/dev/null || echo 0)" >> "$ruleDir/debug.log" 2>&1 || true
  
  # Validate JSON and move to final location
  if [ -s "$modified_json.tmp" ] && jq empty "$modified_json.tmp" 2>>"$ruleDir/debug.log"; then
    mv "$modified_json.tmp" "$modified_json" 2>/dev/null || cp "$modified_json.tmp" "$modified_json" || true
    echo "DEBUG: Successfully created resources_modified.json" >> "$ruleDir/debug.log" 2>&1 || true
  else
    echo "DEBUG: JSON validation failed or file empty" >> "$ruleDir/debug.log" 2>&1 || true
    printf '{}\n' > "$modified_json"
    rm -f "$modified_json.tmp" 2>/dev/null || true
  fi
else
  # Fallback: output empty
  echo "DEBUG: Condition failed - using fallback" >> "$ruleDir/debug.log" 2>&1 || true
  printf '{}\n' > "$modified_json" || true
fi

# NOTE: Hash comparison cannot work here because ORL hasn't flushed files to disk yet.
# Files are modified in memory (AST) and only flushed after all rules complete.
# The workaround above (marking all resources in touched files) provides resource instance
# data for the IDE extension, which then uses diff content analysis for precise attribution.

