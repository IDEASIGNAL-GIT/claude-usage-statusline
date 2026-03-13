# claude-usage-statusline

Claude Code status bar showing **context usage** and **5h / 7d plan limits** in real time.

```
Claude Sonnet 4.6 │ WORKSPACE ██░░░░░░░░ 18%  5h:30% 7d:48%
```

- **Context bar** — how much of the usable context window you've consumed (auto-compact normalized)
- **5h** — 5-hour billing block utilization (green / yellow / red)
- **7d** — 7-day rolling usage (green / yellow / red)

Works on **macOS**, **Windows**, and **Linux**. No external dependencies — only Node.js built-ins.

---

## Installation

### 1. Download the script

**Option A — clone**
```bash
git clone https://github.com/YOUR_USERNAME/claude-usage-statusline.git
```

**Option B — single file**
```bash
# macOS / Linux
curl -o ~/.claude/hooks/statusline.js \
  https://raw.githubusercontent.com/YOUR_USERNAME/claude-usage-statusline/main/statusline.js

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/YOUR_USERNAME/claude-usage-statusline/main/statusline.js" `
  -OutFile "$env:USERPROFILE\.claude\hooks\statusline.js"
```

### 2. Configure Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/absolute/path/to/statusline.js\""
  }
}
```

**macOS / Linux example:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/Users/yourname/.claude/hooks/statusline.js\""
  }
}
```

**Windows example:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:/Users/yourname/.claude/hooks/statusline.js\""
  }
}
```

Then restart Claude Code.

---

## How it works

### Credentials

The script reads your OAuth access token to call the Anthropic usage API:

| Platform | Location |
|----------|----------|
| macOS    | Keychain (`Claude Code-credentials`), falls back to `~/.claude/.credentials.json` |
| Windows  | `~/.claude/.credentials.json` |
| Linux    | `~/.claude/.credentials.json` |

The token never leaves your machine — it's only used to call `https://api.anthropic.com/api/oauth/usage`.

### Caching

Usage data is cached for **5 minutes** in a temp file (`claude-usage-statusline-cache.json`) to avoid hitting the API on every status bar refresh.

### Color coding

| Color | Meaning |
|-------|---------|
| 🟢 Green | Under 50% used |
| 🟡 Yellow | 50–79% used |
| 🔴 Red | 80%+ used |

---

## Troubleshooting

**Usage limits not showing (`5h:?  7d:?`)**

The API call may have failed. Check that you're logged in to Claude Code:
```bash
claude auth status
```

**Script hangs**

The stdin timeout is 3 seconds. Make sure the `command` in `settings.json` points to the correct absolute path.

**macOS Keychain prompt**

First run may trigger a Keychain access prompt — click "Always Allow" to avoid future prompts.

---

## Requirements

- Node.js 18+
- Claude Code with an active login (OAuth)

---

## License

MIT
