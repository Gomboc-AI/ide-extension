import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createOrlClient } from '../orl/orlClient';
import { diffToHunks, DiffHunk, DiffLine } from './diffRender';
import { extractResourceContexts, ResourceContext } from './resourceContext';

export type FixPreviewPayload = {
  scannedAt?: string;
  files: Array<{
    filePath: string;
    beforeText: string;
    afterText: string;
    diff: DiffLine[];
    hunks: DiffHunk[];
    contexts: ResourceContext[];
    appliedRules: string[];
  }>;
};

type PreviewCacheEntry = { capturedAtMs: number; payload: FixPreviewPayload };

export class FixPreviewService {
  private readonly cache = new Map<string, PreviewCacheEntry>();
  private static readonly CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

  constructor(
    private readonly env: { extensionPath: string; storagePath: string },
  ) {}

  public async previewSelected(args: {
    scanScope: { workspacePath: string; language: string; scannedAt?: string };
    selectedIssues: Array<{ ruleName: string; filePath: string }>;
    onProgress?: (p: {
      done: number;
      total: number;
      current?: { ruleName: string; filePath: string };
    }) => void;
  }): Promise<FixPreviewPayload> {
    const selectedIssues = Array.isArray(args.selectedIssues)
      ? args.selectedIssues
      : [];
    const scanWorkspacePath = (args.scanScope.workspacePath || '').trim();
    const scanLanguage = (args.scanScope.language || '').trim();
    if (!scanWorkspacePath || !scanLanguage) {
      throw new Error(
        'Preview requires an ORL scan scope (workspacePath + language).',
      );
    }
    if (!selectedIssues.length) {
      return { scannedAt: args.scanScope.scannedAt, files: [] };
    }

    const cacheKey = JSON.stringify({
      scanWorkspacePath,
      scanLanguage,
      scannedAt: args.scanScope.scannedAt || '',
      issues: selectedIssues,
    });
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Group by directory (ORL scan scope is directory of the file).
    const byDir = new Map<
      string,
      Array<{ ruleName: string; filePath: string }>
    >();
    for (const i of selectedIssues) {
      const fp = (i.filePath || '').trim();
      const rn = (i.ruleName || '').trim();
      if (!fp || !rn) {
        continue;
      }
      const dir = path.dirname(fp);
      const existing = byDir.get(dir) || [];
      existing.push({ ruleName: rn, filePath: fp });
      byDir.set(dir, existing);
    }

    // Read baseline texts for all referenced files from disk.
    const baselineByFile = new Map<string, string>();
    for (const i of selectedIssues) {
      const fp = (i.filePath || '').trim();
      if (!fp || baselineByFile.has(fp)) {
        continue;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fp));
      baselineByFile.set(fp, doc.getText());
    }

