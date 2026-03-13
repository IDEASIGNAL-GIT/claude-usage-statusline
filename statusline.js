#!/usr/bin/env node
/**
 * claude-usage-statusline
 * Shows Claude Code context usage + 5h/7d plan limits in the status bar.
 *
 * Works on macOS, Windows, and Linux.
 * https://github.com/YOUR_USERNAME/claude-usage-statusline
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────
const USAGE_API = 'https://api.anthropic.com/api/oauth/usage';
const USAGE_BETA_HEADER = 'oauth-2025-04-20';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_FILE = path.join(os.tmpdir(), 'claude-usage-statusline-cache.json');
const AUTO_COMPACT_BUFFER_PCT = 16.5;

// ─── Credential helpers ───────────────────────────────────────────────────────

function getTokenFromFile() {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const credFile = path.join(claudeDir, '.credentials.json');
  try {
    const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function getTokenMacOS() {
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const creds = JSON.parse(raw);
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function getAccessToken() {
  // macOS: try Keychain first, fall back to file
  if (process.platform === 'darwin') {
    return getTokenMacOS() || getTokenFromFile();
  }
  // Windows / Linux: read from file
  return getTokenFromFile();
}

// ─── Usage API ────────────────────────────────────────────────────────────────

function fetchUsageSync(token) {
  // Use a one-liner node child process to make the HTTPS request synchronously
  const script = `
    const https = require('https');
    const opts = {
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      headers: {
        'Authorization': 'Bearer ${token.replace(/'/g, "\\'")}',
        'anthropic-beta': '${USAGE_BETA_HEADER}',
        'User-Agent': 'claude-code/2.0.32'
      }
    };
    https.get(opts, r => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => process.stdout.write(b));
    }).on('error', () => process.stdout.write('{}'));
  `.replace(/\n\s*/g, ' ');

  try {
    const result = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      timeout: 4000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(result || '{}');
  } catch {
    return null;
  }
}

function getUsageData(token) {
  // Try cache first
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data;
      }
    }
  } catch {}

  // Fetch fresh data
  const data = fetchUsageSync(token);
  if (data) {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }
  return data;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function usageColor(pct) {
  if (pct == null) return 2;   // dim
  if (pct >= 80) return 31;    // red
  if (pct >= 50) return 33;    // yellow
  return 32;                   // green
}

function fmtPct(v) {
  return v == null ? '?' : `${Math.round(v)}%`;
}

function buildContextBar(remaining) {
  if (remaining == null) return '';
  const usableRemaining = Math.max(
    0,
    ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100
  );
  const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
  const filled = Math.floor(used / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  if (used < 50) return ` \x1b[32m${bar} ${used}%\x1b[0m`;
  if (used < 65) return ` \x1b[33m${bar} ${used}%\x1b[0m`;
  if (used < 80) return ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
  return ` \x1b[5;31m💀 ${bar} ${used}%\x1b[0m`;
}

function buildUsageStr(usageData) {
  if (!usageData || (!usageData.five_hour && !usageData.seven_day)) return '';
  const fh = usageData.five_hour?.utilization;
  const sd = usageData.seven_day?.utilization;
  const fhStr = `\x1b[${usageColor(fh)}m${fmtPct(fh)}\x1b[0m`;
  const sdStr = `\x1b[${usageColor(sd)}m${fmtPct(sd)}\x1b[0m`;
  return ` \x1b[2m5h:\x1b[0m${fhStr} \x1b[2m7d:\x1b[0m${sdStr}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // Context bar
    const ctx = buildContextBar(remaining);

    // Write bridge file for context-monitor hook (best-effort)
    if (session) {
      try {
        const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
        const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
        const usableRemaining = remaining != null
          ? Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100)
          : null;
        const used = usableRemaining != null
          ? Math.max(0, Math.min(100, Math.round(100 - usableRemaining)))
          : null;
        fs.writeFileSync(bridgePath, JSON.stringify({
          session_id: session,
          remaining_percentage: remaining,
          used_pct: used,
          timestamp: Math.floor(Date.now() / 1000)
        }));
      } catch {}
    }

    // Current task from todos
    let task = '';
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const todosDir = path.join(claudeDir, 'todos');
    if (session && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
          const inProgress = todos.find(t => t.status === 'in_progress');
          if (inProgress) task = inProgress.activeForm || '';
        }
      } catch {}
    }

    // Usage limits
    let usageStr = '';
    try {
      const token = getAccessToken();
      if (token) {
        const usageData = getUsageData(token);
        usageStr = buildUsageStr(usageData);
      }
    } catch {}

    // Render
    const dirname = path.basename(dir);
    const line = task
      ? `\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${usageStr}`
      : `\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${usageStr}`;

    process.stdout.write(line);
  } catch {}
});
