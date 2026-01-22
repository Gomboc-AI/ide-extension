#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\]/\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="${1:-unknown}"; prio="${2:-0}"; files_csv="${3:-}"
rule_esc=$(json_escape "$rule")
ruleDir="$BASE/.orl/diagnostics/rules/$rule_esc"
mkdir -p "$ruleDir" || true

# Read before snapshot
before_json="$ruleDir/resources_before.json"
modified_json="$ruleDir/resources_modified.json"
current_json="$ruleDir/resources_after.json"

# If ORL didn't provide any file list, there's nothing useful to write.
if [ -z "$files_csv" ]; then
  exit 0
fi

# Cheap early-exit: ORL can call this per finding; once we've written the file for this
# rule, there's no value in copying again.
if [ -s "$modified_json" ]; then
  exit 0
fi

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

# Mark all resources in files touched by this rule as potentially modified.
# PERFORMANCE NOTE:
# `resources_before.json` is already scoped to the files involved in this finding.
# Since we intentionally mark *all* resources in those files as potentially modified,
# we can copy the file directly instead of doing per-file `jq` lookups.
if [ -f "$before_json" ] && [ -n "$files_csv" ]; then
  cp "$before_json" "$modified_json" 2>/dev/null || cat "$before_json" > "$modified_json" 2>/dev/null || printf '{}\n' > "$modified_json"
else
  printf '{}\n' > "$modified_json" 2>/dev/null || true
fi

# NOTE: Hash comparison cannot work here because ORL hasn't flushed files to disk yet.
# Files are modified in memory (AST) and only flushed after all rules complete.
# The workaround above (marking all resources in touched files) provides resource instance
# data for the IDE extension, which then uses diff content analysis for precise attribution.

