# sarif-diff

Zero-dependency Node CLI that diffs two SARIF 2.1.0 files from Power Apps
Studio's App Checker (`AppCheckerResult.sarif` — already part of the msapp
packable set, see `tools/pack-msapp`) and reports what got better or worse.

**Why it exists:** App Checker is the closest thing this process has to a
compiler diagnostic. V1 used its counts manually as a cross-check — that is
how 14 type errors were confirmed during the source project. Manual
eyeballing of counts doesn't scale into a deploy gate and doesn't survive a
diff being re-run by someone else. sarif-diff makes the comparison
deterministic: point it at a baseline run and a post-change run, and it tells
you which issues are NEW (block the deploy), which are FIXED (progress), and
how many are unchanged, grouped by severity.

## Usage

```bash
node tools/sarif-diff/sarif-diff.js --baseline <file> --current <file> [--json] [--fail-on <error|warning|note>]
```

| Flag | Meaning |
|------|---------|
| `--baseline <file>` | SARIF file from the prior run (required) |
| `--current <file>` | SARIF file from the run being checked (required) |
| `--json` | Emit machine-readable JSON instead of the human report |
| `--fail-on <level>` | Severity threshold that blocks the gate: `error` (default), `warning`, or `note` |

Typical runs:

```bash
# Pre-deploy gate: block only on new errors (default)
node tools/sarif-diff/sarif-diff.js --baseline baseline.sarif --current AppCheckerResult.sarif

# Stricter gate: also block on new warnings
node tools/sarif-diff/sarif-diff.js --baseline baseline.sarif --current AppCheckerResult.sarif --fail-on warning

# Machine-readable for CI
node tools/sarif-diff/sarif-diff.js --baseline baseline.sarif --current AppCheckerResult.sarif --json
```

`--fail-on` only affects the exit code, not what gets reported: FIXED issues,
and NEW issues at every severity, are always listed in full so a human can
see the whole picture even when the gate itself only cares about errors.

## What it reads from SARIF

Results live at `runs[].results[]`. Per result:

| Field | Spec status | How it's used |
|-------|-------------|----------------|
| `ruleId` | optional | part of the identity key; `(no-rule)` if absent |
| `level` | optional | `error` / `warning` / `note` / `none`; defaults to `warning` if absent or not one of those four values |
| `message.text` | required in spec, but a result may carry `message.id` instead (referencing `tool.driver.rules[].messageStrings`) | used as-is if `text` present, else falls back to `message.id`, else empty string — **`messageStrings` lookup is NOT resolved** (see Limitations) |
| `locations[0].physicalLocation.artifactLocation.uri` | optional (a result can have zero locations) | `(no-location)` if absent |
| `locations[0].physicalLocation.region.startLine` | optional | used only for display, never for matching |

Only the first location on a result is considered. `tool.driver.rules[]`
(rule metadata) is not read at all — nothing in the current report needs it.

## Matching semantics (the line-drift decision)

Identity for matching an issue between baseline and current is:

```
ruleId + file (artifactLocation.uri) + message.text
```

**Deliberately not line number.** Any edit above a line shifts every
diagnostic below it; if line number were part of the identity, an unrelated
one-line insertion earlier in the file would make every real, unchanged
issue below it look "fixed" and "new" at the same time — noise that would
drown out genuine regressions. Two occurrences of the same
(ruleId, file, message) triple are matched as a pair even if their line
numbers differ (see `test/fixtures/line-drift/`).

This means: if the *same message* moves to a *different line*, it is
unchanged. If the message text itself changes (e.g. App Checker rewords a
diagnostic, or a different variable name appears in an otherwise-identical
error), it is treated as a different issue — reported as one FIXED and one
NEW. That's a known tradeoff of a message-text key; see Limitations.

Duplicate identical results (same ruleId+file+message appearing more than
once) are matched as a multiset, not a set: if baseline has two occurrences
and current has one, that's one unchanged and one FIXED — not "no change."

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No new issue at or above the `--fail-on` threshold |
| `1` | At least one new issue at or above the `--fail-on` threshold |
| `2` | Tool error: bad/missing arguments, invalid `--fail-on` value, unreadable file, malformed JSON, or JSON that isn't SARIF-shaped (no `runs` array) |

