# ORL File Flush Timing Analysis

## Execution Flow

Based on analysis of the ORL codebase:

### 1. `cmd/remediate.go` (lines 103-123)

```go
remediator := remediate.NewRemediator(wrksp, *ruleSpace, contexts, hookHandler)
report := remediator.Remediate(context.Background())  // Line 104

// ... after Remediate() returns ...

if GlobalConfig.Remediate.DryRun {
    // Output to stdout
} else {
    err := wrksp.Flush()  // Line 119 - Files written to disk HERE
}
```

### 2. `lib/remediate/remediate.go` (lines 91-112)

```go
func (r *Remediator) Remediate(ctx context.Context) report.Report {
    // ... apply all rules (files modified in memory/AST) ...

    hookDetails = r.hookHandler.RunHook(utils.PostRemediate, ...)  // Line 109
    // Hook runs HERE, then function returns

    return *topLevelReport  // Line 112
}
```

### 3. `lib/utils/hooks.go` (lines 157-196)

```go
func (h HookHandler) RunHook(hookName string, arguments ...string) *HookDetails {
    cmd := exec.CommandContext(h.ctx, path, arguments...)
    err := cmd.Run()  // Line 171 - Hook script runs synchronously
    // Hook script must complete before this returns
    return &HookDetails{...}
}
```

## Key Findings

1. **`PostRemediate` hook runs INSIDE `Remediate()` function** (line 109)
2. **`Flush()` is called AFTER `Remediate()` returns** (line 119 in cmd/remediate.go)
3. **Therefore: `PostRemediate` hook runs BEFORE files are flushed to disk**

## File State During Hook Execution

- **Files are modified in memory** (AST with `f.content []byte` updated)
- **Files on disk still have OLD content** (not yet flushed)
- **Hook scripts are shell scripts** (cannot access Go structs/memory)

## Implications for Hash Comparison

When `post_remediate.sh` runs:

- ✅ Can read `resources_before.json` (created earlier)
- ❌ Cannot read modified file content from disk (not flushed yet)
- ❌ Cannot access file content from AST (shell script limitation)
- ❌ Hash comparison will compare old disk content with old disk content (no changes detected)

## Solutions

### Option 1: Background Process (Unreliable)

- Hook starts background process that waits for files to flush
- Problem: Unreliable timing, process may be killed

### Option 2: IDE Extension Post-Processing (Reliable)

- Do hash comparison in IDE extension after ORL completes
- Files are definitely flushed by then
- Requires changes to IDE extension (acceptable)

### Option 3: File Polling (Complex)

- Poll file modification times to detect flush
- Problem: Complex, race conditions, unreliable

### Option 4: ORL Modification (Not Allowed)

- Have ORL write file content to temp location before flush
- Or pass file content via environment variables
- **Cannot do this - user said no ORL modifications**

## Recommended Approach

**Use Option 2: IDE Extension Post-Processing**

1. Keep workaround in `post_remediate_rule_finding.sh` (always works)
2. Remove hash comparison from `post_remediate.sh` (can't work there)
3. Add hash comparison in IDE extension after ORL completes
4. Update `diagnostics.json` with precise results if hash comparison succeeds

This provides:

- ✅ Reliable fallback (workaround always works)
- ✅ Precise attribution when possible (hash comparison in IDE)
- ✅ No ORL modifications required
- ✅ Clean separation of concerns
