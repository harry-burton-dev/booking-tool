# pa-lint

Pre-publish lint for Power Apps Canvas App YAML (`Src/**/*.pa.yaml`). Zero dependencies, Node ≥ 20.

**Why it exists:** there is no local runtime — `compile_canvas` is the only validator and it *is*
a publish. The source project shipped 1.6 fix commits per feature; the recurring defect classes
are all text-checkable before publish. pa-lint is that check, runnable by workers (who may never
compile), by the guard's pre-publish gate, and by the deploy gate.

## Usage

```bash
node tools/pa-lint/lint.js --src Src                    # human output, exit 1 on errors
node tools/pa-lint/lint.js --src Src --json             # machine output
node tools/pa-lint/lint.js --src Src --checks L1,L5     # subset
node tools/pa-lint/lint.js normalize Src/Home.pa.yaml   # strip server-normalization noise (L9)
node tools/pa-lint/lint.js check-markers "fnOverlaps(" --src /tmp/fresh-sync   # rung-3 verify
```

## Checks

| ID  | What | Defect that earned it |
|-----|------|----------------------|
| L1  | Inline formula containing `: ` must be a block scalar | 3 compile failures in 2 days + a component cascade |
| L2  | Every referenced global (by prefix, default `gbl`/`glb`) has a `Set()` site | lost compile round-trip (`gblFindLegacyGrid`) |
| L3  | `Classic/ComboBox` denylist (error); ManualLayout inside AutoLayout (warn); `CustomProperties` (warn) | ws4 ComboBox failure; layout-engine silent failures; Studio-first custom props |
| L4  | Seed literals vs `schema/*.json` snapshot: field names + literal types incl. lookup `Value` shape | the 14-site Text/Number cascade; the masked double-booking bug |
| L5  | Property-name traps (Toggle `Default:`→`Checked:`; Classic/Button `AccessibleLabel`); extensible | Profile screen compile failure |
| L6  | Every `// RESET-SITE[name]` formula mentions every configured stateful var | reset omissions fixed in 3 separate commits |
| L7  | `DateTimeValue("…")`-style literal parses (locale traps) | DA-6 class |
| L8  | Control/instance names globally unique | component instance-name compile error |
| DS1 | No raw `RGBA(`/hex outside token files (only when `designSystem.enabled`) | design-system determinism (Process V2 §5) |
| L9  | `normalize` subcommand: strip `@x.y.z` suffixes + default-equal props for clean diffs | false-drift confusion in every post-publish diff |

## Config (`palint.config.json`, in the app repo root)

```json
{
  "globalPrefixes": ["gbl", "glb"],
  "extraTraps": [{ "control": "Slider", "prop": "Default", "suggest": "use Value:" }],
  "denyControls": { "SomeControl": "reason and workaround" },
  "seedSchemas": { "colRooms": "schema/book-rooms.json" },
  "statefulVars": ["varWizardStep", "varSelectedRoom"],
  "designSystem": { "enabled": true, "tokenFiles": ["App.pa.yaml"], "exemptMarker": "DS-EXEMPT" }
}
```

Schema snapshot format (`schema/*.json`):

```json
{ "source": "Book_Rooms (SharePoint)", "capturedAt": "2026-07-28",
  "fields": { "Title": "text", "RoomID": "lookup-number", "Capacity": "number", "IsPrivate": "boolean" } }
```

Types: `text | number | boolean | date | lookup-number | lookup-text`. Only literals are
validated; computed seed expressions are skipped by design.

## Conventions the checks rely on

- **Reset sites** are marked in source: `// RESET-SITE[wizard-restart]` inside the behavior
  formula. Self-anchoring — no file:line config to go stale.
- **DS exemptions** are marked in source: `// DS-EXEMPT` on the line, justified in the kit RULES.

## Tests

```bash
node --test tools/pa-lint/test/*.test.js
```

(Note: `node --test <dir>` with a bare directory argument fails on Node 24/Windows — use the
glob form.)

## Known limitations

- Line-model parser, not a YAML engine — intentional (a real YAML parser accepts the exact
  defect L1 catches). Exotic hand-written YAML may confuse it; server-round-tripped pa.yaml is
  the supported shape.
- L2 is prefix-based: globals not following the naming convention are invisible to it.
- L4 validates literals only; L3 cannot know whether a `CustomProperties` entry already exists
  on the server (hence a warning, not an error).
- L4 does not see `Collect('Quoted Collection', …)` (quoted collection names) — use plain
  identifiers for mock collections. String-concat literals (`"a" & "b"`) classify as text,
  which is correct for the resulting type.
- Shell tooling targets Git Bash (bash ≥ 4.4); macOS's bash 3.2 is unsupported.
