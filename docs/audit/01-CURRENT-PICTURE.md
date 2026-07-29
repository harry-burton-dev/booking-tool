# Current picture — booking-tool as it sits ready for development, 2026-07-29

Assessment of the repo, Claude Code configuration, and environment for **suitability,
effectiveness, efficiency, and workflow** — the state a first feature would be built on.
Companion to `00-INSTALL-AUDIT.md`; finding IDs (U2, T6…) refer to that report.

---

## 1. Snapshot

| | |
|---|---|
| Repo | 3 commits on `master`, working tree clean, **no remote** |
| App source | `Src/` — App, 6 screens (Home, bookingDetail, Find, myBookings, Profile, Rooms), 2 components (Shell_Header, cpt_Modal_), `_EditorState` |
| Bound app | `498d4962-0b5f-4990-a400-1bf5de9a367c` in `Default-ecf69819-…` (tenant default environment) |
| MCP | `plugin_canvas-apps_canvas-authoring`, connected as `harry@harry-burton.ai` |
| Toolkit | Process V2 @ `84cfd20`, 9 tools vendored, 102/102 tests, provenance stamped |
| Toolchain | node v24.14.1 · pac CLI 2.8.1 · Git Bash (pinned by absolute path) · Python 3.14.3 · PowerShell 5.1 |

Scope note: this assesses the **setup**, not the app. The app's own health (17 L3 warnings, no
error-level findings) has not been reviewed for design quality.

## 2. Gate armament — what actually protects you today

| Gate | State | Evidence / what arms it |
|------|-------|------------------------|
| pa-lint (L1–L9) | **ARMED** | Proven on real source: 0 errors, 17 L3 warnings, exit 0 |
| — pa-lint L4 (seed schema) | **INERT** | `seedSchemas` empty — arms when a schema snapshot is captured and registered |
| — pa-lint DS1 (design tokens) | **OFF** | `designSystem.enabled: false` — template default, not a decision. Revisit when a design system exists |
| pa-schema-validate | **ARMED** | Proven: clean, 10 files, exit 0 |
| canvas-guard (publish gate) | **ARMED, CLI-proven; hook-firing UNPROVEN** | `status`/`preflight`/`verified-at` all matched documented exits when run directly. Whether Claude Code *fires* the hooks is untested — see §5 |
| commit-msg-lint | **ARMED, battle-proven** | Rejected a bad message (exit 1, rule named) and accepted two real commits |
| session-close | **ARMED (CLI)** | Proven directly; Stop-hook delivery untested until restart |
| prod-revert | **DORMANT by design** | Contract is the empty template — meaningful once dev-only code with `PROD-REVERT[id]` markers exists |
| sarif-diff (P10) | **INERT** | No App Checker baseline committed — P10 "issues never increase" is unenforced (documented in `docs/APP-CHECKER-BASELINE.md`) |
| pac-verify (rung 4) | **UNVERIFIED** | pac CLI present; live catalog path needs `pac auth` — never exercised |
| pack-msapp | **BLOCKED for prod packs** | Requires `Controls/`, `References/`, `Properties.json` — only obtainable via `pac canvas unpack` of a `.msapp`; absent here |

**Net: 3 gates proven, 2 proven-at-CLI but unproven-as-hooks, 4 waiting on inputs.** The
waiting-on-inputs set is honest (each gap is documented in-repo), but it means today's real
protection is: lint + schema on demand, commit hygiene, and a publish gate whose trigger
mechanism is untested.

## 3. Claude Code configuration

**Hooks — 7 matchers across 4 events.**
- canvas-guard set (5): sound design — preflight sync + guard before `compile_canvas`, baseline
  after `sync_canvas`/publish, session start/stop. All bash pinned to Git Bash absolute path.
  Two caveats: added mid-session so **a restart is required** before they load; and the
  `mcp_tool` hook type has a known silent-no-op history (the guard fails closed on staleness
  precisely to make that loud).
- graphify set (2): **net negative in this repo** (U1). Spawns `python3` on every Read/Glob;
  cannot index `.pa.yaml` at all (extension list has no YAML); graph never built; the CLI its
  advice names isn't on PATH. Latency tax with zero payoff. Recommend removal here.

**Skills.** `orchestrator-coding` (delegation for any task > 2 files / 20 lines / new logic —
trigger correctly wired in CLAUDE.md, fixing V1's "present but never invoked" failure) and
`pa-process-init` (re-runnable updates). The canvas-apps plugin's own skills (`canvas-app`,
`add-data-source`) coexist; note the plugin's builder agents can call `compile_canvas` too —
the guard hooks gate that path as well, which is exactly the defense-in-depth you want.

