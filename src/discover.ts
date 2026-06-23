import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, SESSIONS_DIR, REGISTRY, allTranscripts, resolveTranscript, listDir } from './paths';
import { bootTime, ideScrollbackDbs } from './platform';
import { tombstoneSet, stillAttached } from './registry';

export type Source = '' | 'ide' | 'registry' | 'active';
export interface Session {
  sid: string; cwd: string; mtime: number; cnt: number;
  name: string | null; desc: string; source: Source; match?: string;
}
export interface DiscoverOpts { window?: number; mode?: 'default' | 'active' | 'grep'; grep?: string; cwd?: string; }

const RENAME = /Session renamed to: (.*?)<\/local-command-stdout>/g;
const ARTIFACT = /^\s*(summarize this conversation concisely|here is an existing conversation summary)/i;
const TMP_ROOTS = ['/private/var/folders/', '/var/folders/', '/private/tmp/', '/tmp/'];
const UUID = /resume ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

const isArtifact = (s?: string | null) => !!s && ARTIFACT.test(s);
const isTemp = (cwd?: string | null) => !!cwd && TMP_ROOTS.some((r) => cwd.startsWith(r));
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function loadIndex(): Record<string, any> {
  const index: Record<string, any> = {};
  for (const projDir of listDir(PROJECTS_DIR)) {
    const ix = readJson(path.join(PROJECTS_DIR, projDir, 'sessions-index.json'));
    for (const e of ix?.entries || []) if (e?.sessionId) index[e.sessionId] = e;
  }
  return index;
}
function loadNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const sf of listDir(SESSIONS_DIR)) {
    const d = readJson(path.join(SESSIONS_DIR, sf));
    if (d?.name && d?.sessionId) names[d.sessionId] = d.name;
  }
  return names;
}
function renamedName(file: string | null): string | null {
  if (!file || !fs.existsSync(file)) return null;
  try { const m = [...fs.readFileSync(file, 'utf8').matchAll(RENAME)]; return m.length ? m[m.length - 1][1].trim() : null; } catch { return null; }
}
/** Authoritative cwd + human-typed turns from a transcript. */
function cwdAndTurns(file: string): { cwd: string | null; turns: string[] } {
  let cwd: string | null = null; const turns: string[] = [];
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue; let o: any; try { o = JSON.parse(line); } catch { continue; }
      if (!cwd && typeof o.cwd === 'string') cwd = o.cwd;
      if (o.type === 'user') {
        let c = o.message?.content;
        if (Array.isArray(c)) c = c.filter((p: any) => p?.type === 'text').map((p: any) => p.text || '').join(' ');
        if (typeof c === 'string') {
          const s = c.trim().replace(/\n/g, ' ');
          if (s && !s.startsWith('<') && !s.includes('tool_result')) turns.push(s);
        }
      }
    }
  } catch {}
  return { cwd, turns };
}

