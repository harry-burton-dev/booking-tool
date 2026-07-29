# Install audit — booking-tool, 2026-07-29

Audit of the full setup session: `git init` → graphify → `.pa-toolkit` clone → app source
acquisition → Process V2 install (toolkit `84cfd20`). Written to feed fixes back into
`powerapps-process` and the machine environment. Per the brief, **nothing is assumed
intentional** — defaults and prior choices are audited alongside failures.

Method note: no wall-clock timestamps exist for individual steps, so cost is measured in
**tool-call rounds** (one agent action + result). It is a fair proxy: the session's total round
count was roughly 3× what a clean run would need.

---

## 1. Timeline and where the time went

| # | Phase | Rounds | Avoidable? | What happened |
|---|-------|-------:|------------|---------------|
| 1 | git init | 2 | — | Clean. |
| 2 | graphify install | ~6 | ~4 | Binary not on PATH (installed as uv tool `graphifyy`; `~/.local/bin` not on PATH). Hunted npm → pip → pipx → uv, then ran by absolute path. |
| 3 | Clone `.pa-toolkit` | 2 | 0 | Clean. |
| 4 | First commit | ~7 | ~4 | `.gitignore` written via suggested `echo >>` came out **UTF-16LE, duplicated, unreadable by git**. A `git check-ignore -v` with a trailing slash gave a false "ignored". Rewritten via .NET UTF-8. |
| 5 | Install attempt → blocked | ~4 | ~2 | Prereq 4 (Canvas source tree) unmet — repo was empty. Blocked round-trip to user. |
| 6 | Toolkit test triage | ~6 | ~4 | 94/102, 8 fails, all exit **127**: bare `bash` resolves to the WSL launcher (`system32\bash.exe`), not Git Bash. Extra rounds lost to PowerShell output-capture quirks. |
| 7 | App source acquisition | ~9 | ~3 | MCP schemas loaded, connect OK. `sync_canvas` to repo root **refused** (non-empty dir) — undocumented. Scratch probe revealed the real output shape (flat `.pa.yaml`, no `Controls/References/Properties.json`), contradicting Prereq 4's description. |
| 8 | bash decision | 1 | — | User round-trip (legitimate decision point). |
| 9 | Install steps 1–9 | ~25 | ~8 | `Copy-Item` glob misfire (redone). Vendored `.sh` files arrived **fully CRLF** (toolkit repo has no `.gitattributes`). Settings merge **attempt 1 silently pinned 0 of 5 bash strings** (JSON-escaped quotes defeated a text match; the self-check had the same bug) — caught only by reading printed counters; reverted and redone on parsed JSON. |
| 10 | Verification + close-out | ~10 | ~3 | All 9 probes matched documented exit codes. Two false alarms: pipeline truncation killed bash mid-write (exit −1), and a `Remove-Item` safety guard misread `C:\Program Files` in an unrelated string. Fresh-clone re-test added (not in the skill): 102/102. |

**Total ≈ 72 rounds; ≈ 28 avoidable.** Test suites were executed **6 times** end-to-end; 3 would
have sufficed (initial, post-vendor, fresh clone).

---

## 2. Findings

Severity: **H** = will bite again / silently; **M** = cost real time, bounded; **L** = cosmetic.

