# Architecture Review & Hook Documentation

## Code Review Findings

### 🔴 Critical Issues

1. **Legacy Script Fallback Still Present**

   - **Location**: `orlClient.ts:79-483`
   - **Issue**: The `legacyScripts` object contains 400+ lines of inline shell scripts that duplicate the external hook files. This creates maintenance burden and confusion.
   - **Impact**: If external files fail to load, we fall back to potentially outdated inline scripts.
   - **Recommendation**: Remove legacy scripts entirely and fail fast if hook files can't be loaded. This forces proper deployment and makes issues visible immediately.

2. **Duplicate Code in Hooks**

   - **Location**: `pre_remediate_rule_finding.sh` and `post_remediate_rule_finding.sh`
   - **Issue**: The `extract_resources()` function is duplicated identically in both files (~70 lines each).
   - **Impact**: Bug fixes and improvements must be made in two places, increasing risk of divergence.
   - **Recommendation**: Extract to a shared library or source it from a common file.

3. **Brittle Resource Parsing**

   - **Location**: `pre_remediate_rule_finding.sh:46-78`
   - **Issue**: Resource extraction uses regex-based parsing of Terraform files. This will break with:
     - Multi-line resource declarations
     - Comments in resource blocks
     - Nested blocks within resources
     - Non-standard formatting
   - **Impact**: May miss resources or incorrectly parse boundaries, leading to wrong attribution.
   - **Recommendation**: Use a proper Terraform parser (e.g., `hcl2json` or tree-sitter) if available in the container, or at least add more robust error handling.

4. **Empty Resources in Dry-Run Mode**
   - **Location**: `post_remediate_rule_finding.sh:128`
   - **Issue**: Always outputs `{}` for `resources_modified.json` in dry-run mode, making the entire resource tracking infrastructure unused.
   - **Impact**: Forces the IDE extension to use heuristic matching (diff content analysis) which is less precise.
   - **Recommendation**: Consider extracting resources from the diff itself or using ORL's internal tracking if available.

### 🟡 Design Concerns

5. **Path Normalization Inconsistency**

   - **Location**: Multiple hooks and `orlResultConverter.ts`
   - **Issue**: Path normalization logic is duplicated across hooks and TypeScript code with slight variations:
     - Hooks: `"${file_path#/workspace/}"`, `"${file_path#./}"`
     - TypeScript: `orlFilePath.replace(/^\/workspace\/+/, '')`
   - **Impact**: Path mismatches can cause rules to not match files correctly.
   - **Recommendation**: Centralize path normalization in a shared utility.

6. **Error Handling in Shell Scripts**

   - **Location**: All hooks
   - **Issue**: Heavy use of `|| true` and `2>/dev/null` suppresses errors, making debugging difficult.
   - **Impact**: Silent failures can lead to empty diagnostics without clear indication of what went wrong.
   - **Recommendation**: Add explicit error logging to a debug file, or at least log when critical operations fail.

7. **JSON Generation Without Validation**

   - **Location**: All hooks
   - **Issue**: JSON is built using `printf` statements without validation. Malformed JSON will break the IDE extension.
   - **Impact**: Invalid JSON causes silent failures in the extension.
   - **Recommendation**: Use `jq` to build JSON where possible, or add validation before writing.

8. **Resource Hash Calculation**
   - **Location**: `pre_remediate_rule_finding.sh:12-21`
   - **Issue**: Uses `md5sum` which may not be available in all containers. No fallback.
   - **Impact**: Resource comparison fails silently if `md5sum` is missing.
   - **Recommendation**: Check for `md5sum` availability or use a POSIX-compatible alternative.

### 🟢 Minor Issues

9. **Magic Numbers**

   - **Location**: `orlResultConverter.ts:736` (term length > 3)
   - **Issue**: Hard-coded thresholds without explanation.
   - **Recommendation**: Extract to named constants with comments.

10. **Property Pattern Matching**

    - **Location**: `orlResultConverter.ts:773-800`
    - **Issue**: Hard-coded property patterns that may not cover all cases.
    - **Impact**: New rules or properties may not match correctly.
    - **Recommendation**: Consider making this configurable or extracting from rule metadata.

