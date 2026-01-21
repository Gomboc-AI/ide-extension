#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
rule_esc=$(json_escape "$rule")
ruleDir="$BASE/.orl/diagnostics/rules/$rule_esc"
mkdir -p "$ruleDir" || true

# Cheap early-exit: this hook runs per finding; avoid rebuilding resource snapshots
# if we've already built them for the same file list.
resources_json="$ruleDir/resources_before.json"
files_key="$ruleDir/files_key.txt"

split_files() {
  input="$1"
  [ -z "$input" ] && return 0
  if printf '%s' "$input" | grep -q ','; then
    printf '%s' "$input" | tr ',' '\n'
  else
    printf '%s' "$input" | tr ' \t\r\n' '\n'
  fi
}

normalize_orl_relpath() {
  p="$1"
  p=$(printf '%s' "$p" | sed -e 's/^ *//' -e 's/ *$//')
  [ -z "$p" ] && return 0
  if [ "${p#/workspace/}" != "$p" ]; then
    printf '%s' "${p#/workspace/}"
  elif [ "${p#./}" != "$p" ]; then
    printf '%s' "${p#./}"
  else
    printf '%s' "$p"
  fi
}

key_tmp="$files_key.tmp"
: > "$key_tmp" 2>/dev/null || true
if [ -n "$files_csv" ]; then
  split_files "$files_csv" | while IFS= read -r p; do
    rel=$(normalize_orl_relpath "$p")
    [ -n "$rel" ] && printf '%s\n' "$rel" >> "$key_tmp" || true
  done
fi

if [ -f "$resources_json" ] && [ -f "$files_key" ] && cmp -s "$files_key" "$key_tmp" 2>/dev/null; then
  rm -f "$key_tmp" 2>/dev/null || true
  exit 0
fi
mv "$key_tmp" "$files_key" 2>/dev/null || cp "$key_tmp" "$files_key" 2>/dev/null || true

# Source common functions (get_resource_hash, extract_resources)
# common.sh is in the same directory as this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

# Extract resources from all files with findings.
# PERFORMANCE NOTE:
# ORL can execute hundreds of rules, and many rules touch the same small set of files.
# Parsing resources is expensive (lots of shell+sed/grep per line), so we cache per-file
# extracted resources once per scan and reuse across rules.
cache_dir="$BASE/.orl/diagnostics/files"
mkdir -p "$cache_dir" || true

printf '{' > "$resources_json.tmp" || true
first_file=1

if [ -n "$files_csv" ]; then
  split_files "$files_csv" | while IFS= read -r file_path; do
    normalized_path=$(normalize_orl_relpath "$file_path")
    [ -z "$normalized_path" ] && continue
    full_path="$BASE/$normalized_path"
    if [ ! -f "$full_path" ]; then continue; fi

    # Compute/cache extracted resources for this file once per scan.
    # Cache key is a sanitized relative path.
    cache_key=$(printf '%s' "$normalized_path" | sed 's/[^a-zA-Z0-9._-]/_/g')
    cache_file="$cache_dir/$cache_key.jsonl"
    if [ ! -f "$cache_file" ]; then
      tmp="$cache_file.tmp"
      : > "$tmp" 2>/dev/null || true
      extract_resources "$full_path" > "$tmp" 2>/dev/null || true
      mv "$tmp" "$cache_file" 2>/dev/null || cp "$tmp" "$cache_file" || true
      rm -f "$tmp" 2>/dev/null || true
    fi
    
    if [ $first_file -eq 0 ]; then printf ',' >> "$resources_json.tmp" || true; fi
    first_file=0
    
    file_esc=$(json_escape "$normalized_path")
    printf '"%s":[' "$file_esc" >> "$resources_json.tmp" || true
    
    first_resource=1
    # Read cached resources line by line (each resource is on its own line)
    if [ -f "$cache_file" ]; then
      while IFS= read -r resource_json || [ -n "$resource_json" ]; do
        [ -z "$resource_json" ] && continue
        if [ $first_resource -eq 0 ]; then printf ',' >> "$resources_json.tmp" || true; fi
        first_resource=0
        printf '%s' "$resource_json" >> "$resources_json.tmp" || true
      done < "$cache_file" 2>/dev/null || true
    fi
    
    printf ']' >> "$resources_json.tmp" || true
  done
fi

printf '}\n' >> "$resources_json.tmp" || true
mv "$resources_json.tmp" "$resources_json" 2>/dev/null || cp "$resources_json.tmp" "$resources_json" || true

