# Gomboc VS Code Extension — Developer Notes

This doc is a focused guide for:

- adding **new IaC languages/file types**
- getting **Problems tab diagnostics** + **Fix Reviewer webview** correct
- understanding how we submit scan/reporting data to the **Integrations** service

### Updating Orl Version

We have decided to keep the ORL version hardcoded to a certain value, so that we will only update it when necessary, so when you want to update it, make sure that you update it in every case (code, workflows, readmes)

## Adding a new language (end-to-end checklist)

### 1) Decide the two “language identities”

- **VS Code language id(s)**: what VS Code reports as `document.languageId` (e.g. `terraform`, `yaml`, `hcl`).
  - This extension currently does **not** contribute its own languages/grammars in `package.json`, so we rely on VS Code + other installed extensions to provide language ids.
- **ORL language string**: what we pass to ORL via `--language` (e.g. `terraform`, `cloudformation-yaml`, `hcl`).

These are related but **not the same**.

### 2) Make scans recognize the file type

Scan parameter detection happens in:

- `src/utils/scanValidator.ts` (`detectLanguageFromFile`, `ScanValidator.validateAndPrepareScan`)

Update it to:

- recognize the new extension / content pattern
- return the ORL language string you want
- keep the validation error message up to date (the “supported file types” list)

### 3) Ensure the extension’s “IaC tool classification” includes it

This affects how we clear diagnostics on edit and how we scope collections (file vs directory):

- `src/infrastructureTool.ts`

If the new file type is Terraform-like (e.g. `.hcl`), add the extension to the Terraform bucket so diagnostics clear consistently.

### 4) Register editor features for the VS Code language id

For Fix UX we register providers by language id:

- `src/extension.ts`
  - `CodeActionProvider` (quick fixes / “Apply all fixes”)
  - `OrlHoverProvider` (hover info)

Add the new VS Code language id to the registration arrays where appropriate.

### 5) Make sure diagnostics + Fix Reviewer populate (most important)

The Problems tab + Fix Reviewer webview are driven by `ScanResultsProvider`:

- `src/providers/scanResultsProvider.ts`
  - `setLastOrlScanContext(...)` stores the last ORL scan context (workspace, language, raw report)
  - `createDiagnostic()` builds `vscode.Diagnostic`s and fires an issues snapshot event

**ORL path:** ORL output is converted into the internal scan response format by:

- `src/orl/orlResultConverter.ts`

If you see only **“Apply all fixes”** and no per-finding/per-rule entries, the usual cause is:

- ORL changes exist, but the converter fails to attribute diffs to real ORL rule names/descriptions, producing a non-renderable placeholder.

For Terraform-like formats that don’t have easy “resource blocks” (common for variants like `terragrunt.hcl`), attribution should fall back to:

- “rules that changed this file” derived from the ORL report (`files_changed` / `files[].path`)

### 6) Add a dogfood fixture + rule for local validation

Recommended: add a minimal repro to your dogfood repo (e.g. `rattleback-dogfood/`) and a matching `.orl` rule under `.orl-dev-rules/` for iteration.

Then validate in the Extension Host:

- Problems tab shows per-rule entries
- Fix Reviewer shows issues with descriptions
- Quick fix applies and rescans correctly

## Diagnostics: what “correct” looks like

### Problems tab

In ORL mode, `ScanResultsProvider.createDiagnostic()` emits:

- **one diagnostic per ORL rule** (stable, actionable)
- plus **a single** “Apply all fixes” diagnostic (so the lightbulb offers a bulk apply)

If the Problems tab shows diagnostics but the Fix Reviewer is empty:

- confirm `ScanResultsProvider` fired an issues snapshot (`onDidUpdateIssues`)
- confirm the webview is requesting a snapshot / receiving updates

### Fix Reviewer webview

The webview is driven by the issues snapshot (rule name, short name, description, file path, line, etc.). If those fields are empty or missing, fix it upstream in:

