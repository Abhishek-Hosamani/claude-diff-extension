import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ClaudeMode = 'auto' | 'propose' | 'ask';

/**
 * Manages Claude Code's edit mode and syncs it with
 * the ~/.claude/settings.json that Claude Code reads.
 *
 * Modes:
 *  auto    → Claude edits files immediately (default Claude Code behavior)
 *  propose → Claude writes changes to a staging area; extension shows diff before applying
 *  ask     → Before ANY edit, Claude is intercepted; user approves each file
 */
export class ClaudeModeManager {
  private _mode: ClaudeMode;
  private _onModeChange = new vscode.EventEmitter<ClaudeMode>();
  readonly onModeChange = this._onModeChange.event;

  private claudeSettingsPath: string;

  constructor(private context: vscode.ExtensionContext) {
    this.claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    this._mode = (context.globalState.get<ClaudeMode>('claudeMode')) || 'propose';
    this.syncToClaudeSettings();
  }

  get currentMode(): ClaudeMode {
    return this._mode;
  }

  async setMode(mode: ClaudeMode) {
    this._mode = mode;
    await this.context.globalState.update('claudeMode', mode);
    this.syncToClaudeSettings();
    this._onModeChange.fire(mode);
  }

  async promptSwitchMode(): Promise<ClaudeMode | undefined> {
    const items = [
      {
        label: '$(zap) Auto Edit',
        description: 'Claude applies changes immediately',
        mode: 'auto' as ClaudeMode,
      },
      {
        label: '$(eye) Propose Changes',
        description: 'Claude proposes; you review diff before applying',
        mode: 'propose' as ClaudeMode,
      },
      {
        label: '$(comment-discussion) Ask Before Each Edit',
        description: 'Claude asks permission before editing each file',
        mode: 'ask' as ClaudeMode,
      },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Claude Code Edit Mode',
      placeHolder: `Current: ${this._mode}`,
    });

    if (picked) {
      await this.setMode(picked.mode);
      return picked.mode;
    }
    return undefined;
  }

  /**
   * Syncs mode into Claude Code's settings file so Claude Code
   * respects the chosen behavior natively.
   *
   * Claude Code settings reference:
   *   autoApproveEdits: true  → auto mode
   *   autoApproveEdits: false + dryRun: true → propose mode
   *   autoApproveEdits: false → ask mode
   */
  private syncToClaudeSettings() {
    try {
      const dir = path.dirname(this.claudeSettingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let settings: Record<string, unknown> = {};
      if (fs.existsSync(this.claudeSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(this.claudeSettingsPath, 'utf8'));
      }

      switch (this._mode) {
        case 'auto':
          settings.autoApproveEdits = true;
          settings.dryRun = false;
          break;
        case 'propose':
          settings.autoApproveEdits = false;
          settings.dryRun = true;         // Claude Code dry-run: writes to .claude/proposed/
          break;
        case 'ask':
          settings.autoApproveEdits = false;
          settings.dryRun = false;
          break;
      }

      fs.writeFileSync(this.claudeSettingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.warn('Could not sync to Claude settings:', e);
    }
  }
}
