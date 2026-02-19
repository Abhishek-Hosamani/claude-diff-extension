import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff'; // npm install diff @types/diff

export interface FileDiff {
  filePath: string;         // absolute path
  relativePath: string;     // relative to workspace root
  before: string;
  after: string;
  patch: string;            // unified diff string
  status: 'pending' | 'accepted' | 'rejected';
  isNew: boolean;
  isDeleted: boolean;
}

export class DiffManager {
  private snapshots = new Map<string, string>(); // path → original content
  private diffs = new Map<string, FileDiff>();

  private _onChangesReady = new vscode.EventEmitter<FileDiff[]>();
  readonly onChangesReady = this._onChangesReady.event;

  get workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  }

  /** Called before Claude starts — snapshot current files */
  snapshotFiles(filePaths: string[]) {
    for (const fp of filePaths) {
      if (fs.existsSync(fp)) {
        this.snapshots.set(fp, fs.readFileSync(fp, 'utf8'));
      } else {
        this.snapshots.set(fp, ''); // new file
      }
    }
  }

  snapshotWorkspace() {
    const root = this.workspaceRoot;
    if (!root) return;
    this.snapshotDirectory(root);
  }

  private snapshotDirectory(dir: string) {
    const ignore = new Set(['node_modules', '.git', 'dist', 'out', '.claude']);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.snapshotDirectory(full);
      } else if (entry.isFile() && this.isTextFile(full)) {
        this.snapshots.set(full, fs.readFileSync(full, 'utf8'));
      }
    }
  }

  /** Called after Claude finishes — compute diffs */
  computeDiffs(changedPaths?: string[]) {
    const paths = changedPaths ?? [...this.snapshots.keys()];
    this.diffs.clear();

    for (const fp of paths) {
      const before = this.snapshots.get(fp) ?? '';
      const exists = fs.existsSync(fp);
      const after = exists ? fs.readFileSync(fp, 'utf8') : '';

      if (before === after) continue;

      const rel = path.relative(this.workspaceRoot, fp);
      const patch = createTwoFilesPatch(
        `a/${rel}`, `b/${rel}`, before, after, '', ''
      );

      this.diffs.set(fp, {
        filePath: fp,
        relativePath: rel,
        before,
        after,
        patch,
        status: 'pending',
        isNew: before === '' && after !== '',
        isDeleted: before !== '' && after === '',
      });
    }

    if (this.diffs.size > 0) {
      this._onChangesReady.fire(this.getPendingDiffs());
    }

    return this.getPendingDiffs();
  }

  /** Called when Claude proposes changes (dry-run mode) */
  loadProposedChanges(proposedDir: string) {
    if (!fs.existsSync(proposedDir)) return;
    const root = this.workspaceRoot;

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const relative = path.relative(proposedDir, full);
          const actual = path.join(root, relative);
          const before = fs.existsSync(actual) ? fs.readFileSync(actual, 'utf8') : '';
          const after = fs.readFileSync(full, 'utf8');
          if (before !== after) {
            const patch = createTwoFilesPatch(
              `a/${relative}`, `b/${relative}`, before, after, '', ''
            );
            this.diffs.set(actual, {
              filePath: actual,
              relativePath: relative,
              before,
              after,
              patch,
              status: 'pending',
              isNew: before === '',
              isDeleted: false,
            });
          }
        }
      }
    };
    walk(proposedDir);

    if (this.diffs.size > 0) {
      this._onChangesReady.fire(this.getPendingDiffs());
    }
  }

  getPendingDiffs(): FileDiff[] {
    return [...this.diffs.values()].filter(d => d.status === 'pending');
  }

  getAllDiffs(): FileDiff[] {
    return [...this.diffs.values()];
  }

  acceptFile(filePath: string) {
    const diff = this.diffs.get(filePath);
    if (!diff) return;
    // Changes already on disk — just mark accepted
    diff.status = 'accepted';
    this.snapshots.set(filePath, diff.after);
  }

  rejectFile(filePath: string) {
    const diff = this.diffs.get(filePath);
    if (!diff) return;
    // Restore original
    if (diff.isNew) {
      fs.unlinkSync(filePath);
    } else {
      fs.writeFileSync(filePath, diff.before, 'utf8');
    }
    diff.status = 'rejected';
  }

  acceptAll() {
    for (const diff of this.diffs.values()) {
      if (diff.status === 'pending') this.acceptFile(diff.filePath);
    }
  }

  rejectAll() {
    for (const diff of this.diffs.values()) {
      if (diff.status === 'pending') this.rejectFile(diff.filePath);
    }
  }

  clearDiffs() {
    this.diffs.clear();
    this.snapshots.clear();
  }

  hasPendingDiffs(): boolean {
    return this.getPendingDiffs().length > 0;
  }

  private isTextFile(fp: string): boolean {
    const textExts = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.scss',
      '.html', '.xml', '.yaml', '.yml', '.py', '.go', '.rs', '.java', '.c',
      '.cpp', '.h', '.sh', '.env', '.toml', '.ini', '.sql',
    ]);
    return textExts.has(path.extname(fp).toLowerCase());
  }
}
