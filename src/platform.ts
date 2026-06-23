import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { listDir } from './paths';

export const IS_MAC = process.platform === 'darwin';

export function assertSupported(): void {
  if (!IS_MAC) {
    console.error('claude-resurrect currently supports macOS only (Linux/Windows: TODO).');
    process.exit(1);
  }
}

/** System boot time (epoch seconds). Used for the reboot mtime-burst window. */
export function bootTime(): number {
  try {
    // `kern.boottime` → "{ sec = 1782212568, usec = ... } ...". Grab the first integer.
    const out = execFileSync('sysctl', ['-n', 'kern.boottime'], { encoding: 'utf8' });
    const m = out.match(/sec\s*=\s*(\d+)/) || out.match(/(\d{10,})/);
    return m ? parseInt(m[1], 10) : 0;
  } catch { return 0; }
}

/** VSCode/Cursor terminal-scrollback DBs (hold `claude --resume <sid>` lines of idle tabs). */
export function ideScrollbackDbs(): string[] {
  const base = path.join(os.homedir(), 'Library', 'Application Support');
  const dbs: string[] = [];
  for (const app of ['Cursor', 'Code']) {
    const ws = path.join(base, app, 'User', 'workspaceStorage');
    for (const d of listDir(ws)) {
      const dir = path.join(ws, d);
      for (const f of listDir(dir)) if (f.startsWith('state.vscdb')) dbs.push(path.join(dir, f));
    }
  }
  return dbs;
}