11. **Temporary File Cleanup**
    - **Location**: `pre_remediate_rule_finding.sh:121`
    - **Issue**: Temp files are cleaned up immediately, making debugging harder.
    - **Recommendation**: Keep temp files in debug mode or add a flag to preserve them.

## Hook Execution Flow

### Overview

The hooks execute in a specific order during ORL remediation, creating a pipeline that tracks which rules modified which resource instances:

```
pre_remediate
  ↓
pre_remediate_rule (for each rule)
  ↓
pre_remediate_rule_finding (for each finding)
  ↓
[ORL applies rule changes]
  ↓
post_remediate_rule_finding (for each finding)
  ↓
post_remediate_rule (for each rule)
  ↓
post_remediate
```

---

## Hook Documentation

### 1. `pre_remediate.sh`

**When**: Executed once before any remediation begins  
**Arguments**: `$1` = number of rules, `$2` = number of workspaces  
**Purpose**: Initialize the diagnostics infrastructure

**What it does**:

- Creates directory structure: `.orl/diagnostics/rules` and `.orl/diag/rules`
- Initializes the manifest file (`manifest.jsonl`) for event logging
- Logs the start of remediation with rule/workspace counts

**Output**: Creates empty manifest file

---

### 2. `pre_remediate_rule.sh`

**When**: Executed once per rule, before that rule is applied  
**Arguments**: `$1` = rule name, `$2` = priority  
**Purpose**: Create a baseline snapshot of the workspace for this rule

**What it does**:

- Logs the rule start event to manifest
- Creates a snapshot directory: `.orl/diag/rules/{rule_name}/before/`
- Copies all IaC files (`.tf`, `.yaml`, `.yml`, `.json`) to the snapshot, preserving directory structure
- This snapshot is used later to determine what changed

**Output**: Snapshot directory with baseline files

**Note**: The snapshot is rule-specific, so each rule gets its own "before" state.

---

### 3. `pre_remediate_rule_finding.sh`

**When**: Executed once per finding (file with violations) for each rule  
**Arguments**: `$1` = rule name, `$2` = priority, `$3` = comma-separated file paths  
**Purpose**: Extract and snapshot all resource instances from files that will be modified

**What it does**:

1. **Extracts resources from Terraform files**:

   - Parses each file to find `resource "type" "name" { ... }` blocks
   - For each resource, extracts:
     - Type (e.g., `aws_elasticache_replication_group`)
     - Name (e.g., `bad_cache`)
     - Start line number
     - End line number
     - Content hash (MD5 of the resource block content)

2. **Stores "before" snapshot**:
   - Creates `resources_before.json` with structure:
     ```json
     {
       "file.tf": [
         {
           "type": "aws_elasticache_replication_group",
           "name": "bad_cache",
           "startLine": 27,
           "endLine": 31,
           "hash": "c0c602a9ef871553e23e03ec6e89322b"
         }
       ]
     }
     ```

**Output**: `resources_before.json` containing all resource instances with their hashes

**Key Function**: `extract_resources()`

- Uses brace counting to find resource boundaries
- Calculates MD5 hash of resource content for comparison
- Outputs one JSON object per line (for line-by-line reading)

---

### 4. `post_remediate_rule_finding.sh`

**When**: Executed once per finding (file with violations) for each rule, after ORL has applied changes  
**Arguments**: `$1` = rule name, `$2` = priority, `$3` = comma-separated file paths  
**Purpose**: Extract resources after changes and identify which specific resource instances were modified

**What it does**:

1. **Extracts resources again** (same as `pre_remediate_rule_finding.sh`):

   - Parses files to get current resource state
   - Creates `resources_after.json` with the same structure as `resources_before.json`

2. **Compares before/after** (intended, but disabled in dry-run):
   - **In normal mode**: Would compare hashes to find modified resources
   - **In dry-run mode**: Always outputs empty `{}` for `resources_modified.json`
   - This is because in dry-run, files aren't actually modified, so hashes are identical

**Output**:

- `resources_after.json`: Current resource state
- `resources_modified.json`: Empty `{}` in dry-run mode (would contain modified resources in normal mode)

