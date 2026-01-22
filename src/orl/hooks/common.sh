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
  if [ ! -f "$file_path" ]; then return 0; fi

  # Performance: use a single awk pass (avoid spawning sed/grep/tr/wc per line).
  # Output must remain JSONL with: {"type":"...","name":"...","startLine":N,"endLine":M,"hash":""}
  awk '
    function json_escape(s,    t) {
      t = s
      gsub(/\\/, "\\\\", t)
      gsub(/"/, "\\\"", t)
      return t
    }
    function count_char(s, c,    t) {
      t = s
      return gsub(c, "", t)
    }

    BEGIN {
      in_resource = 0
      brace_depth = 0
      resource_type = ""
      resource_name = ""
      resource_start = 0
      pending = 0
      pending_type = ""
      pending_name = ""
      pending_start = 0
    }

    {
      line = $0
      # full-line comment?
      trimmed = line
      sub(/^[ \t\r\n]+/, "", trimmed)
      is_comment = (trimmed ~ /^#/)

      if (!in_resource && pending) {
        # waiting for opening brace of multi-line resource decl
        if (line ~ /\{/) {
          in_resource = 1
          resource_type = pending_type
          resource_name = pending_name
          resource_start = pending_start
          brace_depth = count_char(line, /\{/) - count_char(line, /\}/)
          if (brace_depth <= 0) brace_depth = 1
          pending = 0
        }
        next
      }

      if (!in_resource && !pending) {
        # resource "type" "name" {   (single line)
        if (match(line, /^[ \t]*resource[ \t]+\"([^\"]+)\"[ \t]+\"([^\"]+)\"[ \t]*\{/, m)) {
          in_resource = 1
          resource_type = m[1]
          resource_name = m[2]
          resource_start = NR
          brace_depth = count_char(line, /\{/) - count_char(line, /\}/)
          if (brace_depth <= 0) brace_depth = 1
          next
        }
        # resource "type" "name"    (multi-line decl; brace on later line)
        if (match(line, /^[ \t]*resource[ \t]+\"([^\"]+)\"[ \t]+\"([^\"]+)\"/, m)) {
          pending = 1
          pending_type = m[1]
          pending_name = m[2]
          pending_start = NR
          next
        }
      }

      if (in_resource && !is_comment) {
        brace_depth += count_char(line, /\{/) - count_char(line, /\}/)
        if (brace_depth <= 0) {
          printf("{\"type\":\"%s\",\"name\":\"%s\",\"startLine\":%d,\"endLine\":%d,\"hash\":\"\"}\n",
            json_escape(resource_type),
            json_escape(resource_name),
            resource_start,
            NR
          )
          in_resource = 0
          brace_depth = 0
          resource_type = ""
          resource_name = ""
          resource_start = 0
        }
      }
    }
  ' "$file_path" 2>/dev/null || true
}

# Extract Dockerfile resources (FROM instructions/stages)
# Each FROM instruction represents a build stage and is treated as a resource
extract_dockerfile_resources() {
  file_path="$1"
  if [ ! -f "$file_path" ]; then return 0; fi
  
  # Performance: single awk pass.
  awk '
    function json_escape(s,    t) {
      t = s
      gsub(/\\/, "\\\\", t)
      gsub(/"/, "\\\"", t)
      return t
    }

    BEGIN {
      IGNORECASE = 1
      last_from_line = 0
      last_from_name = ""
    }

    function flush(prev_end,    nm) {
      if (last_from_line <= 0) return
      nm = (last_from_name != "" ? last_from_name : "FROM")
      printf("{\"type\":\"%s\",\"name\":\"%s\",\"startLine\":%d,\"endLine\":%d,\"hash\":\"\"}\n",
        "docker_stage",
        json_escape(nm),
        last_from_line,
        prev_end
      )
    }

    {
      line = $0
      trimmed = line
      sub(/^[ \t\r\n]+/, "", trimmed)
      # Skip comments/empty
      if (trimmed == "" || trimmed ~ /^#/) next

      if (trimmed ~ /^FROM[ \t]+/) {
        # If we have a previous stage, emit it ending on the previous line
        if (last_from_line > 0) {
          end_line = NR - 1
          if (end_line < last_from_line) end_line = last_from_line
          flush(end_line)
        }

        last_from_line = NR
        last_from_name = ""

        # Parse: FROM [--platform=...] image[:tag] [AS stage]
        # Tokenize on whitespace
        n = split(trimmed, tok, /[ \t]+/)
        img = ""
        stage = ""
        # Find first token after FROM that is not a --flag
        for (i = 2; i <= n; i++) {
          if (tok[i] ~ /^--/) continue
          img = tok[i]
          break
        }
        # Find AS stage
        for (j = 2; j <= n - 1; j++) {
          if (tok[j] == "AS") {
            stage = tok[j+1]
            break
          }
        }
        if (stage != "") last_from_name = stage
        else if (img != "") last_from_name = img
      }
    }

    END {
      if (last_from_line > 0) {
        flush(NR)
      }
    }
  ' "$file_path" 2>/dev/null || true
}

