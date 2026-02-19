import * as vscode from 'vscode';
import { DiffManager, FileDiff } from './diffManager';
import { ClaudeModeManager } from './claudeModeManager';

export class DiffPanel {
  static currentPanel: DiffPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    diffManager: DiffManager,
    modeManager: ClaudeModeManager,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : undefined;

    if (DiffPanel.currentPanel) {
      DiffPanel.currentPanel._panel.reveal(column);
      DiffPanel.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeDiff',
      'Claude Changes',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DiffPanel.currentPanel = new DiffPanel(panel, diffManager, modeManager);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private diffManager: DiffManager,
    private modeManager: ClaudeModeManager,
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.command) {
          case 'acceptFile':
            this.diffManager.acceptFile(msg.filePath);
            this._update();
            break;
          case 'rejectFile':
            this.diffManager.rejectFile(msg.filePath);
            this._update();
            break;
          case 'acceptAll':
            this.diffManager.acceptAll();
            this._update();
            break;
          case 'rejectAll':
            this.diffManager.rejectAll();
            this._update();
            break;
          case 'switchMode':
            await this.modeManager.promptSwitchMode();
            this._update();
            break;
          case 'openFile':
            vscode.commands.executeCommand(
              'vscode.open',
              vscode.Uri.file(msg.filePath)
            );
            break;
          case 'openDiff': {
            const diff = this.diffManager
              .getAllDiffs()
              .find(d => d.filePath === msg.filePath);
            if (diff) {
              await this._openNativeDiff(diff);
            }
            break;
          }
        }
      },
      null,
      this._disposables,
    );
  }

  refresh() {
    this._update();
  }

  private async _openNativeDiff(diff: FileDiff) {
    // Use VS Code's built-in diff editor for line-level review
    const scheme = 'claude-before';
    const provider = {
      provideTextDocumentContent: () => diff.before,
    };
    const reg = vscode.workspace.registerTextDocumentContentProvider(scheme, provider);
    const beforeUri = vscode.Uri.parse(`${scheme}:${diff.relativePath}`);
    const afterUri = vscode.Uri.file(diff.filePath);
    await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `Claude: ${diff.relativePath}`);
    reg.dispose();
  }

  private _update() {
    const diffs = this.diffManager.getAllDiffs();
    const mode = this.modeManager.currentMode;
    this._panel.webview.html = getWebviewContent(diffs, mode);
  }

  dispose() {
    DiffPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

function getWebviewContent(diffs: FileDiff[], mode: string): string {
  const pending = diffs.filter(d => d.status === 'pending');
  const accepted = diffs.filter(d => d.status === 'accepted');
  const rejected = diffs.filter(d => d.status === 'rejected');

  const modeLabel: Record<string, string> = {
    auto: '⚡ Auto Edit',
    propose: '👁 Propose',
    ask: '💬 Ask First',
  };

  // const renderDiff = (diff: FileDiff) => {
  //   const lines = diff.patch.split('\n').slice(4); // skip patch header
  //   const rendered = lines.map(line => {
  //     if (line.startsWith('+') && !line.startsWith('+++')) {
  //       return `<div class="line added"><span class="sign">+</span>${esc(line.slice(1))}</div>`;
  //     } else if (line.startsWith('-') && !line.startsWith('---')) {
  //       return `<div class="line removed"><span class="sign">-</span>${esc(line.slice(1))}</div>`;
  //     } else if (line.startsWith('@@')) {
  //       return `<div class="line hunk">${esc(line)}</div>`;
  //     } else {
  //       return `<div class="line context"><span class="sign"> </span>${esc(line.slice(1))}</div>`;
  //     }
  //   }).join('');

  //   const statusClass = diff.status === 'accepted' ? 'accepted' : diff.status === 'rejected' ? 'rejected' : '';
  //   const badge = diff.isNew ? '<span class="badge new">NEW</span>' : diff.isDeleted ? '<span class="badge del">DEL</span>' : '';

  //   return `
  //     <div class="file-card ${statusClass}" id="file-${btoa(diff.filePath)}">
  //       <div class="file-header">
  //         <div class="file-meta">
  //           <span class="file-icon">📄</span>
  //           <span class="file-name">${esc(diff.relativePath)}</span>
  //           ${badge}
  //           ${diff.status !== 'pending' ? `<span class="status-tag ${diff.status}">${diff.status}</span>` : ''}
  //         </div>
  //         ${diff.status === 'pending' ? `
  //         <div class="file-actions">
  //           <button class="btn btn-open" onclick="openDiff('${esc(diff.filePath)}')">⊞ Diff</button>
  //           <button class="btn btn-reject" onclick="rejectFile('${esc(diff.filePath)}')">✕ Reject</button>
  //           <button class="btn btn-accept" onclick="acceptFile('${esc(diff.filePath)}')">✓ Accept</button>
  //         </div>` : ''}
  //       </div>
  //       <div class="diff-body">
  //         <code class="diff-code">${rendered || '<div class="line context">No changes</div>'}</code>
  //       </div>
  //     </div>
  //   `;
  // };

  return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Changes</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Sora:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d0f14;
    --surface: #141720;
    --surface2: #1c2030;
    --border: #252a3a;
    --accent: #4f8fff;
    --accent-dim: #2a4a8a;
    --green: #2ea84380;
    --green-text: #3dd68c;
    --green-border: #2ea843;
    --red: #f4433620;
    --red-text: #ff6b6b;
    --red-border: #f44336;
    --yellow: #ffd60a20;
    --yellow-text: #ffd60a;
    --text: #e0e6f0;
    --text-muted: #7a8499;
    --mono: 'JetBrains Mono', monospace;
    --sans: 'Sora', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.6;
    min-height: 100vh;
  }

  /* Top bar */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
    background: linear-gradient(135deg, #4f8fff, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .stats {
    display: flex;
    gap: 8px;
  }

  .stat-chip {
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--mono);
  }
  .stat-chip.pending { background: var(--yellow); color: var(--yellow-text); border: 1px solid #ffd60a40; }
  .stat-chip.accepted { background: #2ea84320; color: var(--green-text); border: 1px solid #2ea84340; }
  .stat-chip.rejected { background: #f4433620; color: var(--red-text); border: 1px solid #f4433640; }

  .mode-badge {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid var(--accent);
    cursor: pointer;
    transition: all 0.15s;
  }
  .mode-badge:hover { background: var(--accent); color: white; }

  .topbar-right {
    display: flex;
    gap: 8px;
  }

  /* Bulk action buttons */
  .bulk-btn {
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--sans);
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s;
  }
  .bulk-btn.reject-all {
    background: transparent;
    border-color: var(--red-border);
    color: var(--red-text);
  }
  .bulk-btn.reject-all:hover { background: var(--red); }
  .bulk-btn.accept-all {
    background: var(--green-border);
    border-color: var(--green-border);
    color: #fff;
  }
  .bulk-btn.accept-all:hover { opacity: 0.85; }

  /* Main content */
  .content {
    padding: 20px;
    max-width: 100%;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin-bottom: 12px;
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-label:first-child { margin-top: 0; }
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted);
  }
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 8px; }

  /* File card */
  .file-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .file-card:hover { border-color: #3a4060; }
  .file-card.accepted { border-color: var(--green-border); opacity: 0.7; }
  .file-card.rejected { border-color: var(--red-border); opacity: 0.5; }

  .file-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .file-icon { font-size: 14px; flex-shrink: 0; }

  .file-name {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .badge.new { background: #4f8fff30; color: var(--accent); border: 1px solid var(--accent); }
  .badge.del { background: var(--red); color: var(--red-text); border: 1px solid var(--red-border); }

  .status-tag {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }
  .status-tag.accepted { background: var(--green); color: var(--green-text); }
  .status-tag.rejected { background: var(--red); color: var(--red-text); }

  .file-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn {
    padding: 4px 12px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--sans);
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s;
  }
  .btn-open {
    background: transparent;
    border-color: var(--border);
    color: var(--text-muted);
  }
  .btn-open:hover { border-color: var(--accent); color: var(--accent); }
  .btn-accept {
    background: var(--green-border);
    border-color: var(--green-border);
    color: #fff;
  }
  .btn-accept:hover { opacity: 0.85; }
  .btn-reject {
    background: transparent;
    border-color: var(--red-border);
    color: var(--red-text);
  }
  .btn-reject:hover { background: var(--red); }

  /* Diff display */
  .diff-body {
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }

  .diff-code {
    display: block;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.7;
  }

  .line {
    display: flex;
    padding: 0 16px;
    white-space: pre;
    min-width: max-content;
  }
  .line .sign {
    width: 16px;
    flex-shrink: 0;
    opacity: 0.5;
  }
  .line.added {
    background: var(--green);
    color: var(--green-text);
    border-left: 2px solid var(--green-border);
  }
  .line.removed {
    background: var(--red);
    color: var(--red-text);
    border-left: 2px solid var(--red-border);
  }
  .line.context {
    color: var(--text-muted);
  }
  .line.hunk {
    color: var(--accent);
    background: #4f8fff10;
    padding: 2px 16px;
    font-size: 11px;
    opacity: 0.8;
  }

  /* Mode info box */
  .mode-info {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
  }
  .mode-info .mode-icon { font-size: 20px; flex-shrink: 0; }
  .mode-info strong { color: var(--text); }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2f45; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a4060; }
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <span class="logo">Claude Diff</span>
    <div class="stats">
      ${pending.length > 0 ? `<span class="stat-chip pending">${pending.length} pending</span>` : ''}
      ${accepted.length > 0 ? `<span class="stat-chip accepted">${accepted.length} accepted</span>` : ''}
      ${rejected.length > 0 ? `<span class="stat-chip rejected">${rejected.length} rejected</span>` : ''}
    </div>
    <button class="mode-badge" onclick="switchMode()">${modeLabel[mode] || mode}</button>
  </div>
  ${pending.length > 0 ? `
  <div class="topbar-right">
    <button class="bulk-btn reject-all" onclick="rejectAll()">✕ Reject All</button>
    <button class="bulk-btn accept-all" onclick="acceptAll()">✓ Accept All</button>
  </div>` : ''}
</div>

<div class="content">

  ${diffs.length === 0 ? `
  <div class="empty-state">
    <div class="empty-icon">🤖</div>
    <div class="empty-title">No changes yet</div>
    <p>Run Claude Code to see proposed changes here.</p>
  </div>
  ` : ''}

  ${getModeInfoHtml(mode)}

  ${pending.length > 0 ? `<div class="section-label">Pending Review (${pending.length})</div>` : ''}
  ${pending.map(renderDiff).join('')}

  ${accepted.length > 0 ? `<div class="section-label">Accepted (${accepted.length})</div>` : ''}
  ${accepted.map(renderDiff).join('')}

  ${rejected.length > 0 ? `<div class="section-label">Rejected (${rejected.length})</div>` : ''}
  ${rejected.map(renderDiff).join('')}

</div>

<script>
  const vscode = acquireVsCodeApi();

  function acceptFile(fp) { vscode.postMessage({ command: 'acceptFile', filePath: fp }); }
  function rejectFile(fp) { vscode.postMessage({ command: 'rejectFile', filePath: fp }); }
  function acceptAll()    { vscode.postMessage({ command: 'acceptAll' }); }
  function rejectAll()    { vscode.postMessage({ command: 'rejectAll' }); }
  function switchMode()   { vscode.postMessage({ command: 'switchMode' }); }
  function openDiff(fp)   { vscode.postMessage({ command: 'openDiff', filePath: fp }); }
</script>
</body>
</html>`;

  function getModeInfoHtml(mode: string): string {
    if (mode === 'auto') return `
      <div class="mode-info">
        <span class="mode-icon">⚡</span>
        <div><strong>Auto Edit mode</strong> — Claude applies changes immediately. This panel shows what was changed so you can review and roll back individual files.</div>
      </div>`;
    if (mode === 'propose') return `
      <div class="mode-info">
        <span class="mode-icon">👁</span>
        <div><strong>Propose mode</strong> — Claude stages changes without touching your files. Review each file below and accept what you want applied.</div>
      </div>`;
    if (mode === 'ask') return `
      <div class="mode-info">
        <span class="mode-icon">💬</span>
        <div><strong>Ask First mode</strong> — Claude asks before editing each file. Changes that were approved appear here for final confirmation.</div>
      </div>`;
    return '';
  }

  function renderDiff(diff: FileDiff): string {
    const lines = diff.patch.split('\n').slice(4);
    const rendered = lines.map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return `<div class="line added"><span class="sign">+</span>${esc(line.slice(1))}</div>`;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return `<div class="line removed"><span class="sign">-</span>${esc(line.slice(1))}</div>`;
      } else if (line.startsWith('@@')) {
        return `<div class="line hunk">${esc(line)}</div>`;
      } else {
        return `<div class="line context"><span class="sign"> </span>${esc(line.slice(1))}</div>`;
      }
    }).join('');

    const statusClass = diff.status === 'accepted' ? 'accepted' : diff.status === 'rejected' ? 'rejected' : '';
    const badge = diff.isNew ? '<span class="badge new">NEW</span>' : diff.isDeleted ? '<span class="badge del">DEL</span>' : '';
    const fp = diff.filePath.replace(/'/g, "\\'");

    return `
      <div class="file-card ${statusClass}">
        <div class="file-header">
          <div class="file-meta">
            <span class="file-icon">📄</span>
            <span class="file-name">${esc(diff.relativePath)}</span>
            ${badge}
            ${diff.status !== 'pending' ? `<span class="status-tag ${diff.status}">${diff.status}</span>` : ''}
          </div>
          ${diff.status === 'pending' ? `
          <div class="file-actions">
            <button class="btn btn-open" onclick="openDiff('${fp}')">⊞ Diff</button>
            <button class="btn btn-reject" onclick="rejectFile('${fp}')">✕ Reject</button>
            <button class="btn btn-accept" onclick="acceptFile('${fp}')">✓ Accept</button>
          </div>` : ''}
        </div>
        <div class="diff-body">
          <code class="diff-code">${rendered || '<div class="line context">No displayable changes</div>'}</code>
        </div>
      </div>
    `;
  }

  function esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
