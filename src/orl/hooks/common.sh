#!/bin/sh
# Common functions shared across hook scripts
# This file is sourced by other hook scripts to avoid code duplication
#
# Note: This file assumes json_escape() is defined in the calling script.
# All hook scripts that source this file must define json_escape() before sourcing.

# Function to extract resource content hash (for comparison)
# NOTE: Hash calculation is disabled for performance - files aren't flushed when hooks run,
# so hash comparison can't work effectively. Attribution uses startLine/endLine ranges instead.
get_resource_hash() {
  # Return empty hash - not used in attribution logic
  echo ""
}

# Function to extract resource instances from a file (Terraform or Dockerfile)
# Outputs JSON objects (one per line) with: {"type":"...","name":"...","startLine":N,"endLine":M,"hash":"..."}
# Usage: extract_resources "file_path"
# 
# For Terraform:
# - Handles multi-line resource declarations (resource "type" "name" { can span lines)
# - Skips full-line comments when counting braces (comments don't affect structure)
# - More robust brace counting
# For Dockerfiles:
# - Extracts FROM instructions (build stages) as resources
# - Each FROM instruction is treated as a resource with type "FROM" or "docker_stage"
extract_resources() {
  file_path="$1"
  if [ ! -f "$file_path" ]; then return 0; fi
  
  # Check file type and route to appropriate extraction function
  file_basename=$(basename "$file_path")
  # Check if it's a Terraform file
  case "$file_basename" in
    *.tf)
      extract_terraform_resources "$file_path"
      return 0
      ;;
  esac
  # Check if it's a Dockerfile (case-insensitive check on basename or full path)
  if echo "$file_basename" | grep -qiE '^(Dockerfile|.*\.dockerfile)$' || echo "$file_path" | grep -qiE 'Dockerfile'; then
    extract_dockerfile_resources "$file_path"
    return 0
  fi
  # Not a supported file type
  return 0
}

# Extract Terraform resources
extract_terraform_resources() {
  file_path="$1"
  
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
        # Output the resource as JSON (with newline for line-by-line reading)
        # Hash is omitted for performance - not used in attribution logic
        type_esc=$(json_escape "$resource_type")
        name_esc=$(json_escape "$resource_name")
        printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":""}\n' "$type_esc" "$name_esc" "$resource_start" "$line_num"
        in_resource=0
        resource_type=""
        resource_name=""
        resource_start=0
        brace_depth=0
      fi
    fi
  done < "$file_path"
}

# Extract Dockerfile resources (FROM instructions/stages)
# Each FROM instruction represents a build stage and is treated as a resource
extract_dockerfile_resources() {
  file_path="$1"
  if [ ! -f "$file_path" ]; then return 0; fi
  
  line_num=0
  last_from_line=0
  last_from_image=""
  last_from_stage=""
  total_lines=$(wc -l < "$file_path" 2>/dev/null || echo "0")
  
  while IFS= read -r line || [ -n "$line" ]; do
    line_num=$((line_num + 1))
    trimmed_line=$(echo "$line" | sed 's/^[[:space:]]*//')
    
    # Skip comments and empty lines
    case "$trimmed_line" in
      \#*|"") continue ;;
    esac
    
    # Check for FROM instruction (case-insensitive)
    if echo "$trimmed_line" | grep -qiE '^FROM[[:space:]]+'; then
      # If we have a previous FROM, output it as a resource
      if [ $last_from_line -gt 0 ]; then
        # End line is the line before this FROM (or end of file if this is the last)
        end_line=$((line_num - 1))
        if [ $end_line -lt $last_from_line ]; then
          end_line=$last_from_line
        fi
        type_esc=$(json_escape "docker_stage")
        name_esc=$(json_escape "${last_from_stage:-${last_from_image:-FROM}}")
        printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":""}\n' "$type_esc" "$name_esc" "$last_from_line" "$end_line"
      fi
      
      # Extract image name and optional stage name (AS alias)
      # FROM image:tag AS stage_name
      # FROM image:tag
      last_from_line=$line_num
      # Extract image (everything after FROM until AS or end of line)
      last_from_image=$(echo "$trimmed_line" | sed -n 's/^[Ff][Rr][Oo][Mm][[:space:]]\+\([^[:space:]]*\).*/\1/p' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
      # Extract stage name if AS is present
      last_from_stage=$(echo "$trimmed_line" | sed -n 's/.*[Aa][Ss][[:space:]]\+\([^[:space:]]*\).*/\1/p' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
      # If no stage name, use image name as identifier
      if [ -z "$last_from_stage" ]; then
        last_from_stage="$last_from_image"
      fi
    fi
  done < "$file_path"
  
  # Output the last FROM instruction if it exists
  if [ $last_from_line -gt 0 ]; then
    end_line=$total_lines
    type_esc=$(json_escape "docker_stage")
    name_esc=$(json_escape "${last_from_stage:-${last_from_image:-FROM}}")
    printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":""}\n' "$type_esc" "$name_esc" "$last_from_line" "$end_line"
  fi
}

