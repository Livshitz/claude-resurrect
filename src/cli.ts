#!/usr/bin/env node
import { assertSupported, bootTime } from './platform';
import { discover, DiscoverOpts } from './discover';
import { pick } from './ui';
import { resume } from './resume';
import { tombstoneAdd, claim } from './registry';
import { hookRegister, hookUnregister, hookSync } from './hooks';
import { init } from './install';

const HELP = `claude-resurrect — recover Claude Code sessions lost to a crash, reboot, or IDE kill.

  claude-resurrect                interactive picker over all recoverable sessions → resume
  claude-resurrect --here         scope to the current project directory
  claude-resurrect --active       list currently-LIVE sessions (pre-restart backup)
  claude-resurrect --grep TERM    pick among sessions mentioning TERM (any time)
  claude-resurrect [SECONDS]       widen the reboot mtime window (default 300)

  claude-resurrect init [--shell]      install SessionStart/End hooks (+ --shell: auto-open on restore)
  claude-resurrect init --uninstall    remove hooks (and shell block)

Keys: ↑↓/jk move · enter resume · d drop (never offer again) · r refresh · q quit
macOS only. https://github.com/  (set CLAUDE_RESURRECT_OFF=1 to disable the shell auto-open)`;

async function runPicker(opts: DiscoverOpts) {
  const chosen = await pick(opts, (s) => { tombstoneAdd(s.sid); claim(s.sid); });
  if (chosen) resume(chosen.sid, chosen.cwd);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === 'hook') {
    if (argv[1] === 'register') return hookRegister();
    if (argv[1] === 'unregister') return hookUnregister();
    if (argv[1] === 'sync') return hookSync();
    return;
  }
  if (cmd === 'init') {
    assertSupported();
    return init({ shell: argv.includes('--shell'), uninstall: argv.includes('--uninstall') });
  }
  if (argv.includes('-h') || argv.includes('--help')) { console.log(HELP); return; }

  assertSupported();
  const window = argv.map(Number).find((n) => Number.isFinite(n) && n > 0);
  const opts: DiscoverOpts = { window };

  if (argv.includes('--grep')) { opts.mode = 'grep'; opts.grep = argv[argv.indexOf('--grep') + 1] || ''; }
  else if (argv.includes('--active')) opts.mode = 'active';

  if (argv.includes('--here')) opts.cwd = process.cwd();

  if (argv.includes('--auto')) {
    // Shell-restore path: only within the post-boot window, scoped to this dir, silent if nothing.
    const boot = bootTime(); const now = Date.now() / 1000;
    const win = Number(process.env.CLAUDE_RESURRECT_WINDOW) || 1800;
    if (!process.env.CLAUDE_RESURRECT_FORCE && (!boot || now - boot > win)) return;
    opts.cwd = process.cwd();
    if (discover(opts).length === 0) return;
  }
  await runPicker(opts);
}

main().catch((e) => { try { process.stdout.write('\x1b[?7h\x1b[?25h\x1b[?1049l'); } catch {} console.error(e?.message || e); process.exit(1); });
