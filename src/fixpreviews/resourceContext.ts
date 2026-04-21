import * as crypto from 'crypto';
import { DiffHunk } from './diffRender';
import {
  getResourceContextExtractKind,
  type ResourceContextExtractKind,
} from '../generics/languageHandler';

export type ResourceContext = {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  text: string;
  truncated?: boolean;
  relatedHunkFingerprints: string[];
};

export function extractResourceContexts(args: {
  filePath: string;
  text: string;
  hunks: DiffHunk[];
  maxContexts?: number;
  maxLinesPerContext?: number;
}): ResourceContext[] {
  const maxContexts = clampInt(args.maxContexts ?? 6, 1, 25);
  const maxLines = clampInt(args.maxLinesPerContext ?? 700, 50, 5000);

  const text = args.text ?? '';
  const lines = text.split('\n');
  const hunks = Array.isArray(args.hunks) ? args.hunks : [];

  const kind = resolveContextExtractKind({
    filePath: args.filePath,
    content: text,
  });

  const contextsByKey = new Map<
    string,
    Omit<ResourceContext, 'id' | 'text' | 'truncated'> & {
      textLines?: string[];
      truncated?: boolean;
    }
  >();

  for (const h of hunks) {
    const lineForContext = Math.max(1, h.newStart);
    const ctx = extractSingleContext({
      kind,
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

  const raw = Array.from(contextsByKey.values())
    .sort((a, b) => a.startLine - b.startLine)
    .slice(0, maxContexts);

  const out: ResourceContext[] = [];
  for (const r of raw) {
    const startIdx = clampInt(r.startLine, 1, lines.length) - 1;
    const endIdx = clampInt(r.endLine, 1, lines.length) - 1;
    const full = lines.slice(startIdx, endIdx + 1);
    const { snippet, truncated } = truncateLines(full, maxLines);
    out.push({
      id: hashId({
        filePath: args.filePath,
        startLine: r.startLine,
        endLine: r.endLine,
        title: r.title,
      }),
      title: r.title,
      startLine: r.startLine,
      endLine: r.endLine,
      text: snippet.join('\n'),
      truncated,
      relatedHunkFingerprints: r.relatedHunkFingerprints.slice().sort(),
    });
  }
  return out;
}

function resolveContextExtractKind(args: {
  filePath: string;
  content: string;
}): ResourceContextExtractKind {
  return getResourceContextExtractKind({
    filePath: args.filePath,
    content: args.content,
  });
}

function extractSingleContext(args: {
  kind: ResourceContextExtractKind;
  lines: string[];
  line: number;
}): { title: string; startLine: number; endLine: number } | undefined {
  if (!args.lines.length) {
    return undefined;
  }
  const line = clampInt(args.line, 1, args.lines.length);
  if (args.kind === 'terraform') {
    return extractTerraformBlock(args.lines, line);
  }
  if (args.kind === 'yaml') {
    return extractYamlDocument(args.lines, line);
  }
  if (args.kind === 'dockerfile') {
    return extractDockerStage(args.lines, line);
  }
  if (args.kind === 'json') {
    return extractJsonContainer(args.lines, line);
  }
  return extractFallbackWindow(args.lines, line);
}

function extractTerraformBlock(
  lines: string[],
  line: number,
): { title: string; startLine: number; endLine: number } | undefined {
  const startIdx = findTerraformBlockStart(lines, line - 1);
  if (startIdx === undefined) {
    return extractFallbackWindow(lines, line);
  }
  const endIdx = findBraceBalancedEnd(lines, startIdx);
  const header = lines[startIdx].trim();
  return {
    title: header.length > 140 ? `${header.slice(0, 140)}…` : header,
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

function findTerraformBlockStart(
  lines: string[],
  fromIdx: number,
): number | undefined {
  const re =
    /^\s*(resource|module|data|provider|locals|variable|output)\b[\s\S]*\{\s*(#.*)?$/;
  for (let i = clampInt(fromIdx, 0, lines.length - 1); i >= 0; i--) {
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

function findBraceBalancedEnd(lines: string[], startIdx: number): number {
  let balance = 0;
  for (let i = startIdx; i < lines.length; i++) {
    balance += countBracesOutsideStrings(lines[i]);
    if (i > startIdx && balance <= 0) {
      return i;
    }
  }
  return lines.length - 1;
}

function countBracesOutsideStrings(line: string): number {
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

function extractYamlDocument(
  lines: string[],
  line: number,
): { title: string; startLine: number; endLine: number } | undefined {
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
  const title = deriveYamlTitle(lines.slice(startIdx, endIdx + 1));
  return { title, startLine: startIdx + 1, endLine: endIdx + 1 };
}

function deriveYamlTitle(docLines: string[]): string {
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

function extractDockerStage(
  lines: string[],
  line: number,
): { title: string; startLine: number; endLine: number } | undefined {
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

function extractJsonContainer(
  lines: string[],
  line: number,
): { title: string; startLine: number; endLine: number } | undefined {
  // Very best-effort: balance {} and [] around the line, but fall back if we can't find a clean container.
  const idx = line - 1;
  const startIdx = findJsonStart(lines, idx);
  if (startIdx === undefined) {
    return extractFallbackWindow(lines, line);
  }
  const endIdx = findJsonEnd(lines, startIdx);
  return {
    title: 'JSON container',
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

function findJsonStart(lines: string[], fromIdx: number): number | undefined {
  for (let i = clampInt(fromIdx, 0, lines.length - 1); i >= 0; i--) {
    if (/[{\[]/.test(lines[i])) {
      return i;
    }
  }
  return undefined;
}

function findJsonEnd(lines: string[], startIdx: number): number {
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

function extractFallbackWindow(
  lines: string[],
  line: number,
): { title: string; startLine: number; endLine: number } {
  const window = 220;
  const startIdx = Math.max(0, line - 1 - window);
  const endIdx = Math.min(lines.length - 1, line - 1 + window);
  return {
    title: `Context around line ${line}`,
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

function truncateLines(
  lines: string[],
  maxLines: number,
): { snippet: string[]; truncated: boolean } {
  if (lines.length <= maxLines) {
    return { snippet: lines, truncated: false };
  }
  const head = lines.slice(0, maxLines);
  head.push('… (truncated)');
  return { snippet: head, truncated: true };
}

function hashId(obj: any): string {
  const raw = JSON.stringify(obj);
  return crypto
    .createHash('sha1')
    .update(raw, 'utf8')
    .digest('hex')
    .slice(0, 10);
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.max(min, Math.min(max, n));
}