**CLAUDE.md.** Editing workflow, verification ladder, single-publisher rule, and local
machine notes (WSL shadow, LF pinning, missing unpack artifacts) — good. Two nits: the graphify
section sits above the workflow (noise-first ordering), and `deploy/RUNBOOK.md` is referenced
but doesn't exist (T9).

**Git plumbing.** `commit-msg` hook live; `.gitattributes` pins `*.sh`/`*.pa.yaml` to LF and is
proven to travel (fresh clone → LF → 102/102).

## 4. Environment

| Aspect | Verdict |
|--------|---------|
| Node 24 / pac 2.8.1 / Python 3.14 | Solid; everything the tools need |
| bash | **Trap contained, not removed**: WSL shadows Git Bash; everything installed is pinned, but future bare-`bash` anything will hit it (E1) |
| PowerShell 5.1 | UTF-16 redirection trap (E2) — bit once already; saved to project memory |
| PATH | `~/.local/bin` missing → graphify unfindable by name (E3) |
| Backup | **None. No remote, no push** (U2) — the single worst thing in this picture |

## 5. Workflow readiness — the edit loop traced end-to-end

The required loop from CLAUDE.md, as it would run **today**:

| Step | Status |
|------|--------|
| 1. `connect` | ✅ Proven this session |
| 2. `sync_canvas` → scratch dir | ✅ Proven (note: refuses non-empty dirs, T8) |
| 3. lint + schema-validate | ✅ Proven on real source |
| 4. `compile_canvas` through the guard | ⚠️ **Unproven.** Hooks not yet loaded (restart). Then: if the `mcp_tool` preflight-sync silently no-ops, the guard sees no fresh baseline and **denies the publish** — fail-closed, with the manual `sync_canvas` fallback named in the deny message |
| 5. commit in the same breath | ✅ Hook proven live |

**Predicted first-publish experience:** blocked. That is the system working — but it will *feel*
broken if unexpected. The right move is a supervised smoke test (below), not debugging mid-feature.

Verification ladder availability: rungs 1–3 usable now; rung 4 (`pac-verify`) needs a one-time
`pac auth` proof; rungs 5–6 are human. Verified-stamp TTL (20 min) and the single-publisher lock
are functional (probed).

## 6. Assessment

**Suitability — good.** The architecture matches the platform's actual failure modes: no local
runtime, publish-is-not-save, last-writer-wins, forkable coauthoring sessions. Fail-closed gates
plus a mined git history is the right shape for that world, and the fresh-clone test proves the
setup is portable rather than machine-local (V1's core defect).

**Effectiveness — armed but not battle-tested.** Everything provable without a publish has been
proven. The critical untested joint is hook *delivery* (restart + `mcp_tool` risk, T6). Until one
real publish round-trip succeeds, treat the publish gate as designed-but-uncommissioned.

**Efficiency — acceptable, with known taxes.** Per-publish: one extra full `sync_canvas`
round-trip (by design — that's the freshness evidence). Per-Read/Glob: a pointless `python3`
spawn from graphify (removable). The install itself was the big inefficiency — covered in the
install audit (T1).

**Workflow — coherent on paper, two structural gaps.** (1) **One environment.** The rulebook's
dev→prod machinery (mock rules D1–D5, revert contract, `--require-prod`, sarif baseline) assumes
a promotion pipeline; with only the Default-environment app, every publish is to production and
half the machinery has no second stage to protect (U4). (2) **No remote** — process history is
the toolkit's raw material for improvement, and it currently lives on one disk (U2).

## 7. Before the first feature — commissioning checklist

Ordered; the first three are the gate between "installed" and "operational".

1. **Push to a remote** (U2). Rename to `main` first if desired (U3).
2. **Restart Claude Code**, then run the smoke sequence:
   a. `sync_canvas` to a scratch dir → check `guard.sh status` shows a **baseline hash**
      (proves PostToolUse command-hook delivery);
   b. a trivial supervised `compile_canvas` → confirm the preflight runs (proves the
      `mcp_tool` hook, or surfaces its no-op loudly while nothing is at stake).
3. **`pac auth` + `pac-verify` once** — commissions verification rung 4, the fork-immune channel.
4. **Capture schema snapshots** for the app's data sources into `schema/*.json` and register in
   `palint.config.json` → arms L4 (the check that catches the seed-type bug class).
5. **Export App Checker SARIF** → commit as baseline → arms P10.
6. **Decide the environment strategy** (U4): live-app editing accepted, or create a dev copy.
7. **Remove graphify from this repo** (U1) — or build its graph over `tools/` and accept the tax.
8. Housekeeping: add `%USERPROFILE%\.local\bin` to PATH (E3); prune `settings.local.json` (U5).

After steps 1–5 this is a genuinely well-defended setup — better instrumented than most
professional app repos. Between now and then, the honest description is: **excellent bones,
commissioning incomplete.**
