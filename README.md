# Claude Diff 🤖

> **Review, accept, and reject Claude Code changes — Cursor-style, inside VS Code / Cursor.**

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

When Claude Code edits your files, changes happen fast and it's hard to track what exactly changed. **Claude Diff** gives you a dedicated review panel — similar to Cursor's agent diff view — where you can see every change Claude made, file by file, and decide what to keep.

```
Claude Code runs → Watcher detects changes → Diff panel opens → You accept or reject
```

---

## Features

- 🔍 **Per-file diff view** — see exactly what Claude added, removed, or created
- ✅ **Accept / Reject** — per file or all at once with one click
- ⚡ **Three edit modes** — synced directly with Claude Code's settings
- 👁 **Propose mode** — Claude stages changes without touching your real files until you approve
- 🔄 **Auto-detects Claude activity** — panel opens automatically when Claude finishes
- ⊞ **Native VS Code diff** — open any file in VS Code's built-in side-by-side diff editor

---

## Three Modes

Switch modes from the status bar (`Claude: Propose`) at the bottom of your editor.

| Mode | What Claude does | What you get |
|---|---|---|
| ⚡ **Auto Edit** | Edits files immediately | Review what changed, rollback per file |
| 👁 **Propose** | Writes to staging only — your files untouched | Full review before anything is applied |
| 💬 **Ask First** | Asks in terminal before each file | Panel shows approved changes for final confirm |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+4` | Open Claude Diff panel |
| `Ctrl+Shift+1` | Accept all changes |
| `Ctrl+Shift+2` | Reject all changes |
| `Ctrl+Shift+3` | Switch mode |

Or use the Command Palette (`Ctrl+Shift+P`) and search **Claude Diff**.

---

## Installation

### From VS Code Marketplace
Search **"Claude Diff"** in the Extensions panel (`Ctrl+Shift+X`) and click Install.

### Manual (.vsix)
```bash
code --install-extension claude-diff-0.1.0.vsix
```

---

## Local Development Setup

```bash
git clone https://github.com/Abhishek-Hosamani/claude-diff-extension.git
cd claude-diff-extension
npm install
npm run compile
```

Press **F5** in VS Code/Cursor to launch the Extension Development Host and test live.

---

## How Claude Code Sync Works

The extension writes directly to `~/.claude/settings.json` when you switch modes, so Claude Code natively respects the behavior:

```json
// Propose mode (recommended default)
{ "autoApproveEdits": false, "dryRun": true }

// Auto Edit mode  
{ "autoApproveEdits": true, "dryRun": false }

// Ask First mode
{ "autoApproveEdits": false, "dryRun": false }
```

In **Propose mode**, Claude Code writes all changes to `.claude/proposed/` — your actual files are never touched until you click Accept.

---

## Project Structure

```
src/
├── extension.ts          # Entry point, commands, status bar
├── claudeModeManager.ts  # Mode state, syncs ~/.claude/settings.json
├── claudeWatcher.ts      # Detects Claude start/stop, watches filesystem
├── diffManager.ts        # Snapshots, diffs, accept/reject logic
└── diffPanel.ts          # Webview UI — the diff review panel
```

---

## Roadmap

- [ ] Hunk-level accept/reject (line by line, not just per file)
- [ ] Git auto-commit accepted changes
- [ ] Side-by-side diff layout
- [ ] Claude session history — browse past runs
- [ ] Streaming diffs — see changes as Claude writes them

---

## Contributing

PRs welcome! Open an issue first to discuss what you'd like to change.

---

## License

MIT © [Abhishek Hosamani](https://github.com/Abhishek-Hosamani)
