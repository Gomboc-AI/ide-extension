import * as crypto from 'crypto';
import {
  BuildPreviewResourceContextsArgs,
  PreviewResourceContext,
  ResourceContextExtractKind,
} from './types';

/** Human-readable label and 1-based inclusive line range for a preview slice. */
export interface PreviewContextRange {
  title: string;
  startLine: number;
  endLine: number;
}

/**
 * Builds bounded preview snippets for fix/scan UI from file text and diff hunks.
 *
 * Flow:
 * 1. For each hunk, anchor on that hunk's `newStart` and
 *    resolve a context range via `args.resolveContextRange` or {@link extractSingleContext}.
 * 2. Merge hunks that share the same range key (`startLine:endLine:title`) and collect
 *    fingerprints on {@link PreviewResourceContext.relatedHunkFingerprints}.
 * 3. Sort by `startLine`, keep at most `maxContexts` (clamped), slice text, and truncate
 *    vertically when a range exceeds `maxLinesPerContext`.
 *
 * Line numbers in the returned contexts are 1-based and inclusive.
 */
export function buildPreviewResourceContexts(
  args: BuildPreviewResourceContextsArgs & {
    kind: ResourceContextExtractKind;
    resolveContextRange?: (args: {
      kind: ResourceContextExtractKind;
      lines: string[];
      line: number;
    }) => PreviewContextRange | undefined;
  },
): PreviewResourceContext[] {
  const maxContexts = clampInt({
    value: args.maxContexts ?? 6,
    min: 1,
    max: 25,
  });
  const maxLines = clampInt({
    value: args.maxLinesPerContext ?? 700,
    min: 50,
    max: 5000,
  });
  const text = args.content ?? '';
  const lines = text.split('\n');
  const hunks = Array.isArray(args.hunks) ? args.hunks : [];
  const contextsByKey = new Map<
    string,
    Omit<PreviewResourceContext, 'id' | 'text' | 'truncated'>
  >();

  for (const h of hunks) {
    const lineForContext = Math.max(1, h.newStart);
    const ctx =
      args.resolveContextRange?.({
        kind: args.kind,
        lines,
        line: lineForContext,
      }) ||
      extractSingleContext({
        kind: args.kind,
        lines,
        line: lineForContext,
      });
    if (!ctx) {
      continue;
    }
    const key = `${ctx.startLine}:${ctx.endLine}:${ctx.title}`;
    const existing = contextsByKey.get(key);
    if (!existing) {
      contextsByKey.set(key, {
        title: ctx.title,
        startLine: ctx.startLine,
        endLine: ctx.endLine,
        relatedHunkFingerprints: [h.fingerprint],
      });
    } else if (!existing.relatedHunkFingerprints.includes(h.fingerprint)) {
      existing.relatedHunkFingerprints.push(h.fingerprint);
    }
  }

  return Array.from(contextsByKey.values())
    .sort((a, b) => a.startLine - b.startLine)
    .slice(0, maxContexts)
    .map(ctx => {
      const startIdx =
        clampInt({
          value: ctx.startLine,
          min: 1,
          max: lines.length,
        }) - 1;
      const endIdx =
        clampInt({
          value: ctx.endLine,
          min: 1,
          max: lines.length,
        }) - 1;
      const full = lines.slice(startIdx, endIdx + 1);
      const { snippet, truncated } = truncateLines({
        lines: full,
        maxLines,
      });
      return {
        id: hashId({
          value: {
            filePath: args.filePath,
            startLine: ctx.startLine,
            endLine: ctx.endLine,
            title: ctx.title,
          },
        }),
        title: ctx.title,
        startLine: ctx.startLine,
        endLine: ctx.endLine,
        text: snippet.join('\n'),
        truncated,
        relatedHunkFingerprints: ctx.relatedHunkFingerprints.slice().sort(),
      };
    });
}

/**
 * Dispatches to a language-specific range extractor, or a generic line window fallback.
 *
 * `args.line` is clamped to `[1, lines.length]` before extraction.
 */
function extractSingleContext(args: {
  kind: ResourceContextExtractKind;
  lines: string[];
  line: number;
}): PreviewContextRange | undefined {
  if (!args.lines.length) {
    return undefined;
  }
  const line = clampInt({
    value: args.line,
    min: 1,
    max: args.lines.length,
  });
  if (args.kind === 'terraform') {
    return extractTerraformBlock({ lines: args.lines, line });
  }
  if (args.kind === 'yaml') {
    return extractYamlDocument({ lines: args.lines, line });
  }
  if (args.kind === 'dockerfile') {
    return extractDockerStage({ lines: args.lines, line });
  }
  if (args.kind === 'json') {
    return extractJsonContainer({ lines: args.lines, line });
  }
  return extractFallbackWindow({ lines: args.lines, line });
}

