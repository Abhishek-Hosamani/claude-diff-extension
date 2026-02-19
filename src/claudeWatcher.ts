import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar'; // npm install chokidar
import { DiffManager } from './diffManager';
import { ClaudeModeManager } from './claudeModeManager';

/**
 * Watches for Claude Code activity by:
 * 1. Monitoring the .claude/activity.json file Claude writes during runs
 * 2. Using chokidar to watch filesystem changes while Claude is active
 * 3. Watching .claude/proposed/ directory in propose (dry-run) mode
 */
export class ClaudeWatcher {
  private fsWatcher?: chokidar.FSWatcher;
  private activityWatcher?: fs.FSWatcher;
  private changedFiles = new Set<string>();
  private isClaudeActive = false;
  private active = false;

  constructor(
    private diffManager: DiffManager,
    private modeManager: ClaudeModeManager,
  ) {}

  start() {
    if (this.active) return;
    this.active = true;
    this.watchClaudeActivity();
    console.log('[ClaudeDiff] Watcher started');
  }

  stop() {
    this.active = false;
    this.fsWatcher?.close();
    this.activityWatcher?.close();
    console.log('[ClaudeDiff] Watcher stopped');
  }

  /**
   * Watch .claude/activity.json — Claude Code writes this when it starts/stops.
   * Structure: { "status": "running" | "idle", "session": "..." }
   */
  private watchClaudeActivity() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    const activityFile = path.join(root, '.claude', 'activity.json');
    const proposedDir = path.join(root, '.claude', 'proposed');

    // Poll for activity file
    const poll = setInterval(() => {
      if (!this.active) { clearInterval(poll); return; }

      if (!fs.existsSync(activityFile)) return;

      try {
        const data = JSON.parse(fs.readFileSync(activityFile, 'utf8'));

        if (data.status === 'running' && !this.isClaudeActive) {
          this.onClaudeStarted(root);
        } else if (data.status === 'idle' && this.isClaudeActive) {
          this.onClaudeFinished(root, proposedDir);
        }
      } catch {}
    }, 500);
  }

  private onClaudeStarted(root: string) {
    this.isClaudeActive = true;
    this.changedFiles.clear();
    const mode = this.modeManager.currentMode;

    console.log(`[ClaudeDiff] Claude started in ${mode} mode`);

    if (mode === 'propose') {
      // In propose mode, Claude writes to .claude/proposed/ — watch that dir
      const proposedDir = path.join(root, '.claude', 'proposed');
      this.fsWatcher = chokidar.watch(proposedDir, { ignoreInitial: true });
      this.fsWatcher.on('add', (fp) => this.changedFiles.add(fp));
      this.fsWatcher.on('change', (fp) => this.changedFiles.add(fp));
    } else if (mode === 'auto') {
      // Snapshot everything, then watch for actual changes
      this.diffManager.snapshotWorkspace();
      this.fsWatcher = chokidar.watch(root, {
        ignored: /(node_modules|\.git|dist|out|\.claude)/,
        ignoreInitial: true,
      });
      this.fsWatcher.on('add', (fp) => this.changedFiles.add(fp));
      this.fsWatcher.on('change', (fp) => this.changedFiles.add(fp));
      this.fsWatcher.on('unlink', (fp) => this.changedFiles.add(fp));
    } else if (mode === 'ask') {
      // In ask mode, snapshot before each potential edit
      this.diffManager.snapshotWorkspace();
    }
  }

  private onClaudeFinished(root: string, proposedDir: string) {
    this.isClaudeActive = false;
    this.fsWatcher?.close();
    const mode = this.modeManager.currentMode;

    console.log(`[ClaudeDiff] Claude finished. Changed files: ${this.changedFiles.size}`);

    if (mode === 'propose') {
      this.diffManager.loadProposedChanges(proposedDir);
    } else if (mode === 'auto' || mode === 'ask') {
      this.diffManager.computeDiffs([...this.changedFiles]);
    }
  }
}
