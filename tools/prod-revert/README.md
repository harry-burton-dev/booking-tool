# prod-revert / revert-check

Zero-dependency Node CLI that verifies Power Apps Canvas App sources have been
reverted from sandbox (dev) form to production form before deploy.

Dev work happens against mock data. Every code site that must change before a
production deploy carries a marker comment in the `.pa.yaml` source:

```
// PROD-REVERT[<id>]
/* PROD-REVERT[<id>] */
```

A contract markdown file declares, per id, what the code looks like in dev
form and in prod form. This tool cross-checks every marker site against the
contract and reports whether each site is still in dev form, already in prod
form, or in neither/both.

## Usage

```
node revert-check.js --src <dir> --contract <file> [--json] [--require-prod]
```

| Flag | Meaning |
|------|---------|
| `--src <dir>` | Directory scanned recursively for `*.pa.yaml` files (required) |
| `--contract <file>` | Contract markdown file (required) |
| `--json` | Emit machine-readable JSON instead of the table report |
| `--require-prod` | Additionally require every site to be in PROD form |

Typical runs:

```bash
# During dev: check nothing is orphaned or unclassifiable
node tools/prod-revert/revert-check.js --src Src --contract REVERT-CONTRACT.md

# Pre-deploy gate: every site must be reverted to prod form
node tools/prod-revert/revert-check.js --src Src --contract REVERT-CONTRACT.md --require-prod
```

## Site statuses

For each marker, the 30 lines following the marker line are searched for the
entry's dev pattern and prod pattern:

| Status | Meaning |
|--------|---------|
| `DEV` | Dev pattern found, prod pattern not found |
| `PROD` | Prod pattern found, dev pattern not found |
| `UNKNOWN` | Neither pattern found |
| `AMBIGUOUS` | Both patterns found |
| `ORPHAN` | Marker id has no entry in the contract |

The tool also reports orphan contract entries: ids declared in the contract
with no marker anywhere in the source tree. The same id may legitimately
appear at multiple marker sites; each site is checked and counted separately.

## Contract format

- Each entry starts with a level-3 heading whose text is the marker id:
  `### <id>`.
- Within an entry, a fenced code block labeled `dev` gives the dev-form
  pattern and a block labeled `prod` gives the prod-form pattern. Both are
  required; an entry missing either is a fatal error (exit 2).
- Any prose between the heading and the blocks is ignored. Fenced blocks with
  other labels (or no label) are ignored.

Worked example entry:

````markdown
### writes-newbooking

Booking submission writes to the mock table in dev.

```dev
Patch(
  MockBookings,
  Defaults(MockBookings),
  BookingRecord
)
```

```prod
Patch(Bookings, Defaults(Bookings), BookingRecord)
```
````

A source site in dev form:

```yaml
OnSelect: |
  =// PROD-REVERT[writes-newbooking]
  Patch(
    MockBookings,
    Defaults(MockBookings),
    BookingRecord
  )
```

## Matching semantics

- Patterns are **literal substrings** — no regex, no Power Fx parsing.
- Each pattern is trimmed as a whole; each pattern line and each source line
  is trimmed of leading/trailing whitespace before comparison.
- A single-line pattern matches if any line in the 30-line window contains it
  as a substring (after trimming).
- A multi-line pattern matches only **contiguous** lines: each trimmed
  pattern line must be a substring of the corresponding trimmed source line.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No orphan markers, no orphan contract entries, no UNKNOWN or AMBIGUOUS sites. With `--require-prod`, additionally no DEV sites (every site PROD). |
| `1` | Check failed (any orphan, UNKNOWN, AMBIGUOUS, or — with `--require-prod` — DEV site). |
| `2` | Tool error: bad/missing arguments, missing source directory, unreadable contract, malformed contract entry. |

`--json` output is printed for exit codes 0 and 1; errors (exit 2) go to
stderr only.

## JSON output shape

```json
{
  "requireProd": false,
  "sites": [{ "file": "Screen1.pa.yaml", "line": 10, "id": "r-dev", "status": "DEV" }],
  "orphanMarkers": ["r-orphan"],
  "orphanContractEntries": ["r-nomarker"],
  "summary": {
    "sites": 7, "dev": 1, "prod": 3, "unknown": 1, "ambiguous": 1,
    "orphanMarkerSites": 1, "orphanContractEntries": 1
  },
  "ok": false
}
```

`file` is relative to `--src` with forward slashes; `line` is 1-based.

## Tests

```bash
node --test "tools/prod-revert/test/*.test.js"
```

(On some Windows Node builds, passing a bare directory to `node --test` fails
to expand; use the quoted glob form above.)

## Limitations

- **Literal substring matching only.** Whitespace differences within a line
  (e.g. `Status="Open"` vs `Status = "Open"`) do not match. Patterns should
  be written exactly as the code appears, modulo indentation.
- **30-line window.** The dev/prod code must begin within 30 lines after the
  marker line. Code further away is not seen (site reads UNKNOWN).
- Short patterns can produce false positives via substring collisions (e.g. a
  prod pattern that is a substring of the dev form). Prefer patterns long
  enough to be unambiguous.
- Markers are detected by comment syntax textually; a marker-like string
  inside a string literal would also be picked up.
- Only files ending in `.pa.yaml` are scanned.