/**
 * Finds the enclosing Terraform block (resource/module/data/…) around `line`.
 *
 * Walks upward for a block header line matching HCL top-level constructs, then scans
 * forward with {@link findBraceBalancedEnd} so nested `{` inside strings does not break
 * the closing brace. If no header is found, falls back to {@link extractFallbackWindow}.
 */
function extractTerraformBlock(args: {
  lines: string[];
  line: number;
}): PreviewContextRange | undefined {
  const { lines, line } = args;
  const startIdx = findTerraformBlockStart({
    lines,
    fromIdx: line - 1,
  });
  if (startIdx === undefined) {
    return extractFallbackWindow({ lines, line });
  }
  const endIdx = findBraceBalancedEnd({ lines, startIdx });
  const header = lines[startIdx].trim();
  return {
    title: header.length > 140 ? `${header.slice(0, 140)}…` : header,
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

/**
 * Returns the 0-based index of the nearest Terraform block header at or above `fromIdx`.
 *
 * Skips empty lines and `#` / `//` comments. The header regex requires an opening `{` on
 * the same line (possibly followed only by an end-of-line `#` comment).
 */
function findTerraformBlockStart(args: {
  lines: string[];
  fromIdx: number;
}): number | undefined {
  const { lines, fromIdx } = args;
  const re =
    /^\s*(resource|module|data|provider|locals|variable|output)\b[\s\S]*\{\s*(#.*)?$/;
  for (
    let i = clampInt({
      value: fromIdx,
      min: 0,
      max: lines.length - 1,
    });
    i >= 0;
    i--
  ) {
    const s = lines[i];
    if (!s) {
      continue;
    }
    const trimmed = s.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }
    if (re.test(trimmed)) {
      return i;
    }
  }
  return undefined;
}

/**
 * Finds the 0-based line index where cumulative `{` / `}` balance from `startIdx` first
 * returns to non-positive after the opening line.
 *
 * Uses {@link countBracesOutsideStrings} per line so braces inside `'...'` or `"..."`
 * (with basic escape handling) do not affect balance. If the block never closes, returns
 * the last line index.
 */
function findBraceBalancedEnd(args: {
  lines: string[];
  startIdx: number;
}): number {
  const { lines, startIdx } = args;
  let balance = 0;
  for (let i = startIdx; i < lines.length; i++) {
    balance += countBracesOutsideStrings({ line: lines[i] });
    if (i > startIdx && balance <= 0) {
      return i;
    }
  }
  return lines.length - 1;
}

/**
 * Net change in `{` / `}` count on `line` when ignoring braces inside quoted strings.
 *
 * Tracks single- and double-quoted spans (toggles on `'` / `"`), respects `\` escapes,
 * and does not treat `{`/`}` inside a string as structural. This is a lightweight lexer,
 * not a full HCL parser (e.g. heredocs and template strings are not modeled).
 */
function countBracesOutsideStrings(args: { line: string }): number {
  const { line } = args;
  let delta = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && c === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && c === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) {
      continue;
    }
    if (c === '{') {
      delta++;
    } else if (c === '}') {
      delta--;
    }
  }
  return delta;
}

/**
 * Treats `---` as a multi-document separator and returns the document containing `line`.
 *
 * Scans upward from `line` for a `---` line to mark the document start (default `0` if
 * none). Scans forward from just after the anchor for the next `---` to cap the end
 * (default last line). Document boundaries use trimmed line equality to `---`.
 */
function extractYamlDocument(args: {
  lines: string[];
  line: number;
}): PreviewContextRange | undefined {
  const { lines, line } = args;
  const idx = line - 1;
  let startIdx = 0;
  for (let i = idx; i >= 0; i--) {
    if (lines[i].trim() === '---') {
      startIdx = i;
      break;
    }
  }
  let endIdx = lines.length - 1;
  for (let i = Math.min(lines.length - 1, idx + 1); i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i - 1;
      break;
    }
  }
  const title = deriveYamlTitle({
    docLines: lines.slice(startIdx, endIdx + 1),
  });
  return { title, startLine: startIdx + 1, endLine: endIdx + 1 };
}

/**
 * Builds a short title from the first `kind:` and first `name:` keys in document order.
 *
 * Stops once both are found. `name:` is intentionally naive (first match may be nested
 * metadata, not the resource name).
 */
function deriveYamlTitle(args: { docLines: string[] }): string {
  const { docLines } = args;
  let kind = '';
  let name = '';
  for (const l of docLines) {
    const t = l.trim();
    if (!kind && t.startsWith('kind:')) {
      kind = t.replace(/^kind:\s*/, '').trim();
      continue;
    }
    if (!name && t.startsWith('name:')) {
      // best-effort (often within metadata)
      name = t.replace(/^name:\s*/, '').trim();
      continue;
    }
    if (kind && name) {
      break;
    }
  }
  const base = [kind, name].filter(Boolean).join('/');
  return base ? `YAML document: ${base}` : 'YAML document';
}

