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
# 
# Improvements:
# - Handles multi-line resource declarations (resource "type" "name" { can span lines)
# - Skips full-line comments when counting braces (comments don't affect structure)
# - More robust brace counting
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
  pending_resource=0
  pending_start=0
  pending_line=""
  
  while IFS= read -r line || [ -n "$line" ]; do
    line_num=$((line_num + 1))
    
    # Check if line is a full-line comment (starts with # after optional whitespace)
    is_comment=0
    trimmed_line=$(echo "$line" | sed 's/^[[:space:]]*//')
    case "$trimmed_line" in
      \#*) is_comment=1 ;;
    esac
    
    # If we're accumulating a multi-line resource declaration
    if [ $pending_resource -eq 1 ]; then
      # Accumulate lines until we find the opening brace
      pending_line="$pending_line $line"
      if echo "$line" | grep -qE '\{'; then
        # Found opening brace - extract type and name from accumulated text
        resource_type=$(echo "$pending_line" | sed -n 's/.*resource[[:space:]]*"\([^"]*\)".*/\1/p')
        resource_name=$(echo "$pending_line" | sed -n 's/.*resource[[:space:]]*"[^"]*"[[:space:]]*"\([^"]*\)".*/\1/p')
        resource_start=$pending_start
        in_resource=1
        brace_depth=1
        pending_resource=0
        pending_line=""
        # Continue to brace counting below (don't skip this line)
      else
        # Still accumulating, skip to next line
        continue
      fi
    fi
    
    # Check for resource definition start (single-line or start of multi-line)
    if [ $in_resource -eq 0 ] && [ $pending_resource -eq 0 ]; then
      # Check if line contains "resource" keyword
      if echo "$line" | grep -qE '[[:space:]]*resource[[:space:]]+'; then
        # Check if it's a complete single-line declaration with opening brace
        if echo "$line" | grep -qE '^[[:space:]]*resource[[:space:]]+"[^"]+"[[:space:]]+"[^"]+"[[:space:]]*\{'; then
          # Single-line: resource "type" "name" {
          resource_type=$(echo "$line" | sed -n 's/.*resource[[:space:]]*"\([^"]*\)".*/\1/p')
          resource_name=$(echo "$line" | sed -n 's/.*resource[[:space:]]*"[^"]*"[[:space:]]*"\([^"]*\)".*/\1/p')
          resource_start=$line_num
          in_resource=1
          brace_depth=1
          continue
        else
          # Multi-line: start accumulating (resource "type" "name" on this line, { on later line)
          pending_resource=1
          pending_start=$line_num
          pending_line="$line"
          continue
        fi
      fi
    fi
    
    # If we're in a resource block, track braces (skip full-line comments)
    if [ $in_resource -eq 1 ] && [ $is_comment -eq 0 ]; then
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