**Why empty in dry-run**: Since ORL doesn't actually modify files in dry-run, the before/after hashes are identical, so no resources would be marked as modified. The IDE extension instead uses diff content analysis to match rules to resources.

---

### 5. `post_remediate_rule.sh`

**When**: Executed once per rule, after all findings for that rule have been processed  
**Arguments**: `$1` = rule name, `$2` = priority, `$3` = comma-separated file paths  
**Purpose**: Create a per-rule JSON file that aggregates all files and resources modified by this rule

**What it does**:

1. **Reads modified resources** (if available):

   - Attempts to read `resources_modified.json` from the rule directory
   - Uses `jq` to extract resources for each file

2. **Builds per-rule JSON**:

   - Creates `{sanitized_rule_name}.json` in `.orl/diagnostics/rules/`
   - Structure:
     ```json
     {
       "ruleName": "gomboc-ai/ensure_automatic_updates...",
       "priority": 1400000,
       "files": [
         {
           "path": "test-aws.tf",
           "resources": [] // Empty in dry-run mode
         }
       ]
     }
     ```

3. **Fallback handling**:
   - If `resources_modified.json` doesn't exist or `jq` is unavailable, creates JSON with empty `resources: []` arrays

**Output**: `{rule_name}.json` file with rule metadata and file list

**Note**: In dry-run mode, `resources` arrays are always empty because `resources_modified.json` is empty.

---

### 6. `post_remediate.sh`

**When**: Executed once after all remediation is complete  
**Arguments**: `$1` = number of rules executed  
**Purpose**: Aggregate all per-rule JSON files into a single diagnostics file

**What it does**:

1. **Collects all rule JSON files**:

   - Scans `.orl/diagnostics/rules/*.json`
   - Skips resource tracking files (`resources_*.json`)

2. **Creates final diagnostics**:
   - Builds `diagnostics.json` with structure:
     ```json
     {
       "version": 1,
       "generatedAt": "2025-11-20T18:37:53Z",
       "rules": [
         { /* rule 1 JSON */ },
         { /* rule 2 JSON */ },
         ...
       ]
     }
     ```

**Output**: `diagnostics.json` - the final aggregated file read by the IDE extension

---

## IDE Extension Processing

### `orlResultConverter.ts` Flow

1. **Reads `diagnostics.json`**:

   - Parses the aggregated rule data
   - Builds `fileToRules` mapping: which rules touched which files

2. **Processes diffs**:

   - For each diff in the modified files:
     - Extracts resource instance from diff location (searches backwards for `resource "type" "name"`)
     - Identifies which resource instance contains the diff line

3. **Matches rules to diffs**:

   - **First attempt**: Check if rule has this specific resource instance in its `resources` list
     - **Problem**: In dry-run, `resources` is always empty, so this never matches
   - **Fallback**: Use diff content analysis:
     - Extract properties from diff (e.g., `auto_minor_version_upgrade`)
     - Match rule name terms to diff content
     - Use property patterns (e.g., "automatic" → `auto_minor_version_upgrade`)

4. **Generates diagnostics**:
   - Creates hover text with resource name and rule descriptions
   - Only shows rules that match the specific resource instance and diff content

---

## Data Flow Summary

```
ORL Execution
  ↓
Hooks create diagnostics.json
  ↓
IDE Extension reads diagnostics.json
  ↓
Builds fileToRules mapping
  ↓
For each diff:
  - Extract resource instance from diff location
  - Match rules using:
    1. Resource instance in rule's resources list (fails in dry-run)
    2. Diff content analysis (fallback)
  - Show only matching rules in hover text
```

---

## Recommendations for Improvement

1. **Remove legacy scripts** - Fail fast if hooks can't be loaded
2. **Extract shared functions** - Create a common library for `extract_resources()`
3. **Use proper Terraform parser** - Replace regex-based parsing
4. **Centralize path normalization** - Single source of truth
5. **Add error logging** - Don't suppress all errors
6. **Validate JSON** - Use `jq` or validate before writing
7. **Improve dry-run resource tracking** - Extract resources from diff content in hooks
8. **Add unit tests** - Test resource extraction and matching logic
