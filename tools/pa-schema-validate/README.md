# pa-schema-validate

Validates Power Apps Canvas App `.pa.yaml` source against Microsoft's published JSON Schema for
the format. Zero dependencies, Node ≥ 20.

**Why it exists:** pa-lint's checks are deliberately a *line model*, not a YAML engine (see
`tools/pa-lint/README.md`) — a real parser would happily accept the exact defect L1 exists to
catch. That leaves a gap: structural mistakes that a line-by-line scan cannot see because they
require an actual parsed tree - unknown or typo'd keys, malformed control trees, two controls
accidentally merged into one z-order slot, wrong-typed properties. pa-schema-validate is that
check: it parses `.pa.yaml` for real and validates the result against the same schema Microsoft
ships for editor tooling.

## What it catches that pa-lint cannot

| Defect class | Example | Why the line model misses it |
|---|---|---|
| Unknown / typo'd key | `Propertiess:` instead of `Properties:` | A line model has no concept of "the set of keys valid at this position" |
| Bad z-order sequence | A `Children` list item ends up with two control keys instead of one (a mis-indent silently folds a second control's key into the previous item's map) | Requires knowing the *nesting depth and grouping* of a sequence item, not just its indent column |
| Wrong-typed property | `IsLocked: "true"` (a quoted string) where the schema requires an actual boolean | A line model doesn't resolve YAML scalar types at all |
| Malformed control trees generally | Missing `Control:` on an instance, extra properties disallowed for a given control kind (e.g. `CanvasComponent` requires `ComponentName` and forbids `Variant`) | These are `if`/`then`/`else` and `oneOf` relationships in the schema; a line model has no schema |

## Usage

```bash
node tools/pa-schema-validate/validate.js --src Src           # human output, exit 1 on findings
node tools/pa-schema-validate/validate.js --src Src --json    # machine output
```

Exit codes: `0` clean, `1` findings, `2` usage error (bad flag, missing `--src` directory).

## Schema provenance (pinned, not floated)

Vendored at `schema/pa.schema.yaml`, copied verbatim (content untouched) from:

