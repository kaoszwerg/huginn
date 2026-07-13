#!/usr/bin/env bash
# Idempotently merge the governance SessionStart hooks into .claude/settings.json (ADR-006).
# Useful when adopting this system in a project that already has a settings.json. For THIS repo the
# hooks are already committed; running this is a no-op verification.
# Verified matchers (Claude Code docs): startup | resume | clear | compact.
set -euo pipefail

repo_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
settings="$repo_dir/.claude/settings.json"

mkdir -p "$(dirname "$settings")"
[ -f "$settings" ] || echo '{}' > "$settings"

node - "$settings" <<'NODE'
import fs from 'node:fs';
const file = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
cfg.hooks = cfg.hooks || {};
const startup = 'bash "${CLAUDE_PROJECT_DIR}/scripts/setup-claude-memory.sh"';
const remind = 'bash "${CLAUDE_PROJECT_DIR}/scripts/post-compact-reminder.sh"';
cfg.hooks.SessionStart = [
  { matcher: 'startup', hooks: [
    { type: 'command', command: startup, timeout: 15 },
    { type: 'command', command: remind, timeout: 10 },
  ] },
  { matcher: 'resume|compact|clear', hooks: [
    { type: 'command', command: remind, timeout: 10 },
  ] },
];
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log('setup-hooks: SessionStart hooks written to ' + file);
NODE