### 2.1 Toolkit defects (owner: `powerapps-process` repo)

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| T1 | **H** | **The installer violates the toolkit's own core principle.** "Prose → checklist → lint/hook that blocks" — yet the install is nine prose steps hand-executed by an LLM. Both agent execution errors this session (copy misfire, silent pin no-op) are exactly the class a script eliminates. This was the single largest time sink (Phase 9). | Ship `install.js` in the toolkit: deterministic copy / substitute / **merge on parsed JSON** / validate, printing a machine-checkable report. The skill supervises and handles judgment calls; code does the mechanics. |
| T2 | **H** | **No fresh-project path.** Prereq 4 demands an existing source tree, but the natural first-project flow is an empty repo. The skill says "stop", offering nothing. | Make bootstrap a first-class branch: if `Src/` is absent, offer connect → `sync_canvas` into `Src/` → commit → continue. |
| T3 | **H** | **Prereq 4 describes a tree `sync_canvas` cannot produce.** `Controls/`, `References/`, `Properties.json` come only from `pac canvas unpack`; MCP sync emits flat `.pa.yaml` + `Components/`. Only `pack-msapp` needs the unpack artifacts. | Split the prerequisite: gates need `Src/**/*.pa.yaml`; the `.msapp` deploy channel needs the unpack tree. Document both provenances. |
| T4 | **H** | **Toolkit repo ships no `.gitattributes`**, so the clone delivered `guard.sh`, `session-start.sh`, `pac-verify.sh` fully CRLF on Windows. CRLF in the publish gate is a latent crash. | Add `*.sh eol=lf` and `*.pa.yaml eol=lf` to the toolkit repo itself; installer stamps the same into targets (done here manually). |
| T5 | **H** | **Bare `bash` in `settings.json.tmpl` and tests.** On stock Windows 11 with WSL, `system32\bash.exe` shadows Git Bash → gates crash instead of block (the guard's own false-confidence nightmare). Caused all 8 test failures. | Detect and pin an absolute bash at install; or better, **port `canvas-guard`/`pac-verify` to Node** — 7 of 9 tools are already Node, and the two shell scripts caused 100% of the environment breakage. |
| T6 | **M** | **Verification never exercises the installed hooks as hooks.** It probes `guard.sh` directly. An unpinned/broken command string in `settings.json` would pass every probe and fail at first publish. (The known `mcp_tool` silent no-op makes this worse.) | Add a hook self-test step: extract each command from the rendered `settings.json` and execute it (dry-run/status mode); fail install on non-zero. |
| T7 | **M** | Step 8 names four memory notes (`canvas-yaml-push-limits`, etc.) **but the toolkit ships no note content**. Unexecutable as written. | Ship the notes as files, or drop the step. (This session verified all four truths exist in committed files — e.g. fork behaviour in `pac-verify.sh:5-11`.) |
| T8 | **M** | `sync_canvas` **refuses non-empty directories** — undocumented in the skill; cost a failed call + probe cycle. | Document: sync only into an empty or all-`.pa.yaml` dir; repo-root sync is impossible in a real repo. |
| T9 | **L** | `CLAUDE-section.md` references `deploy/RUNBOOK.md`, which the toolkit does not ship. | Ship it or drop the reference. |
| T10 | **L** | `tools/TOOLKIT-VERSION` format unspecified — this install invented one. | Specify the format in the skill. |
| T11 | **L** | README "Status: installer never run against a real app repo (Phase B2)". This session **was** effectively B2. | Feed this audit back; update the status. |

### 2.2 Environment traps (owner: this machine)

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| E1 | **H** | WSL launcher shadows Git Bash on PATH. Mitigated here by absolute-path pinning, but any future tool calling bare `bash` hits it. | Optionally put `C:\Program Files\Git\bin` ahead of `system32` in user PATH; otherwise keep pinning. |
| E2 | **H** | PowerShell 5.1 `>>`/`>` writes **UTF-16LE + BOM**. Broke `.gitignore` invisibly (editor renders fine; git reads garbage). Saved to project memory. | Never redirect into byte-parsed dotfiles; use `[IO.File]::WriteAllText(..., UTF8Encoding($false))`. Consider PowerShell 7 (UTF-8 default). |
| E3 | **M** | `~/.local/bin` (uv tools) not on PATH → graphify unfindable by name; its own hook text tells agents to run bare `graphify`, which fails. | Add `%USERPROFILE%\.local\bin` to user PATH, or uninstall graphify from this repo (see U1). |
| E4 | — | `python3` is real (3.14.3), `node` v24.14.1, `pac` 2.8.1 present. No issue. | — |

### 2.3 Agent execution errors (owner: the process that drove the install — self-audit)

| ID | Finding | Mechanism to prevent recurrence |
|----|---------|--------------------------------|
| A1 | Suggested `echo >>` for a dotfile under PS 5.1; compounded by trusting a trailing-slash `check-ignore` result. One wrong statement to user, ~4 wasted rounds. | Saved as project memory. Verify dotfile first-bytes after writing. |
| A2 | `Copy-Item` glob onto non-existent destination created a leaf, not a container. | Create destination dir first; verify file counts source vs dest (done on retry). |
| A3 | **Merge script v1 reported success while doing nothing** — text-matched `bash "` against JSON-escaped source; its own residual check was wrong the same way. | Operate on parsed structures, never raw serialized text; print counters and **treat 0 as failure, not silence as success**. This is also the strongest evidence for T1: scripts written once and tested beat prose re-executed each install. |
| A4 | Test suite run 6× (~2× necessary); extra runs partly due to PowerShell stream-capture flailing. | Capture to file once, grep the file. |

### 2.4 Choices to revisit (owner: user — "assume it isn't on purpose")

| ID | Sev | Finding | Recommendation |
|----|-----|---------|----------------|
| U1 | **M** | **graphify is dead weight in this repo.** Its graph was never built; its Read/Glob hook spawns `python3` on *every* Read/Glob call (real per-call latency); its file-extension list contains **no `.yaml`**, so it can never index `Src/**/*.pa.yaml` — the actual app. It could only ever graph `tools/` (vendored, stable, already tested). | `graphify claude uninstall` in this repo. Keep it for JS/TS/Python repos where it earns its hooks. |
| U2 | **H** | **No remote.** `session-close` already flags it: nothing is backed up off this machine. Every gate protects the live app; nothing protects the repo. | Create a remote and push — highest-value 2 minutes available. |
| U3 | **L** | Branch is `master` (init default, predates any decision). | If renaming to `main`, do it before the remote exists. |
| U4 | **M** | Repo is bound to the **tenant Default environment** — for most tenants, the *live* one. The toolkit's own design (REVERT-CONTRACT, `prod-revert --require-prod`, D1–D5 mock rules) presumes a dev→prod promotion across two app+environment pairs; only one exists here. Every `compile_canvas` publishes to whatever users see. | Decide deliberately: either accept live-app editing (the guard exists for exactly this) or create a dev environment/app copy and re-point this repo at it. |
| U5 | **L** | `.claude/settings.local.json` accumulates one-shot permission entries (session barnacles). | Ignorable; prune occasionally. |

---

## 3. What went right (keep these)

- **Every guard probe matched its documented exit code** — the fail-closed claims are real, not aspirational.
- The `commit-msg` hook was proven by direct probe *and* by a real commit in the same session.
- Gaps were **documented instead of papered over** (`docs/APP-CHECKER-BASELINE.md`, inert-L4 note in `schema/README.md`).
- **Fresh-clone verification** (not in the skill) proved the install travels: LF checkout, 102/102. Worth upstreaming as step 10.
- Provenance stamp (`tools/TOOLKIT-VERSION`) answers "which gates is this repo running".

## 4. Priority order for rectification

1. **U2** — remote + push (2 min, protects everything else).
2. **T1 + A3** — script the installer; this converts ~25 rounds → ~5 for every future project.
3. **T4 + T5** — `.gitattributes` upstream and kill bare `bash` (port the two `.sh` tools to Node).
4. **T2 + T3** — fresh-project bootstrap path + honest prerequisites.
5. **U4** — environment strategy decision before the first real feature.
6. **U1** — remove graphify from this repo.
7. Remainder (T6–T11, E3) as convenient.
