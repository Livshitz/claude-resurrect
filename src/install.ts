import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SETTINGS, CLAUDE_DIR } from './paths';

// `init` assumes a global install so `claude-revive` resolves in hooks + the shell.
const CMD = 'claude-revive';
const MARK_A = '# >>> claude-revive >>>';
const MARK_B = '# <<< claude-revive <<<';
const ZSHRC = process.env.CLAUDE_REVIVE_ZSHRC || path.join(os.homedir(), '.zshrc');

function backup(file: string) { try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.claude-revive.bak'); } catch {} }
function readSettings(): any { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } }

function hookEntry(arr: any[], command: string, present: boolean) {
  const has = arr.some((g: any) => (g.hooks || []).some((h: any) => h.command === command));
  if (present && !has) arr.push({ hooks: [{ type: 'command', command }] });
  if (!present) for (const g of arr) g.hooks = (g.hooks || []).filter((h: any) => h.command !== command);
  return arr.filter((g: any) => (g.hooks || []).length);
}

function patchSettings(install: boolean) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  const s = readSettings(); s.hooks = s.hooks || {};
  s.hooks.SessionStart = hookEntry(s.hooks.SessionStart || [], `${CMD} hook register`, install);
  s.hooks.SessionEnd = hookEntry(s.hooks.SessionEnd || [], `${CMD} hook unregister`, install);
  for (const k of ['SessionStart', 'SessionEnd']) if (!s.hooks[k].length) delete s.hooks[k];
  if (!Object.keys(s.hooks).length) delete s.hooks;
  backup(SETTINGS);
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
}

const ZSH_BLOCK = `${MARK_A}
# Snapshot live sessions (for reboot recovery) + auto-open the recovery picker when an
# IDE terminal restores after a crash/reboot. Set CLAUDE_REVIVE_OFF=1 to disable.
[ -n "$CLAUDE_REVIVE_OFF" ] || {
  command -v ${CMD} >/dev/null 2>&1 && {
    ${CMD} hook sync 2>/dev/null
    [[ -o interactive && ( "$TERM_PROGRAM" == "vscode" || -n "$CLAUDE_REVIVE_FORCE" ) ]] && ${CMD} --auto 2>/dev/null
  }
}
${MARK_B}`;

function patchZsh(install: boolean) {
  let txt = ''; try { txt = fs.readFileSync(ZSHRC, 'utf8'); } catch {}
  const re = new RegExp(`\\n?${MARK_A}[\\s\\S]*?${MARK_B}\\n?`, 'g');
  const stripped = txt.replace(re, '');
  backup(ZSHRC);
  fs.writeFileSync(ZSHRC, install ? stripped.replace(/\n*$/, '') + '\n\n' + ZSH_BLOCK + '\n' : stripped);
}

export function init(opts: { shell?: boolean; uninstall?: boolean }) {
  const install = !opts.uninstall;
  patchSettings(install);
  if (opts.shell || opts.uninstall) patchZsh(install);
  if (install) {
    console.log(`✓ ${opts.uninstall ? '' : ''}claude-revive hooks ${'installed'} in ${SETTINGS}`);
    console.log(`  SessionStart→register, SessionEnd→unregister (registry + tombstone).`);
    if (opts.shell) console.log(`✓ shell block added to ${ZSHRC} (sync + auto-open on restore). Open a new terminal to activate.`);
    else console.log(`  (run with --shell to also add the auto-open-on-restore shell hook)`);
    console.log(`  Requires a global install so 'claude-revive' is on PATH: npm i -g claude-revive`);
  } else {
    console.log(`✓ claude-revive hooks removed from ${SETTINGS}${fs.existsSync(ZSHRC) ? ' and ' + ZSHRC : ''}.`);
  }
}
