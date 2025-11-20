#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
rule_esc=$(json_escape "$rule")
ruleDir="$BASE/.orl/diagnostics/rules/$rule_esc"
mkdir -p "$ruleDir" || true

# Function to extract resource content hash (for comparison)
get_resource_hash() {
  file_path="$1"
  start_line="$2"
  end_line="$3"
  if [ ! -f "$file_path" ] || [ $start_line -le 0 ] || [ $end_line -lt $start_line ]; then
    echo ""
    return 0
  fi
  sed -n "${start_line},${end_line}p" "$file_path" 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1 || echo ""
}

# Function to extract Terraform resource instances from a file
# Outputs JSON array of resources with content hash: [{"type":"...","name":"...","startLine":N,"endLine":M,"hash":"..."}]
extract_resources() {
  file_path="$1"
  if [ ! -f "$file_path" ]; then return 0; fi
  
  # Only process Terraform files
  case "$file_path" in
    *.tf) ;;
    *) return 0 ;;
  esac
  
  line_num=0
  in_resource=0
  resource_type=""
  resource_name=""
  resource_start=0
  brace_depth=0
  
  while IFS= read -r line || [ -n "$line" ]; do
    line_num=$((line_num + 1))
    
    # Check for resource definition: resource "type" "name" {
    if echo "$line" | grep -qE '^[[:space:]]*resource[[:space:]]+"[^"]+"[[:space:]]+"[^"]+"[[:space:]]*\{'; then
      # Extract type and name (using basic sed for compatibility)
      resource_type=$(echo "$line" | sed -n 's/.*resource[[:space:]]*"\([^"]*\)".*/\1/p')
      resource_name=$(echo "$line" | sed -n 's/.*resource[[:space:]]*"[^"]*"[[:space:]]*"\([^"]*\)".*/\1/p')
      resource_start=$line_num
      in_resource=1
      brace_depth=1
      continue
    fi
    
    # If we're in a resource block, track braces
    if [ $in_resource -eq 1 ]; then
      # Count opening and closing braces on this line
      open_braces=$(echo "$line" | tr -cd '{' | wc -c)
      close_braces=$(echo "$line" | tr -cd '}' | wc -c)
      brace_depth=$((brace_depth + open_braces - close_braces))
      
      # If brace depth reaches 0, we've found the end of the resource
      if [ $brace_depth -le 0 ]; then
        # Get content hash for comparison
        content_hash=$(get_resource_hash "$file_path" "$resource_start" "$line_num")
        # Output the resource as JSON (with newline for line-by-line reading)
        type_esc=$(json_escape "$resource_type")
        name_esc=$(json_escape "$resource_name")
        printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":"%s"}\n' "$type_esc" "$name_esc" "$resource_start" "$line_num" "$content_hash"
        in_resource=0
        resource_type=""
        resource_name=""
        resource_start=0
        brace_depth=0
      fi
    fi
  done < "$file_path"
}

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