export function discover(opts: DiscoverOpts = {}): Session[] {
  const window = opts.window ?? 300;
  const mode = opts.mode ?? 'default';
  const grep = (opts.grep || '').toLowerCase();
  const boot = bootTime();
  const [lo, hi] = [boot - window, boot];
  const index = loadIndex();
  const names = loadNames();
  const closed = tombstoneSet();

  type Info = { cwd: string | null; label: string; cnt: number; hay: string; turns: string[]; name: string | null; artifact: boolean };
  const info = (file: string | null, sid: string, deep = false): Info => {
    const e = index[sid] || {};
    let cwd: string | null = e.projectPath ?? null;
    let label: string | null = e.summary ?? e.firstPrompt ?? null;
    let cnt: number | null = e.messageCount ?? null;
    let turns: string[] = [];
    if (deep || !cwd || !label) {
      const r = file && fs.existsSync(file) ? cwdAndTurns(file) : { cwd: null, turns: [] };
      turns = r.turns; cwd = cwd || r.cwd; label = label || (turns[0] ?? '(no text)');
      if (cnt == null) cnt = turns.length;
    }
    label = (label || '(no text)').replace(/\n/g, ' ');
    const name = names[sid] || renamedName(file);
    const artifact = isArtifact(label) || isArtifact(e.firstPrompt) || isArtifact(turns[0] || '');
    const hay = [name || '', e.summary || '', e.firstPrompt || '', ...turns].join(' ').toLowerCase();
    return { cwd, label, cnt: cnt || 0, hay, turns, name, artifact };
  };
  const drop = (sid: string, label: string, cwd: string | null, art: boolean) =>
    closed.has(sid) || art || isTemp(cwd) || label === '(no text)';

  const out: Session[] = [];

  if (mode === 'active') {
    for (const sf of listDir(SESSIONS_DIR)) {
      const d = readJson(path.join(SESSIONS_DIR, sf)); if (!d) continue;
      const { sessionId: sid, pid, kind } = d; let cwd = d.cwd;
      if (!sid || !pid || kind !== 'interactive') continue;
      try { process.kill(Number(pid), 0); } catch { continue; }
      const f = resolveTranscript(sid); const i = info(f, sid); cwd = cwd || i.cwd;
      if (drop(sid, i.label, cwd, i.artifact)) continue;
      const mt = f && fs.existsSync(f) ? fs.statSync(f).mtimeMs / 1000 : 0;
      out.push({ sid, cwd: cwd || '(unknown)', mtime: mt, cnt: i.cnt, name: i.name, desc: i.label, source: 'active' });
    }
  } else if (mode === 'grep') {
    for (const { file, sid } of allTranscripts().sort((a, b) => b.mtime - a.mtime)) {
      if (index[sid]?.isSidechain) continue;
      const i = info(file, sid, true);
      if (drop(sid, i.label, i.cwd, i.artifact)) continue;
      if (grep && i.hay.includes(grep)) out.push({ sid, cwd: i.cwd || '(unknown)', mtime: 0, cnt: i.cnt, name: i.name, desc: i.label, source: '', match: snippet(i.turns, grep) });
    }
  } else {
    const cands = allTranscripts().filter((c) => !index[c.sid]?.isSidechain);
    const seen = new Set<string>();
    // A) mtime-burst window before reboot
    for (const { file, sid, mtime } of cands) {
      if (mtime < lo || mtime > hi) continue;
      const i = info(file, sid); if (drop(sid, i.label, i.cwd, i.artifact)) continue;
      out.push({ sid, cwd: i.cwd || '(unknown)', mtime, cnt: i.cnt, name: i.name, desc: i.label, source: '' }); seen.add(sid);
    }
    // C) registry dead-pid orphans (any age)
    for (const e of (readJson(REGISTRY) || [])) {
      const sid = e.session_id, cwd = e.cwd; if (!sid || seen.has(sid)) continue;
      if (stillAttached(e.pid, e.pstart)) continue;
      const f = path.join(PROJECTS_DIR, (cwd || '').replace(/\//g, '-'), sid + '.jsonl');
      const i = info(fs.existsSync(f) ? f : resolveTranscript(sid), sid);
      if (drop(sid, i.label, cwd, i.artifact)) continue;
      const mt = fs.existsSync(f) ? fs.statSync(f).mtimeMs / 1000 : 0;
      out.push({ sid, cwd: cwd || '(unknown)', mtime: mt, cnt: i.cnt, name: i.name, desc: i.label || '(registry orphan)', source: 'registry' }); seen.add(sid);
    }
    // B) IDE scrollback survivors (idle tabs, any age, not resumed since boot)
    for (const sid of ideResumeIds()) {
      if (seen.has(sid)) continue;
      const f = resolveTranscript(sid); if (!f) continue;
      const mtime = fs.statSync(f).mtimeMs / 1000; if (mtime >= boot) continue;
      if (index[sid]?.isSidechain) continue;
      const i = info(f, sid); if (drop(sid, i.label, i.cwd, i.artifact)) continue;
      out.push({ sid, cwd: i.cwd || '(unknown)', mtime, cnt: i.cnt, name: i.name, desc: i.label, source: 'ide' }); seen.add(sid);
    }
  }
  // group by project (basename), newest first within
  const scoped = opts.cwd ? out.filter((x) => x.cwd === opts.cwd) : out;
  return scoped.sort((a, b) => {
    const pa = path.basename(a.cwd), pb = path.basename(b.cwd);
    return pa < pb ? -1 : pa > pb ? 1 : b.mtime - a.mtime;
  });
}

function snippet(turns: string[], term: string): string {
  for (const s of turns) { const i = s.toLowerCase().indexOf(term); if (i >= 0) { const a = Math.max(0, i - 30); return (a ? '...' : '') + s.slice(a, i + 70).replace(/\n/g, ' '); } }
  return '';
}
function ideResumeIds(): Set<string> {
  const ids = new Set<string>();
  for (const db of ideScrollbackDbs()) {
    try { const data = fs.readFileSync(db).toString('latin1'); for (const m of data.matchAll(UUID)) ids.add(m[1].toLowerCase()); } catch {}
  }
  return ids;
}
