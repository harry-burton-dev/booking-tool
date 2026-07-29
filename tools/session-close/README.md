# session-close

End-of-session drift check. Zero dependencies, Node ≥ 20. Mechanizes P4/P5.

**Why it exists:** `compile_canvas` publishes to the **live app**. git has no idea that
happened. So a session can end with the live app ahead of the repo — the source of truth
silently split — and nothing says a word. V1 left this to the worker's memory, and it drifted
repeatedly.

## Usage

```bash
node tools/session-close/session-close.js
```

Wire it as a `Stop` hook (the `pa-process-init` settings template does this for you).

| Flag | Effect |
|------|--------|
| *(none)* | Advisory: prints findings, always exits 0 |
| `--block` | Exits 2 when there are findings, so the harness surfaces it as a block |

## What it checks

1. **Uncommitted changes** — tracked modifications *and* untracked files, named (first 10).
2. **Unpushed commits** — count and the upstream they are missing from. A branch with **no
   upstream at all** is reported separately: nothing is backed up off the machine.
3. **The P5 case (escalated, listed first):** a publish was recorded *this session* — the guard's
   `baseline.meta` `session=` matches `CLAUDE_SESSION_ID` — **and** source is uncommitted. That
   means the live app is running formulas that exist nowhere in version control. It is also the
   setup for a confusing failure next session: the guard will see a server that does not match
   any committed state and correctly refuse to push.

Publishes recorded by a *different* session do not escalate — that is someone else's drift, and
the guard's baseline check already handles it.

## Default is advisory, and that is deliberate

The toolkit's principle is that only fail-closed mechanisms work, so `--block` exists. But a
Stop hook that refuses to let a session end is a bad trade: the work is already done, and the
fix (commit, push) is not always possible right then — no network, a half-finished refactor,
credentials not to hand. Firing automatically at the right moment is most of the value; the
default warns loudly and `--block` is there when a repo wants teeth.

## Limitations

- "Published this session" relies on `CLAUDE_SESSION_ID` being set and on the guard having
  written `baseline.meta`. With no guard state (a non-app repo, or nothing ever published) the
  escalation simply never fires — checks 1 and 2 still work.
- It does not compare the live app against the repo. It only knows that *a* publish was
  recorded and that the tree is dirty. Proving the live app matches committed source is
  `pac-verify`'s job.
- No detection of committed-but-never-published source (the opposite drift). That is not
  dangerous in the same way — the repo is still the source of truth — so it is out of scope.
