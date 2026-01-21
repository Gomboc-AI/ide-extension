#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
case "$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=$(json_escape "$rule")
printf '{"event":"pre_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\n' "$rule_esc" "$prio" "$(timestamp)" >> "$manifest"

#
# Performance: build resource snapshots once per rule (not per finding),
# and skip work when the file list hasn't changed.
#
ruleDir="$BASE/.orl/diagnostics/rules/$rule_esc"
mkdir -p "$ruleDir" 2>/dev/null || true

# If ORL didn't provide any files for this rule, there's nothing to snapshot.
[ -z "$files_csv" ] && exit 0

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

files_key="$ruleDir/files_key.txt"
key_tmp="$files_key.tmp"
: > "$key_tmp" 2>/dev/null || true
if [ -n "$files_csv" ]; then
  split_files "$files_csv" | while IFS= read -r p; do
    rel=$(normalize_orl_relpath "$p")
    [ -n "$rel" ] && printf '%s\n' "$rel" >> "$key_tmp" || true
  done
fi

if [ -f "$files_key" ] && cmp -s "$files_key" "$key_tmp" 2>/dev/null; then
  rm -f "$key_tmp" 2>/dev/null || true
  exit 0
fi
mv "$key_tmp" "$files_key" 2>/dev/null || cp "$key_tmp" "$files_key" 2>/dev/null || true

# Source common functions (extract_resources)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

resources_json="$ruleDir/resources_before.json"
modified_json="$ruleDir/resources_modified.json"
cache_dir="$BASE/.orl/diagnostics/files"
mkdir -p "$cache_dir" 2>/dev/null || true

printf '{' > "$resources_json.tmp" 2>/dev/null || true
first_file=1

if [ -n "$files_csv" ]; then
  split_files "$files_csv" | while IFS= read -r file_path; do
    normalized_path=$(normalize_orl_relpath "$file_path")
    [ -z "$normalized_path" ] && continue
    full_path="$BASE/$normalized_path"
    [ -f "$full_path" ] || continue

    cache_key=$(printf '%s' "$normalized_path" | sed 's/[^a-zA-Z0-9._-]/_/g')
    cache_file="$cache_dir/$cache_key.jsonl"
    if [ ! -f "$cache_file" ]; then
      tmp="$cache_file.tmp"
      : > "$tmp" 2>/dev/null || true
      extract_resources "$full_path" > "$tmp" 2>/dev/null || true
      mv "$tmp" "$cache_file" 2>/dev/null || cp "$tmp" "$cache_file" 2>/dev/null || true
      rm -f "$tmp" 2>/dev/null || true
    fi

    if [ $first_file -eq 0 ]; then printf ',' >> "$resources_json.tmp" 2>/dev/null || true; fi
    first_file=0

    file_esc=$(json_escape "$normalized_path")
    printf '"%s":[' "$file_esc" >> "$resources_json.tmp" 2>/dev/null || true

    first_resource=1
    if [ -f "$cache_file" ]; then
      while IFS= read -r resource_json_line || [ -n "$resource_json_line" ]; do
        [ -z "$resource_json_line" ] && continue
        if [ $first_resource -eq 0 ]; then printf ',' >> "$resources_json.tmp" 2>/dev/null || true; fi
        first_resource=0
        printf '%s' "$resource_json_line" >> "$resources_json.tmp" 2>/dev/null || true
      done < "$cache_file" 2>/dev/null || true
    fi
    printf ']' >> "$resources_json.tmp" 2>/dev/null || true
  done
fi

printf '}\n' >> "$resources_json.tmp" 2>/dev/null || true
mv "$resources_json.tmp" "$resources_json" 2>/dev/null || cp "$resources_json.tmp" "$resources_json" 2>/dev/null || true

# Ensure resources_modified.json exists for post_remediate_rule.sh
if [ -f "$resources_json" ]; then
  cp "$resources_json" "$modified_json" 2>/dev/null || cat "$resources_json" > "$modified_json" 2>/dev/null || printf '{}\n' > "$modified_json"
else
  printf '{}\n' > "$modified_json" 2>/dev/null || true
fi

