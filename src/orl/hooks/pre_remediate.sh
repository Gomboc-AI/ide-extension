#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics/rules" "$BASE/.orl/diag/rules"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
: > "$manifest"
rules="${1:-0}"; workspaces="${2:-0}"
case "$rules" in ''|*[!0-9]*) rules=0;; esac
case "$workspaces" in ''|*[!0-9]*) workspaces=0;; esac
printf '{"event":"pre_remediate","rules":%s,"workspaces":%s,"time":"%s"}\n' "$rules" "$workspaces" "$(timestamp)" >> "$manifest"

