import fs from 'node:fs';
import path from 'node:path';
import { REGISTRY, TOMBSTONE, SESSIONS_DIR } from './paths';
import { discover, Session, DiscoverOpts } from './discover';
import { preview } from './preview';
import { dwidth, dtrunc, dpad, stripAnsi } from './util';

const A = '\x1b[';
const W = (s: string) => process.stdout.write(s);
const dim = (s: string) => `${A}2m${s}${A}0m`, yel = (s: string) => `${A}33;1m${s}${A}0m`;
const cyan = (s: string) => `${A}36m${s}${A}0m`, mag = (s: string) => `${A}35;1m${s}${A}0m`, inv = (s: string) => `${A}46;30m${s}${A}0m`;
const rel = (m: number) => { if (!m) return '  ?'; const d = Math.max(0, Math.floor(Date.now() / 1000) - m); return d < 3600 ? `${(d / 60) | 0}m` : d < 86400 ? `${(d / 3600) | 0}h` : `${(d / 86400) | 0}d`; };
const sig = () => { let m = 0; for (const p of [REGISTRY, TOMBSTONE, SESSIONS_DIR]) { try { m = Math.max(m, fs.statSync(p).mtimeMs); } catch {} } return m; };

/**
 * Full-repaint TUI picker. Alternate screen, autowrap OFF, full home+redraw+clear-EOL
 * every frame → no diff → no drift/ghost/scroll. Live-refreshes on a 1s mtime poll and
 * on resize. Resolves with the chosen session (enter) or undefined (q/esc). `onDrop`
 * fires for d/ctrl-d. Keys: ↑↓/jk move, enter resume, d drop, r refresh, q/esc quit.
 */
export async function pick(opts: DiscoverOpts, onDrop: (s: Session) => void): Promise<Session | undefined> {
  let items = discover(opts);
  let idx = 0, flash = '';
  let chosen: Session | undefined;
  const A2 = '\x1b[';
  const draw = () => {
    const rows = process.stdout.rows || 24, cols = process.stdout.columns || 100;
    const LEFT = Math.min(54, Math.max(22, (cols * 0.46) | 0));
    const pvW = Math.max(8, cols - LEFT - 3);
    const bodyH = Math.max(1, rows - 2);
    if (idx >= items.length) idx = Math.max(0, items.length - 1);
    const flat: Array<{ head?: string; it?: Session; i?: number }> = []; let lp = '';
    items.forEach((it, i) => { const p = path.basename(it.cwd); if (p !== lp) { lp = p; flat.push({ head: p }); } flat.push({ it, i }); });
    let sel = flat.findIndex((l) => l.i === idx); if (sel < 0) sel = 0;
    const s = Math.max(0, Math.min(sel - (bodyH >> 1), Math.max(0, flat.length - bodyH)));
    const vis = flat.slice(s, s + bodyH);
    const pv = (items[idx] ? preview(items[idx].sid, items[idx].cwd) : '(no preview)').split('\n').map(stripAnsi);
    const out: string[] = [];
    out.push(' ' + mag('⚡ recover') + ' ' + dim(`· ${items.length} recoverable${flash ? '   ' + flash : ''}`));
    for (let i = 0; i < bodyH; i++) {
      const l = vis[i]; let left: string;
      if (!l) left = ' '.repeat(LEFT);
      else if (l.head) left = '  ' + yel(dpad(l.head, LEFT - 2));
      else {
        const it = l.it!; const meta = `${rel(it.mtime).padStart(4)} ${String(it.cnt).padStart(3)}m`;
        const ttl = it.name ?? it.desc;
        if (l.i === idx) left = inv(dpad(`❯ ${meta}  ${ttl}`, LEFT));
        else { const t = dtrunc(ttl, LEFT - meta.length - 5); left = '  ' + dim(meta) + '  ' + (it.name ? cyan(t) : t) + ' '.repeat(Math.max(0, LEFT - meta.length - 4 - dwidth(t))); }
      }
      out.push(left + dim(' │ ') + dtrunc(pv[i] || '', pvW));
    }
    out.push(' ' + dim('↑↓/jk move · enter resume · d drop · r refresh · q quit'));
    W(A2 + 'H' + out.slice(0, rows).map((l) => l + A2 + 'K').join('\r\n'));
  };
  const reload = (msg = '') => { items = discover(opts); if (msg) flash = msg; draw(); };

  return await new Promise<Session | undefined>((resolve) => {
    const restore = () => { try { process.stdin.setRawMode(false); } catch {} W(`${A2}?7h${A2}?25h${A2}?1049l`); process.stdin.pause(); };
    const onExit = () => restore();
    const finish = (sess?: Session) => { clearInterval(timer); process.stdout.off('resize', onResize); process.off('SIGWINCH', onResize); process.off('exit', onExit); restore(); resolve(sess); };
    W(`${A2}?1049h${A2}?25l${A2}?7l`);
    process.on('exit', onExit);
    try { process.stdin.setRawMode(true); } catch {}
    process.stdin.resume(); process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d: string) => {
      if (d === '\x1b[A' || d === '\x1bOA' || d === 'k') { idx = Math.max(0, idx - 1); draw(); }
      else if (d === '\x1b[B' || d === '\x1bOB' || d === 'j') { idx = Math.min(items.length - 1, idx + 1); draw(); }
      else if (d === '\r' || d === '\n') { chosen = items[idx]; finish(chosen); }
      else if (d === 'd') { const it = items[idx]; if (it) { onDrop(it); reload(`dropped ${it.sid.slice(0, 8)}`); } }
      else if (d === 'r') reload('● refreshed');
      else if (d === 'q' || d === '\x1b' || d === '\x03') finish(undefined);
    });
    let prev = sig();
    const timer = setInterval(() => { const c = sig(); if (c !== prev) { prev = c; reload('● updated'); } }, 1000);
    const onResize = () => draw();
    process.stdout.on('resize', onResize); process.on('SIGWINCH', onResize);
    draw();
  });
}
