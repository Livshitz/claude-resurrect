import fs from 'node:fs';
import { resolveTranscript } from './paths';

const RENAME = /Session renamed to: ([^<\n]*)/g;
const cache: Record<string, string> = {};

/** Title (rename → first prompt) + tagged transcript tail, for the picker preview pane. */
export function preview(sid: string, cwd: string): string {
  if (cache[sid] != null) return cache[sid];
  const file = resolveTranscript(sid);
  let text: string;
  if (!file) text = `${cwd}\n${sid}\n\n(no transcript on disk)`;
  else {
    let raw = ''; try { raw = fs.readFileSync(file, 'utf8'); } catch {}
    const lines = raw.split('\n').filter(Boolean);
    let title = '', name = ''; const turns: string[] = [];
    for (const line of lines) {
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      const role = o.message?.role || o.type;
      let c = o.message?.content;
      if (Array.isArray(c)) c = c.map((p: any) => p?.text || '').filter(Boolean).join(' ');
      if (typeof c !== 'string' || !c) continue;
      const s = c.replace(/\n/g, ' ').trim();
      if (o.type === 'user' && typeof o.message?.content === 'string' && !s.startsWith('<') && !s.includes('tool_result')) { if (!title) title = s; }
      if (!s.includes('tool_result')) turns.push(`${role}: ${s}`);
    }
    const rn = [...raw.matchAll(RENAME)]; if (rn.length) name = rn[rn.length - 1][1].trim();
    const head = [name ? `[${name}]` : '', title || '(no title)', cwd, sid].filter((x) => x !== '').join('\n');
    text = head + '\n\n' + turns.slice(-25).map((t) => t.slice(0, 2000)).join('\n');
  }
  cache[sid] = text;
  return text;
}