/**
 * Returns the Dockerfile stage (lines between `FROM` directives) that contains `line`.
 *
 * The stage starts at the nearest `FROM` at or above the anchor and ends before the next
 * `FROM`, or EOF. Matching is case-insensitive with optional leading whitespace.
 */
function extractDockerStage(args: {
  lines: string[];
  line: number;
}): PreviewContextRange | undefined {
  const { lines, line } = args;
  const idx = line - 1;
  let startIdx = 0;
  for (let i = idx; i >= 0; i--) {
    if (/^\s*FROM\s+/i.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  let endIdx = lines.length - 1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\s*FROM\s+/i.test(lines[i])) {
      endIdx = i - 1;
      break;
    }
  }
  const titleLine = lines[startIdx].trim();
  return {
    title: titleLine ? `Docker stage: ${titleLine}` : 'Docker stage',
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

/**
 * Best-effort JSON / JSONC-ish container around `line` for preview framing only.
 *
 * {@link findJsonStart} picks the nearest prior line containing `{` or `[`. {@link findJsonEnd}
 * walks forward and decrements a shared balance for both `{}` and `[]` on every character
 * in each line (not string-aware). If no opener is found, uses {@link extractFallbackWindow}.
 * This can mis-ranges on strings or when `{`/`[` appear inside comments.
 */
function extractJsonContainer(args: {
  lines: string[];
  line: number;
}): PreviewContextRange | undefined {
  const { lines, line } = args;
  // Very best-effort: balance {} and [] around the line, but fall back if we can't find a clean container.
  const idx = line - 1;
  const startIdx = findJsonStart({ lines, fromIdx: idx });
  if (startIdx === undefined) {
    return extractFallbackWindow({ lines, line });
  }
  const endIdx = findJsonEnd({ lines, startIdx });
  return {
    title: 'JSON container',
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

/** Walks upward from `fromIdx` and returns the first line index whose text matches `[{\[]`. */
function findJsonStart(args: {
  lines: string[];
  fromIdx: number;
}): number | undefined {
  const { lines, fromIdx } = args;
  for (
    let i = clampInt({
      value: fromIdx,
      min: 0,
      max: lines.length - 1,
    });
    i >= 0;
    i--
  ) {
    if (/[{\[]/.test(lines[i])) {
      return i;
    }
  }
  return undefined;
}

/**
 * Forward scan from `startIdx` until combined `{`,`[`,`}`,`]` balance is non-positive.
 *
 * Unlike Terraform handling, this does not skip braces inside strings; see
 * {@link extractJsonContainer}.
 */
function findJsonEnd(args: { lines: string[]; startIdx: number }): number {
  const { lines, startIdx } = args;
  let balance = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const s = lines[i];
    for (const c of s) {
      if (c === '{' || c === '[') {
        balance++;
      } else if (c === '}' || c === ']') {
        balance--;
      }
    }
    if (i > startIdx && balance <= 0) {
      return i;
    }
  }
  return lines.length - 1;
}

/**
 * Symmetric fixed window (±220 lines) around `line` when no smarter extractor applies.
 *
 * `line` is treated as 1-based; indices are clamped to file bounds.
 */
function extractFallbackWindow(args: {
  lines: string[];
  line: number;
}): PreviewContextRange {
  const { lines, line } = args;
  const window = 220;
  const startIdx = Math.max(0, line - 1 - window);
  const endIdx = Math.min(lines.length - 1, line - 1 + window);
  return {
    title: `Context around line ${line}`,
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

/**
 * Returns the first `maxLines` lines plus a sentinel row when the input exceeds the cap.
 *
 * Used to keep preview payloads bounded without silently dropping the truncation signal.
 */
function truncateLines(args: { lines: string[]; maxLines: number }): {
  snippet: string[];
  truncated: boolean;
} {
  const { lines, maxLines } = args;
  if (lines.length <= maxLines) {
    return { snippet: lines, truncated: false };
  }
  const head = lines.slice(0, maxLines);
  head.push('… (truncated)');
  return { snippet: head, truncated: true };
}

/** Stable short id from a JSON-serialized payload (SHA-1 hex prefix). */
function hashId(args: { value: unknown }): string {
  const raw = JSON.stringify(args.value);
  return crypto
    .createHash('sha1')
    .update(raw, 'utf8')
    .digest('hex')
    .slice(0, 10);
}

/**
 * Floors `value` to an integer and clamps to `[min, max]`.
 *
 * Non-finite inputs yield `min`.
 */
function clampInt(args: { value: number; min: number; max: number }): number {
  const n = Math.floor(Number(args.value));
  if (!Number.isFinite(n)) {
    return args.min;
  }
  return Math.max(args.min, Math.min(args.max, n));
}
