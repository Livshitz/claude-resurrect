import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SESSIONS_DIR, REGISTRY, listDir } from './paths';
import { readRegistry, writeRegistry, RegEntry, tombstoneAdd, tombstoneRemove } from './registry';

const psField = (pid: number, field: string) => { try { return execFileSync('ps', ['-o', `${field}=`, '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };

/** Walk the ancestor chain to the real `claude` process (the hook runs under a wrapper). */
function claudeAncestor(): { pid: number; cmd: string } | null {
  let pid = process.ppid;
  for (let i = 0; i < 6 && pid > 1; i++) {
    const cmd = psField(pid, 'command');
    if (!cmd) break;
    if (/claude-resurrect|hook /.test(cmd)) { /* skip ourselves */ }
    else if (cmd.includes('claude')) return { pid, cmd };
    const ppid = parseInt(psField(pid, 'ppid'), 10);
    if (!ppid || ppid === pid) break;
    pid = ppid;
  }
  return null;
}

function readHookInput(): any { try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return {}; } }

export function hookRegister(): void {
  const inp = readHookInput();
  const sid = inp.session_id; if (!sid) return;
  const anc = claudeAncestor();
  if (anc && /\s-p(\s|$)|--print/.test(anc.cmd)) return;   // headless run, not a resumable tab
  const pid = anc?.pid || process.ppid;
  const entry: RegEntry = { session_id: sid, cwd: inp.cwd || '', pid, started_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), pstart: psField(pid, 'lstart') };
  writeRegistry([...readRegistry().filter((e) => e.session_id !== sid), entry]);
  tombstoneRemove(sid);   // (re)started → live again, no longer "closed"
}

export function hookUnregister(): void {
  const inp = readHookInput();
  const sid = inp.session_id; if (!sid) return;
  if (!['prompt_input_exit', 'logout', 'clear', 'exit'].includes(inp.reason)) return;  // deliberate ends only
  writeRegistry(readRegistry().filter((e) => e.session_id !== sid));
  tombstoneAdd(sid);
}

/** Import currently-live interactive sessions into the registry so a future reboot recovers them. */
export function hookSync(): void {
  const have = new Set(readRegistry().map((e) => e.session_id));
  const add: RegEntry[] = [];
  for (const sf of listDir(SESSIONS_DIR)) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, sf), 'utf8'));
      if (d.kind !== 'interactive' || !(d.pid > 0) || !d.sessionId || have.has(d.sessionId)) continue;
      try { process.kill(Number(d.pid), 0); } catch { continue; }
      const ts = d.startedAt > 0 ? new Date(d.startedAt).toISOString().replace(/\.\d+Z$/, 'Z') : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      add.push({ session_id: d.sessionId, cwd: d.cwd || '', pid: d.pid, started_at: ts, pstart: psField(d.pid, 'lstart') });
      have.add(d.sessionId);
    } catch {}
  }
  if (add.length) writeRegistry([...readRegistry(), ...add]);
}
