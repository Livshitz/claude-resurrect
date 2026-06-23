import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { REGISTRY, TOMBSTONE } from './paths';

export interface RegEntry { session_id: string; cwd: string; pid: number; started_at: string; pstart?: string; }

function readJsonArray(file: string): any[] {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Best-effort mkdir lock around registry writes (two tabs must not race the same file). */
function withLock<T>(fn: () => T): T {
  const lock = REGISTRY + '.lock';
  for (let i = 0; i < 5; i++) { try { fs.mkdirSync(lock); break; } catch { sleep(100); } }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch {} }
}
function sleep(ms: number) { try { execFileSync('sleep', [String(ms / 1000)]); } catch {} }

export function readRegistry(): RegEntry[] { return readJsonArray(REGISTRY) as RegEntry[]; }

export function writeRegistry(entries: RegEntry[]): void {
  const tmp = REGISTRY + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries));
  fs.renameSync(tmp, REGISTRY);
}

/** Remove an entry from the registry. rc true = we won it (exactly one matched). */
export function claim(sid: string): boolean {
  return withLock(() => {
    const all = readRegistry();
    if (all.filter((e) => e.session_id === sid).length !== 1) return false;
    writeRegistry(all.filter((e) => e.session_id !== sid));
    return true;
  });
}

/** rc true = the registered pid is still the same live `claude` process (guards pid reuse). */
export function stillAttached(pid: number | undefined, pstart?: string): boolean {
  if (!pid) return false;
  try { process.kill(pid, 0); } catch { return false; }
  let cmd = '';
  try { cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }); } catch { return false; }
  if (!cmd.includes('claude')) return false;
  if (pstart && pstart !== 'null') {
    try { const cur = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim(); if (cur !== pstart.trim()) return false; } catch { return false; }
  }
  return true;
}

// --- tombstone (cleanly-closed / dropped sessions; never re-offer) ---
export function tombstoneSet(): Set<string> {
  try { return new Set(fs.readFileSync(TOMBSTONE, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)); } catch { return new Set(); }
}
export function tombstoneAdd(sid: string): void { fs.appendFileSync(TOMBSTONE, sid + '\n'); }
export function tombstoneRemove(sid: string): void {
  try {
    const kept = fs.readFileSync(TOMBSTONE, 'utf8').split('\n').filter((l) => l.trim() && l.trim() !== sid);
    fs.writeFileSync(TOMBSTONE, kept.length ? kept.join('\n') + '\n' : '');
  } catch {}
}