- `OrlResultConverter` (rule attribution / descriptions), and/or
- ORL report parsing (`src/utils/orlReportParser.ts`), and/or
- `ScanResultsProvider.buildOrlRuleMetaIndex()` (metadata indexed from report)

## Extending the extension (brief)

### New command

- Add to `package.json` under `contributes.commands`
- Register in `src/extension.ts` inside `activate()` (see the existing pattern)

### New setting

- Add to `package.json` under `contributes.configuration`
- Read via `vscode.workspace.getConfiguration('gomboc-vscode-extension')`

## Integrations service: what we send, when we send it

### Where it’s implemented

- `src/utils/integrationsService/IntegrationsService.ts`

### Required configuration

Integrations submissions are skipped unless BOTH are configured:

- `gomboc-vscode-extension.integrationsServiceUrl`
- `gomboc-vscode-extension.apiKey` (used as Bearer token to Integrations)

### When we send

In `src/commands/scanFile.ts` (ORL path):

- **Report submission**: after ORL succeeds AND we successfully convert results, we call:
  - `integrationsService.sendOrlReport(result, workspacePath, language)` (fire-and-forget)
- **Error submission**: on validation failures, ORL execution failures, or conversion failures:
  - `integrationsService.sendError(...)` (fire-and-forget)

Legacy (non-ORL) scans do not use this `orl-external` reporting path.

### Endpoint + body shape

Both report and error submissions go to:

- `POST {integrationsServiceUrl}/reporting/orl-external`

The body is versioned and includes:

- `version: 1.0`
- `requestOrigin: "IDE"`
- `effect: "SubmitForReview"`
- `reports: [{ path?: string, branch?: string, orlReport?: object }]` (for report submissions, `orlReport` is present)
- `errors: [{ status: number, message: string }]`

Notes:

- We derive `path` (repo-relative scan directory) + `branch` via local git commands.
- We normalize the ORL report to keep payloads small; counts are preserved but **`rules: []`** is sent to reduce size.

### Why a scan might “not show up” in the portal even if the IDE says it sent it

On the Integrations service side, ingestion uses **idempotency**:

- it computes `idempotencyKey = sha256(JSON.stringify(payload))`
- if the exact same payload arrives again, it’s treated as a duplicate and dropped

So repeated scans that generate identical normalized payloads can be ignored.

Other common causes:

- auth failures (bad/expired bearer token)
- schema validation failures
- async processing failures downstream (Integrations queues then processes later)

### Fix-applied analytics events (separate from scan reports)

When the user applies a fix, we can also send a small “fix applied” event stream:

- `src/utils/integrationsService/IntegrationsService.ts` (`queueOrlFixAppliedEvent`, `flushOrlFixAppliedEvents`)

Controlled by settings:

- `gomboc-vscode-extension.orlFixAppliedAnalyticsEnabled` (default true)
- `gomboc-vscode-extension.integrationsFixAppliedEndpointPath` (path appended to `integrationsServiceUrl`)

The event payload (v1) includes:

- `type: "orl_fix_applied"`
- `idempotencyKey` (also sent as `Idempotency-Key` / `X-Idempotency-Key` headers)
- `occurredAt`, `fixKind`, `ruleNames`, `ruleIdentifiers`, `filePaths`
- optional repo context: `repoPath`, `branch`, `repoRelativeDir`

## Quick troubleshooting map

### “Scan ran, but portal didn’t update”

- Verify ORL vs non-ORL path (logs show “Using ORL client”)
- Verify Integrations config is set (`integrationsServiceUrl` + `apiKey`)
- Check for duplicate payload behavior (same repo path/branch + unchanged counts)

### “Only ‘Apply all fixes’ shows; no per-rule entries”

- Attribution failure in `OrlResultConverter` (rule names/descriptions not being mapped)
- For Terraform-like variants without strong resource blocks, ensure report-derived file change mapping is used
