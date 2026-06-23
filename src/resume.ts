import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SESSIONS_DIR, listDir } from './paths';
import { tombstoneSet } from './registry';

/** rc true = a live interactive `claude` already owns this sid (resumed in another tab). */
export function sessionLive(sid: string): boolean {
  for (const sf of listDir(SESSIONS_DIR)) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, sf), 'utf8'));
      if (d.sessionId === sid && d.pid > 0) { try { process.kill(Number(d.pid), 0); return true; } catch {} }
    } catch {}
  }
  return false;
}

/**
 * Resume a session: cd into its project dir first (claude --resume is cwd-scoped), then
 * hand the terminal to claude. Guarded against double-recovering one already live/closed.
 */
export function resume(sid: string, cwd: string): void {
  if (sessionLive(sid)) { console.error(`${sid.slice(0, 8)}… is already active in another terminal — not resuming.`); return; }
  if (tombstoneSet().has(sid)) { console.error(`${sid.slice(0, 8)}… was closed/recovered already — skipping.`); return; }
  if (cwd && cwd !== '(unknown)') { try { if (fs.existsSync(cwd)) process.chdir(cwd); else console.error(`⚠ ${cwd} is gone — resuming from ${process.cwd()}`); } catch {} }
  spawnSync('claude', ['--dangerously-skip-permissions', '--resume', sid], { stdio: 'inherit' });
}
