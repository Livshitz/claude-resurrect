import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const HOME = os.homedir();
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
export const REGISTRY = path.join(CLAUDE_DIR, 'live-sessions.json');
export const TOMBSTONE = path.join(CLAUDE_DIR, 'closed-sessions.txt');
export const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

/** List immediate children matching a suffix (cheap, no glob dep). */
export function listDir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

/** All top-level session transcripts: projects/<enc>/<sid>.jsonl (skips agent-* sub-logs). */
export function allTranscripts(): Array<{ file: string; sid: string; mtime: number }> {
  const out: Array<{ file: string; sid: string; mtime: number }> = [];
  for (const projDir of listDir(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, projDir);
    for (const base of listDir(dir)) {
      if (!base.endsWith('.jsonl') || base.startsWith('agent-')) continue;
      const file = path.join(dir, base);
      try { out.push({ file, sid: base.slice(0, -6), mtime: fs.statSync(file).mtimeMs / 1000 }); } catch {}
    }
  }
  return out;
}

/** Find a session's transcript by id across all project dirs (dir-encoding agnostic). */
export function resolveTranscript(sid: string): string | null {
  for (const projDir of listDir(PROJECTS_DIR)) {
    const f = path.join(PROJECTS_DIR, projDir, sid + '.jsonl');
    if (fs.existsSync(f)) return f;
  }
  return null;
}
