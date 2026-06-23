# claude-resurrect

Recover Claude Code sessions abandoned by a **crash, reboot, or IDE kill** — not just a session browser, but a *crash-recovery* tool. An interactive TUI picker over everything that was live when things went sideways, with auto-offer on terminal restore.

> macOS only (for now). Node ≥ 18.

```bash
npx claude-resurrect          # interactive picker over all recoverable sessions → resume the one you pick
```

## Why

Claude Code's `--resume` lists *past* sessions, but after a Mac reboot or an IDE crash the sessions that were **open in your terminals** are easy to lose. `claude-resurrect` reconstructs them from three sources and unions them:

- **reboot mtime-burst** — every running `claude` flushes its transcript at shutdown; files in a tight window before boot were live;
- **IDE terminal scrollback** — VSCode/Cursor persist each terminal's buffer, which holds the `--resume <id>` line of idle tabs;
- **a live registry** — optional hooks record every interactive session and what was cleanly closed (so closed/dropped ones are never re-offered).

It filters out compaction artifacts, temp-dir scratch sessions, and empty ones; shows custom `/rename` titles; and groups by project.

## Use

```bash
claude-resurrect               # pick over all recoverable sessions, grouped by project
claude-resurrect --here        # only the current project directory
claude-resurrect --active      # currently-LIVE sessions (a pre-restart backup)
claude-resurrect --grep TERM   # pick among sessions that mention TERM
claude-resurrect 900           # widen the reboot mtime window to 900s
```

Keys: **↑↓/jk** move · **enter** resume · **d** drop (never offer again) · **r** refresh · **q** quit. The picker **auto-refreshes** when sessions are resumed/closed in other terminals.

## Full crash-recovery (`init`)

For the complete experience — a live registry, clean-close detection, and auto-open-on-restore — install globally and run `init`:

```bash
npm i -g claude-resurrect
claude-resurrect init --shell
```

- Adds `SessionStart`/`SessionEnd` hooks to `~/.claude/settings.json` (maintains the registry + tombstones cleanly-closed sessions).
- `--shell` adds a block to `~/.zshrc` that snapshots live sessions and **auto-opens the picker in restored IDE terminals** (within 30 min of boot). Set `CLAUDE_RESURRECT_OFF=1` to disable.

Reverse it: `claude-resurrect init --uninstall`. Both files are backed up (`*.claude-resurrect.bak`) before any change.

## How resume works

`claude --resume` is cwd-scoped, so the picker `cd`s into the session's project directory before resuming, and refuses to re-resume one that's already live in another terminal.

## License

MIT
