#!/bin/sh
# Common functions shared across hook scripts
# This file is sourced by other hook scripts to avoid code duplication
#
# Note: This file assumes json_escape() is defined in the calling script.
# All hook scripts that source this file must define json_escape() before sourcing.

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
# Outputs JSON objects (one per line) with: {"type":"...","name":"...","startLine":N,"endLine":M,"hash":"..."}
# Usage: extract_resources "file_path"
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