    const tempRoot = path.join(
      this.env.storagePath,
      'gomboc-preview',
      `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    );

    // Ensure temp root exists.
    await fs.mkdir(tempRoot, { recursive: true });

    try {
      // Copy each directory into a temp subfolder (non-recursive; scan scope is a single directory).
      const tempDirBySourceDir = new Map<string, string>();
      for (const sourceDir of byDir.keys()) {
        const destDir = path.join(tempRoot, safeSegment(sourceDir));
        await fs.mkdir(destDir, { recursive: true });
        await copyScanScopeDirectory({ sourceDir, destDir });
        tempDirBySourceDir.set(sourceDir, destDir);
      }

      const orlClient = await createOrlClient({
        extensionPath: this.env.extensionPath,
        storagePath: this.env.storagePath,
      });

      const total = selectedIssues.length;
      let done = 0;

      // Sequentially apply selected rules to the TEMP copy so previews reflect combined outcomes.
      for (const [sourceDir, issues] of byDir.entries()) {
        const tempDir = tempDirBySourceDir.get(sourceDir);
        if (!tempDir) {
          continue;
        }

        for (const issue of issues) {
          done++;
          args.onProgress?.({
            done,
            total,
            current: { ruleName: issue.ruleName, filePath: issue.filePath },
          });

          const tempFilePath = path.join(
            tempDir,
            path.basename(issue.filePath),
          );
          const result = await orlClient.remediateSingleRule({
            workspacePath: tempDir,
            language: scanLanguage,
            ruleName: issue.ruleName,
            targetFilePath: tempFilePath,
          });
          if (!result.success) {
            throw new Error(
              `Preview failed for rule ${issue.ruleName}: ${result.error || 'unknown error'}`,
            );
          }

          // Apply all modified files into temp workspace so subsequent previews chain correctly.
          for (const [orlPath, content] of Object.entries(
            result.modifiedFiles || {},
          )) {
            const rel = orlPath.replace(/^\/workspace\/+/, '');
            const abs = path.join(tempDir, rel);
            // Only allow writes within tempDir.
            if (!abs.startsWith(tempDir)) {
              continue;
            }
            await fs.writeFile(abs, content, 'utf8');
          }
        }
      }

      // Build per-file preview payload using the final state from temp dirs.
      const files: FixPreviewPayload['files'] = [];
      const appliedRulesByFile = new Map<string, string[]>();
      for (const i of selectedIssues) {
        const fp = (i.filePath || '').trim();
        const rn = (i.ruleName || '').trim();
        if (!fp || !rn) {
          continue;
        }
        const existing = appliedRulesByFile.get(fp) || [];
        if (!existing.includes(rn)) {
          existing.push(rn);
        }
        appliedRulesByFile.set(fp, existing);
      }

      for (const [filePath, beforeText] of baselineByFile.entries()) {
        const sourceDir = path.dirname(filePath);
        const tempDir = tempDirBySourceDir.get(sourceDir);
        let afterText = beforeText;
        if (tempDir) {
          const tempFilePath = path.join(tempDir, path.basename(filePath));
          afterText = await fs
            .readFile(tempFilePath, 'utf8')
            .catch(() => beforeText);
        }
        const diff = diffToHunks(beforeText, afterText);
        const contexts = extractResourceContexts({
          filePath,
          languageHint: scanLanguage,
          text: afterText,
          hunks: diff.hunks,
        });
        files.push({
          filePath,
          beforeText,
          afterText,
          diff: diff.lines.slice(0, 4000),
          hunks: diff.hunks,
          contexts,
          appliedRules: appliedRulesByFile.get(filePath) || [],
        });
      }

      const payload: FixPreviewPayload = {
        scannedAt: args.scanScope.scannedAt,
        files: files.sort((a, b) => a.filePath.localeCompare(b.filePath)),
      };
      this.setCache(cacheKey, payload);
      return payload;
    } finally {
      // Best-effort cleanup.
      fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  private getCache(key: string): FixPreviewPayload | undefined {
    const hit = this.cache.get(key);
    if (!hit) {
      return undefined;
    }
    if (Date.now() - hit.capturedAtMs > FixPreviewService.CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.payload;
  }

  private setCache(key: string, payload: FixPreviewPayload): void {
    this.cache.set(key, { capturedAtMs: Date.now(), payload });
  }
}

function safeSegment(p: string): string {
  // Convert an absolute path into a stable folder name for temp usage.
  // Example: /a/b/c -> a__b__c
  const parts = p.split(path.sep).filter(Boolean);
  return parts.join('__').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

async function copyScanScopeDirectory(args: {
  sourceDir: string;
  destDir: string;
}): Promise<void> {
  const entries = await fs.readdir(args.sourceDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) {
      continue;
    }
    const name = e.name;
    if (shouldSkip(name)) {
      continue;
    }
    const src = path.join(args.sourceDir, name);
    const dest = path.join(args.destDir, name);
    await fs.copyFile(src, dest);
  }
}

function shouldSkip(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('.')) {
    return true;
  }
  if (lower === 'node_modules') {
    return true;
  }
  if (lower.startsWith('dockerfile')) {
    return false;
  }
  // Common IaC file types we care about in scan scope directories.
  const exts = ['.tf', '.hcl', '.tfvars', '.yaml', '.yml', '.json', '.tpl'];
  return !exts.some(ext => lower.endsWith(ext));
}
