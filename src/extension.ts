import * as vscode from 'vscode';
import { ClaudeWatcher } from './claudeWatcher';
import { DiffManager } from './diffManager';
import { DiffPanel } from './diffPanel';
import { ClaudeModeManager } from './claudeModeManager';

let claudeWatcher: ClaudeWatcher;
let diffManager: DiffManager;
let modeManager: ClaudeModeManager;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Diff extension activated');

  diffManager = new DiffManager();
  modeManager = new ClaudeModeManager(context);
  claudeWatcher = new ClaudeWatcher(diffManager, modeManager);

  // Status bar — shows current mode
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'claudediff.switchMode';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudediff.enable', () => {
      claudeWatcher.start();
      vscode.window.showInformationMessage('Claude Diff: Watching enabled');
    }),

    vscode.commands.registerCommand('claudediff.disable', () => {
      claudeWatcher.stop();
      vscode.window.showInformationMessage('Claude Diff: Watching disabled');
    }),

    vscode.commands.registerCommand('claudediff.switchMode', async () => {
      const mode = await modeManager.promptSwitchMode();
      if (mode) updateStatusBar();
    }),

    vscode.commands.registerCommand('claudediff.showReview', () => {
      DiffPanel.createOrShow(context.extensionUri, diffManager, modeManager);
    }),

    vscode.commands.registerCommand('claudediff.acceptAll', () => {
      diffManager.acceptAll();
      DiffPanel.currentPanel?.refresh();
      vscode.window.showInformationMessage('Accepted all Claude changes');
    }),

    vscode.commands.registerCommand('claudediff.rejectAll', () => {
      diffManager.rejectAll();
      DiffPanel.currentPanel?.refresh();
      vscode.window.showInformationMessage('Rejected all Claude changes');
    }),

    vscode.commands.registerCommand('claudediff.acceptFile', (filePath: string) => {
      diffManager.acceptFile(filePath);
      DiffPanel.currentPanel?.refresh();
    }),

    vscode.commands.registerCommand('claudediff.rejectFile', (filePath: string) => {
      diffManager.rejectFile(filePath);
      DiffPanel.currentPanel?.refresh();
    }),
  );

  // Auto-start watching
  claudeWatcher.start();

  // Listen for mode changes to show review panel automatically
  modeManager.onModeChange(() => updateStatusBar());
  diffManager.onChangesReady(() => {
    if (modeManager.currentMode !== 'auto') {
      DiffPanel.createOrShow(context.extensionUri, diffManager, modeManager);
    }
  });
}

function updateStatusBar() {
  const mode = modeManager.currentMode;
  const icons: Record<string, string> = {
    auto: '$(zap)',
    propose: '$(eye)',
    ask: '$(comment-discussion)',
  };
  const labels: Record<string, string> = {
    auto: 'Claude: Auto Edit',
    propose: 'Claude: Propose',
    ask: 'Claude: Ask First',
  };
  statusBarItem.text = `${icons[mode]} ${labels[mode]}`;
  statusBarItem.tooltip = 'Click to switch Claude Code edit mode';
}

export function deactivate() {
  claudeWatcher?.stop();
}