`--json` output is printed for exit codes 0 and 1; errors (exit 2) go to
stderr only, same convention as `tools/prod-revert`.

## JSON output shape

```json
{
  "failOn": "error",
  "new": [
    { "ruleId": "app-checker-new-issue", "level": "error", "file": "Screen4.fx.yaml", "line": 8, "message": "New error introduced by this change." }
  ],
  "fixed": [
    { "ruleId": "app-checker-unused-var", "level": "warning", "file": "App.fx.yaml", "line": 5, "message": "Variable 'gblFoo' is never used." }
  ],
  "summary": {
    "new": { "error": 1, "warning": 1, "note": 0, "none": 0, "total": 2 },
    "fixed": { "error": 0, "warning": 1, "note": 0, "none": 0, "total": 1 },
    "unchanged": { "error": 2, "warning": 0, "note": 1, "none": 0, "total": 3 }
  },
  "ok": false
}
```

`new` and `fixed` list every changed issue at every severity (not just those
at/above the fail-on threshold); `ok` reflects the threshold check.
`unchanged` is counts only — not the full list — since it can be the largest
bucket and callers generally don't need every unchanged issue named.

## Tests

```bash
node --test "tools/sarif-diff/test/*.test.js"
```

(On some Windows Node builds, passing a bare directory to `node --test` fails
to expand; use the quoted glob form above.)

Fixtures under `test/fixtures/` are hand-authored small SARIF documents, one
directory per scenario (`identical/`, `new-error/`, `fixed-error/`,
`line-drift/`, `empty-results/`, `fail-on/`, `optional-fields/`) plus a
`main/` fixture that mixes unchanged, new, fixed, and line-drifted issues in
one pair of files, and two malformed-input files (`malformed.json`,
`not-sarif.json`).

## Known limitations

- **UNVERIFIED against a real Studio-generated `AppCheckerResult.sarif`.**
  No authenticated Power Apps session was available in this build session,
  so the fixtures were hand-authored to match the SARIF 2.1.0 spec (and the
  shape documented for App Checker's SARIF export) rather than captured from
  an actual Studio run. Real App Checker output may use rule ids, message
  wording, or structural details (e.g. multiple runs, multiple locations per
  result, `relatedLocations`, rule metadata under `tool.driver.rules[]`) that
  these fixtures don't exercise. **Before trusting this as a deploy gate,
  run it once against a real `AppCheckerResult.sarif` pair and confirm the
  reported `ruleId`/`file`/`message` values look sane** — if App Checker's
  actual export shape differs from what's assumed here, that first real run
  is where it will show up.
- **`message.id` / `messageStrings` is not resolved.** If a result's message
  is expressed only via `message.id` (a reference into
  `tool.driver.rules[].messageStrings`) rather than `message.text`, this tool
  falls back to using the raw `id` string as the message, which will not
  match the same rule's `text`-form message from a different run. In
  practice App Checker output is expected to carry `message.text` directly;
  this is a spec-compliance gap, not a validated App Checker behavior.
- **Message-text identity is exact-match.** If App Checker rewords a
  diagnostic (e.g. inserts a different variable name into an otherwise
  identical sentence) between baseline and current, the tool sees a FIXED
  issue and a NEW issue rather than one unchanged issue. This is the same
  tradeoff any content-based key makes; a fuzzy/templated match was judged
  out of scope for a first version.
- **Only the first location is used.** A result with multiple
  `locations[]` entries (SARIF allows this for issues spanning several
  files) is keyed and reported using only `locations[0]`.
- **Multiple `runs[]` are flattened together** with no per-run
  identification in the output — if a SARIF file legitimately contains
  distinct tool runs, their results are merged into one pool for diffing.
- SARIF is JSON, so `JSON.parse` is the entire parser; no schema validation
  beyond checking `runs` is an array. A file with `runs` present but
  otherwise garbage (e.g. `results` not an array) is tolerated via `|| []`
  and simply yields zero issues rather than a hard error.