- Source: `https://raw.githubusercontent.com/microsoft/PowerApps-Tooling/master/schemas/pa-yaml/v3.0/pa.schema.yaml`
- Pinned to commit: `a03a42b966f7308cd3f888304e56330edea155ec` ("Update PaYamlV3 schema for
  CodeComponents and CanvasComponents (#761)", authored 2025-10-13)
- Fetched: 2026-07-29

This repo is preview-grade; the schema is expected to change upstream. Re-vendor deliberately
(re-fetch, re-pin the commit here, re-run the test suite and the real-source false-positive pass
below) rather than tracking `master` live.

## Architecture

- `lib/yaml-parse.js` - a hand-rolled block-style YAML subset parser. Produces a real tree
  (`{kind: 'map'|'seq'|'scalar', line, ...}`), not a flat line list, so nesting depth and grouping
  are actually known - which is exactly what pa-lint's line model cannot give the z-order and
  malformed-tree checks. See "Dependency decisions" below for why this is hand-rolled instead of
  `js-yaml`.
- `lib/json-schema.js` - a hand-rolled draft-07 JSON Schema evaluator, scoped to exactly the
  keyword set `pa.schema.yaml` uses (see below). Operates directly on the parser's node tree so
  every finding carries a real source line, not just a JSON pointer path.
- `lib/schema-loader.js` - reads and parses the vendored schema once per process (it's YAML too;
  parsed with the same `yaml-parse.js`, then flattened to a plain JS object via `toPlain()`).
- `lib/validate-file.js` - parses one `.pa.yaml` file and validates it; returns
  `{check, severity, file, line, message}` findings, matching pa-lint's finding shape.
- `validate.js` - CLI: walks `--src` for `**/*.pa.yaml`, reports text or `--json`.

## Dependency decisions

**JSON Schema evaluator: hand-rolled, not `ajv`.** The plan's working estimate was that
`pa.schema.yaml` uses a small keyword subset (`type`, `properties`, `additionalProperties`,
`propertyNames`, `oneOf`, `pattern`, `minProperties`, `maxProperties`, `$ref`) and could stay
under ~200 lines. Inspecting the actual vendored file, the real keyword set is larger: it also
uses `required`, `enum`, `const`, `allOf`, `anyOf`, `not`, and `if`/`then`/`else` (all exercised by
`ControlTypeId` and `Control-instance`'s 1P-vs-3P-control branching). Despite that, the evaluator
(`lib/json-schema.js`) came in at 168 lines - still under the original estimate, because every
keyword in play is purely structural: no `format`, no numeric range keywords, no
`patternProperties`, no external or `$recursiveRef` `$ref` (only local `#/definitions/...`).
Given that bounded surface, and that **no file in this repo has a `package.json` or any runtime
dependency** - `ajv` would be the first dependency ever added to this toolkit - hand-rolling was
judged the right call, not a shortcut.

**YAML parsing: hand-rolled, not `js-yaml`.** This is a materially bigger ask than the schema
evaluator, and deserves a more careful, honest answer:

- The `.pa.yaml` corpus this tool validates (verified against the real, published booking app's
  `Src/`) is machine-generated by Studio round-trip and structurally narrow: block mappings,
  block sequences of single-key items, block scalars for formulas, no comments, no anchors/
  aliases, no flow collections, no quoted structural keys (quoted-looking text like
  `'RoomID: Title'` only ever appears *inside* a Power Fx block-scalar body, which is opaque
  content to this parser, not real YAML structure).
- The vendored *schema* file itself is a different animal - real hand-authored YAML using
  single-line flow collections (`{ $ref: "..." }`, `[Control]`), folded/literal block scalars for
  descriptions, and quoted keys (`'${2:Control1}'`, `$comment`). `lib/yaml-parse.js` supports both
  documents: block-style parsing (the load-bearing part, exercised against real source) plus a
  minimal single-line flow-collection parser (exercised only by loading the schema itself, since
  the schema's own YAML is the only place flow syntax appears in this tool's inputs).
- **This is not a general YAML 1.2 parser**, and it would be dishonest to claim it behaves like
  one. See "Known limitations" below for the exact gaps. The call to hand-roll rather than pull in
  `js-yaml` rests on: (a) the same zero-dependency precedent as above, (b) the corpus-verified
  narrowness of real `.pa.yaml` structure, and (c) every gap being one this tool doesn't need to
  close to do its job (e.g. YAML's own strict rejection of ambiguous plain scalars is L1's job,
  not this tool's - pa-lint already catches that class by design).

## Known limitations

- **No Power Fx validation.** The schema treats every control/component property value as
  `pfx-formula`: `oneOf: [{type: string, pattern: "^=.*"}, {type: 'null'}]`. It cannot and does not
  check formula syntax or semantics - only "starts with `=`, or is absent." That is Task C2
  (`pa-fx-check`)'s job, not this tool's.
- **Several control kinds are marked unsupported in the schema itself**, not by this tool:
  `ControlTypeId-disallowed-types` (`AppInfo`, `HostControl`, `Screen`, `AppTest`, `TestCase`,
  `TestSuite`) and `ControlTypeId-not-yet-supported` (`CommandComponent`, `DataComponent`,
  `FunctionComponent`) are rejected by the vendored schema, so a control instance using one of
  these will always fail here even if Studio itself accepts it in some newer release than the
  pinned commit. Re-pin the schema (see Provenance) if that happens.
- **Not a general YAML parser** (see "Dependency decisions" above for the full reasoning). Concretely:
  - **It does fail closed on content it cannot attach.** Every non-blank line must be consumed;
    if any is left over, the file is reported as a `PARSE` error naming that line, and no schema
    findings are produced for it. This exists because the original implementation did the
    opposite: misindented content was silently *abandoned* (a sequence loop broke on the
    unexpected indent, every enclosing loop broke too, and the remainder was dropped), so a
    screen with a misindented control validated **"clean" with that control missing from the
    tree entirely**. A validator that silently skips input is worse than no validator, because
    it reports success. If you see `unparsed content`, the file's indentation is inconsistent —
    that is a real defect, not a tool limitation.
  - No anchors, aliases, tags, or multi-document support.
  - Flow collections (`{...}` / `[...]`) are supported only for simple single-line cases - enough
    for the vendored schema's own one-liners. Multi-line flow, or flow scalars containing
    unescaped commas/brackets, are not supported.
  - Comments (`# ...`) are not stripped. The real corpus never contains them (Studio doesn't emit
    YAML comments); if a hand-edited file did, the `#` and everything after it would be swallowed
    into the scalar value rather than ignored.
  - Plain scalars containing `": "` are accepted leniently rather than rejected the way a strict
    YAML engine (and the actual publish pipeline) would - this is deliberate, not an oversight:
    that exact defect class is pa-lint's L1 check, and duplicating a stricter rejection here would
    just be a second, worse implementation of L1.
  - Block scalar chomping (`|-` strip vs `|` clip vs `|+` keep) is approximated (trailing blank
    lines are always stripped) rather than implemented to the exact YAML spec. This does not
    affect schema validation, which only cares about a formula's type and its `^=` prefix, never
    its exact trailing whitespace.
- **Per-file, not per-app.** Each `.pa.yaml` file under `Src/` is a *fragment* of the logically
  combined document the schema describes (e.g. a screen file contains only `Screens: {ScreenName:
  ...}`, never `App:`/`DataSources:`/etc.). This works because the root schema's
  `additionalProperties: false` only rules out keys outside `{App, Screens, ComponentDefinitions,
  DataSources, EditorState}` - a valid fragment containing a subset of those is still schema-valid
  on its own. This tool does **not** cross-check that, e.g., a `ComponentName` referenced in one
  file actually has a matching `ComponentDefinitions` entry in another file - that would require
  assembling the whole app first, which is out of scope for a per-file structural check.

## Real-source false-positive check

Run against the live, published booking app's source (`booking/src_prodaudit`, 10 files including
a 616-line `App.pa.yaml` with a 33 KB embedded Power Fx block scalar): **zero findings.** Before
trusting that "zero," three defects were deliberately injected into copies of the real files to
confirm the validator (and not a silent no-op bug) produced the clean result:

1. Typo'd key (`Properties:` → `Propertiess:`) inside a real `con_shell` control → flagged.
2. Wrong-typed property (`IsLocked: "true"`, quoted string vs. required boolean) added to a real
   control → flagged.
3. Simulated bad z-order (two sibling `Children` sequence items merged into one map, exactly the
   shape a stray re-indent produces) using two real controls (`Shell_Header_`, `con_body_home`) →
   flagged, naming both merged control names.

All three were caught with correct file/line/message. The tree-building parser was also confirmed
to fully and correctly parse `App.pa.yaml`'s large `Formulas` block scalar (33,277 characters,
starting with `=` as expected) rather than truncating or silently failing on it. On that basis,
the zero-finding result against the unmodified real tree is a genuine "structurally valid," not a
validator gap.

## Tests

```bash
node --test "tools/pa-schema-validate/test/*.test.js"
```

(Note: `node --test <dir>` with a bare directory argument fails on Node 24/Windows - use the glob
form, same as pa-lint.)
