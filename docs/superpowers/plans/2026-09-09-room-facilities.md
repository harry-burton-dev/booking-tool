# Room Properties & Facilities — Implementation Plan

> **Execute with: `orchestrator-coding`** — never a superpowers execute skill. Steps use checkbox
> (`- [ ]`) syntax for tracking. Lanes are declared per task below and are not re-litigated at
> dispatch time.

**Budget:** 11 dispatches, ≤1.1M subagent tokens. 1.5× either → STOP and report (skill hard rule).

**Spec:** `docs/superpowers/specs/2026-09-09-room-facilities-design.md`. Read it before
dispatching anything — this plan implements it and does not restate rationale. Decisions are
cited as **D1**–**D7**, defects as **B-1**–**B-5**.

**Goal:** admins set a room's capacity, security classification, systems and public note; users
filter on those and see them on the card.

**Architecture:** three new `Text` columns on `Book_Rooms` plus `IsActive` (D1/D7). Vocabularies
are multi-row `Book_AppSettings` entries with in-code defaults (D4), parsed into named formulas.
Facility matching moves from substring to bounded-token keys derived once per room in
`RoomsBrowseBase` (D3). Find and Rooms collapse onto one filter model before any facet is added
(D6). Classification is advisory only (D5).

**Tech stack:** Power Apps Canvas (`.pa.yaml` via canvas-authoring MCP), pa-lint /
pa-schema-validate / canvas-guard, App Checker SARIF diff (P10).

**Three publish checkpoints:** after **T3** (formula layer alone — nothing reads it yet, so a
bad type fails loud and cheap), after **T7** (Rooms + Find usable), after **T10**.

---

## Ground rules (rule IDs — see `docs/RULES.md`; do not restate)

- **Process:** P1–P10, especially P4, P5, P6/P7, and **P10 — which has no baseline yet; T1
  establishes it.** O1 (workers lint, never compile/commit), O2, O3.
- **Authoring:** Y1 (any formula containing `: ` is a `|-` block scalar — the `Split`/`Index`
  parsing in T3 hits this repeatedly), Y2, **Y3 (no `Classic/ComboBox` via YAML — classification
  uses `Classic/DropDown`, multi-select uses chip galleries)**, Y4, Y6 (fresh control names —
  new controls here take suffix `_rf`), Y8 (named formulas over snapshot collections; `Set()` is
  illegal inside `ForAll`), **Y9 (the `con_tile_view` re-layout in T6)**. **DS1:** no raw hex
  outside the token block — the vocabulary's colour field is a *token name* (D4).
- **Data:** **D1 (mock seeds mirror live schema — `schema/Book_Rooms.json` must be re-snapshotted
  in T2 before any seed is written)**, D3 (seeds are hostile fixtures: the `"AVC"` row in T10 is
  the permanent regression fixture for B-1), D4 (`// RESET-SITE[adrm-form]` in T5), D5.
- **Anchors (O3):** anchor by control name + quoted code, never line numbers. Names below are
  from git `0ea5e77`, **not** from a fresh sync — see Blockers. Workers re-anchor against their
  own fresh sync; missing anchor → STOP and report drift.
- **Probe-compile doctrine:** **T3 is THE type risk of this plan** (`Split`/`Index` parsing,
  three newly-typed SharePoint columns, two new derived fields on `RoomsBrowseBase` that every
  screen reads). It is implemented and compiled **ALONE** before T4–T10 are dispatched, and the
  compiler's verdict becomes a hard constraint in every later task spec.
- **Mirror convention:** every `Book_Rooms` write mirrors into `colRooms`; every
  `Book_AppSettings` write mirrors into `colAppSettings`. Both mirrors are load-bearing — the
  vocabulary named formulas read `colAppSettings`, not the data source.

---

## Blockers

- [x] **BL-1 · `sync_canvas` / `get_data_source_schema` errors — CLEARED 2026-09-09 21:33.**
  Operator error, not a broken session: both take **camelCase** parameters (`directoryPath`,
  `dataSourceName`) and were called with snake_case. Fresh sync landed 16 files into
  `.scratch/rf-20260909-2130`; live `Book_Rooms` schema read and recorded in spec §10.
  **Workers: read each tool's schema. `connect` is snake_case, these two are not — the casing
  is per-tool, and `.claude/settings.json` already encodes the correct form.**
- [ ] **BL-2 · app ID changed.** Live is `a5fe0780-88fa-4bc5-9e55-5a2e9850ecda`. Every plan and
  `docs/APP-CHECKER-BASELINE.md` still name `498d4962-0b5f-4990-a400-1bf5de9a367c`. Correct them
  or every Task 0 connects to the wrong app.
- [ ] **BL-3 · vocabulary terminology unconfirmed.** Spec §8 uses placeholder level and system
  names. Harry confirms the real ones before T2 — they become stored data, and changing a *code*
  later is a migration.
- [ ] **BL-4 · P5 reconcile owed.** `AdminPermanentNew.pa.yaml` differs from live by 16 lines
  (Studio edits: `adRecHtxHint` deleted, `FillPortions` dropped, `AutoHeight` added). Every other
  file is byte-identical. Reconcile before cutting `feat/room-facilities`.

---

## Task 0: Session open — connect, sync, reconcile, baseline

**Lane:** orchestrator-only (no dispatch). **Files:** none edited.

- [ ] **Connect** (MCP `connect`, snake_case): `environment_id = "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd"`,
  `app_id = "a5fe0780-88fa-4bc5-9e55-5a2e9850ecda"`, `login_hint = "harry@harry-burton.ai"`.
- [ ] **Fresh sync** into a NEW scratch dir, never `Src/`:
  `sync_canvas(directoryPath: "<abs>/.scratch/rf-<yyyymmdd-hhmm>")` — **camelCase, see BL-1.**
  Expect 16 files.
- [ ] **Reconcile git (P5):** byte-compare sync vs `Src/`. Known drift as of 21:33 is
  `AdminPermanentNew.pa.yaml` only (BL-4). Copy sync over `Src/` on new branch
  `feat/room-facilities` and commit
  `sync: reconcile server drift before room facilities pass (P5)`.
- [ ] **Baseline:** pa-lint count, `get_appchecker_errors` count (**expect 19** — was 15 at Phase
  0), room row count.

## Task 1: Establish the App Checker baseline (P10 has no teeth today)

**Lane:** orchestrator-only + human. No dispatch. **Files:** `docs/APP-CHECKER-BASELINE.md`,
`sarif-baseline.json`.

Doing this first is deliberate: this pass adds `Book_AppSettings` reads that draw the same
`CollectDelegatableDataSource` finding, and without a baseline the count keeps climbing
unnoticed — as it already has, 15 → 19.

- [ ] Export App Checker SARIF for `a5fe0780-…` and commit as `sarif-baseline.json`.
- [ ] Confirm the gate has teeth:
  `node tools/sarif-diff/sarif-diff.js --baseline sarif-baseline.json --current AppCheckerResult.sarif`
- [ ] Rewrite `docs/APP-CHECKER-BASELINE.md`: drop "NOT YET ESTABLISHED", record the count, the
  new app ID, and the 15 → 19 drift with its causes.
- [ ] Commit `chore(process): establish App Checker baseline, enforce P10 (BL-2)`.

## Task 2: SharePoint schema + schema snapshot + seeds

**Lane:** orchestrator-only + human (SharePoint site work is outside the canvas app). **Files:**
`schema/Book_Rooms.json`, `schema/Book_AppSettings.json`.

- [ ] Add to `Book_Rooms`: `Classification` (Text), `Systems` (Text),
  `RoomNotes` (Text, multi-line), `IsActive` (Yes/No, default Yes).
- [ ] Seed the `Book_AppSettings` vocabulary rows from spec §8 (confirmed names, per BL-3).
- [ ] **Re-snapshot `schema/Book_Rooms.json` from live (D1)** — the current file is a hand-written
  snapshot and must be regenerated, not edited. Add `schema/Book_AppSettings.json`, which does
  not exist despite the list being live.
- [ ] Preserve the existing `invariant` line verbatim and add a note that **B-5 contradicts it**
  and is tracked separately.
- [ ] Run `node tools/pa-schema-validate/validate.js --src Src` — expect clean (no seeds
  reference the new columns yet).
- [ ] Commit `feat(data): add classification, systems, notes, IsActive to Book_Rooms (D1/D7)`.

## Task 3: Formula layer — vocabularies, tag helpers, derived keys ⚠ PROBE COMPILE

**Lane:** novel. **Risk: high** (App.Formulas breakage hits every screen; `Split`/`Index` parsing
and three newly-typed columns are unproven here). **Reviewer runs.**
**Files:** Modify `App.pa.yaml` (`Formulas:` block only).

**This task is implemented and compiled ALONE.** No other task is dispatched until it compiles
with 0 errors. Its verdict becomes a hard constraint in every later task spec.

- [ ] Add `ClassificationDefaults` / `SystemTagDefaults` / `EquipmentTagDefaults` as `Table(...)`
  literals (spec §8).
- [ ] Add `ClassificationLevels` / `SystemTags` / `EquipmentTags`: parse
  `Filter(colAppSettings, Title = "<key>")` with `Split(Value, "|")` + `Index(_p, n).Result`,
  falling back to the defaults table when the filter is empty — the `SettingNumber(key, dflt)`
  pattern. Sort `ClassificationLevels` by `Rank` ascending.
- [ ] Add `fnNormalizeTags(raw:Text):Text` accepting both `,` and `;`, and
  `fnHasTag(key:Text, tag:Text):Boolean` per D3.
- [ ] Add `fnClassOf(code:Text)` returning the level record, and `fnClassRank(code:Text):Number`
  returning `0` for blank/unknown so an unclassified room never outranks a classified one.
- [ ] Extend `RoomsBrowseBase` with `Classification`, `ClassRank`, `SystemsKey`, `EquipmentKey`,
  `Notes`, `IsActive`.
- [ ] **Compile-watch:** the 3-arg `Concat(table, expr, separator)` form is **unproven in this
  repo** — every existing site uses the 2-arg form. If `fnNormalizeTags` needs it and it fails,
  fall back to building with a trailing separator and trimming. Report which form compiled.
- [ ] pa-lint (**Y1 will bite** — these formulas contain `: ` inside records) → READY.
- [ ] **Orchestrator probe-compiles, then publishes checkpoint 1 and commits (P4).**

## Task 4: Unify the Find and Rooms filter models (D6)

**Lane:** novel. **Risk: high** (rewrites the read path both browse screens depend on).
**Reviewer runs.** **Files:** Modify `App.pa.yaml`, `Find.pa.yaml`, `Rooms.pa.yaml`.

Prerequisite to T6/T7 — adding three facets to two divergent models is the thing that would
double this plan's cost.

- [ ] Replace `varFindEquipment` (single-select) and `colRoomsEquipmentFilter` (multi-select)
  with `colRoomFacetSystems`, `colRoomFacetEquipment`, `gblRoomMinClassRank`.
- [ ] One named formula applies capacity + classification rank + systems + equipment; `FindRooms`
  and `RoomsBrowseData` both consume it. **Classification is `ClassRank >= gblRoomMinClassRank`,
  not equality (D2)** — an equality filter hides the SECRET room from an OFFICIAL request.
- [ ] Retire `varFindMinCapacity`/`varFindMaxCapacity` bucket pairs in favour of the shared
  minimum, keeping the existing Find chip labels.
- [ ] Update every `Set()` site listed by `grep -rn "varFindEquipment\|colRoomsEquipmentFilter"`
  (App.OnStart, `Rooms.OnVisible`, `btnRoomsClearFilters`, five Find chips) — **Y2: every global
  needs a `Set()` site.**
- [ ] **Fix B-4 in the same pass:** add `gblRoomsFavOnly` to `btnRoomsClearFilters.OnSelect` and
  to `Rooms.OnVisible`, which reset its four siblings and skip it.
- [ ] pa-lint → READY.

## Task 5: Admin room form — classification, systems, equipment, notes

**Lane:** pattern (form CRUD), but **Risk: high** — it is a write path.
**Files:** Modify `Admin.pa.yaml`.

- [ ] Insert between `adRmInpCap` and `adRmInpDesc`: `adRmDrpClass_rf` (`Classic/DropDown` over
  `ClassificationLevels` — **Y3 bars ComboBox**), `adRmGalSystems_rf` + `adRmGalEquip_rf` chip
  galleries, `adRmInpNotes_rf` (`Mode: =TextMode.MultiLine`).
- [ ] Delete free-text `adRmInpEquip` and its `Reset()` in `adRmBtnEdit.OnSelect`.
- [ ] **Seeding (the trap):** collections have no `.Default`. Seed `colAdRmSystems` /
  `colAdRmEquip` explicitly in **both** `adRmBtnEdit.OnSelect` (from the selected room, split via
  `fnNormalizeTags`) and the Add button (empty). Both carry `// RESET-SITE[adrm-form]` and reset
  every registered var (**D4 — `pa-lint` L6 enforces completeness**).
- [ ] Extend both `Patch(Book_Rooms, …)` arms in `adRmBtnSave.OnSelect` with `Classification`,
  `Systems`, `RoomNotes`. Keep the `IfError` wrapper and the `ClearCollect(colRooms, …)` mirror
  exactly as they are — **BOOK-5 behaviour (form stays open on failure) must not regress.**
- [ ] Extend the capacity gate with an upper bound; **warn, do not block**, when capacity drops
  below the attendee count of a future booking on that room.
- [ ] Add `adRmLblRowClass_rf` / `adRmLblRowSystems_rf` to `adRmGalRooms` and widen the
  `CarbonSpan` header row to match.
- [ ] pa-lint → READY.

## Task 6: Rooms screen — facet rows and card re-layout

**Lane:** novel (ManualLayout re-derivation). **Files:** Modify `Rooms.pa.yaml`.

- [ ] Rebuild `conRoomsEquipmentFilters` as three vocabulary-driven rows (Classification /
  Systems / Equipment) and **set `Visible: =true` — fixing B-2, dead UI that still filters.**
- [ ] Delete the hardcoded `Table({Value: "Screen"}, …)` in `galRoomsEquipmentFilters.Items` and
  in `galRoomsCardEquipment.Items` — **B-3**; both bind to the vocabulary formulas.
- [ ] **Re-lay-out `con_tile_view` in one pass (Y9).** It is ManualLayout with fixed `Y` offsets;
  a badge row and a systems row mean re-deriving every `Y`, not appending. `TemplateSize` 216 →
  ~252. Badge colour comes from the vocabulary's **token name**, resolved through `AppTheme` —
  **DS1: no hex.**
- [ ] Add a note indicator when `RoomNotes` is non-blank.
- [ ] pa-lint → READY.

## Task 7: Find screen — vocabulary chips and room-column badge

**Lane:** pattern (mirrors T6 on the unified model). **Files:** Modify `Find.pa.yaml`.

- [ ] Replace the five hardcoded `btnFind*` equipment chips with vocabulary-driven galleries on
  the T4 model — **B-3**.
- [ ] Add the classification badge to the room-column HTML beside
  `"seats " & ThisItem.Capacity`. Use the **short code** (`OS`) — the column is width-constrained
  by `Timeline_RoomColPx`.
- [ ] pa-lint → READY. **Orchestrator publishes checkpoint 2 and commits (P4).**

## Task 8: Wizard picker and booking detail badges

**Lane:** batched. **Files:** Modify `Components/cpt_Modal_.pa.yaml`,
`Components/cpt_BookingDetailModal.pa.yaml`.

- [ ] Badge in the wizard room picker (`colRooms As _wzr`), so classification is visible
  **before** the booking is made rather than after.
- [ ] Badge on the detail modal's `" · seats " & _room.Capacity` line.
- [ ] Advisory banner at the confirm step, worded per **D5** as a prompt to the user's own
  judgement — *not* as a decision the app has made, and never phrased as authorisation.
- [ ] pa-lint → READY.

## Task 9: `IsActive` — retire a room without deleting it (D7)

**Lane:** pattern. **Files:** Modify `App.pa.yaml`, `Admin.pa.yaml`.

- [ ] Filter `IsActive` in `RoomsBrowseBase` and in the wizard picker source.
- [ ] **Do not filter it out of room-title lookups** — existing bookings on a retired room must
  still resolve their title, or historic rows render blank.
- [ ] Admin toggle + row styling for inactive rooms.
- [ ] pa-lint → READY.

## Task 10: Seeds, acceptance, docs

**Lane:** batched, mechanical. **Files:** `Src/App.pa.yaml` (mock seeds), `docs/`, `README.md`.

- [ ] Add hostile regression seeds (**D3**): a room with `Equipment = "AVC"` (permanent fixture
  for B-1), a room with blank `Classification`, an `IsActive = false` room, a room with a long
  `RoomNotes`. Each carries `// PROD-REVERT[id]` with a `docs/REVERT-CONTRACT.md` entry (**D5**).
- [ ] Run all six acceptance checks from spec §7 and record results as numbers.
- [ ] `sarif-diff` against the T1 baseline — **new issues block (P10)**.
- [ ] Record the verification rung: `guard.sh verified "rung N …"` (**P8** — an unrecorded rung is
  not a claim that can be made).
- [ ] **Open B-5 as its own tracked item** — `RoomID: Max(colRooms, RoomID) + 1` contradicts the
  documented `ID == RoomID` invariant. Deliberately not fixed here.
- [ ] **Orchestrator publishes checkpoint 3 and commits (P4/P5).**

---

## Deferred — deliberately not in this plan

| Item | Why deferred |
|---|---|
| **B-5** `RoomID` allocation vs its invariant | Data-integrity bug, unrelated to facilities; needs its own reasoning about existing rows |
| Real classification enforcement | Needs a clearance source + SharePoint item permissions (**D5**) — a security feature, not a UI one |
| Floor / building / location facet | Same machinery as this pass; add once the vocabulary pattern has shipped and proven |
| Room photos / floor-plan view | Depends on the `A2` floor-plan direction in `docs/reviews/20260731/opportunities.md` |
| Capacity-aware booking (attendee count on a booking) | Would make the capacity warning in T5 a real check rather than an advisory one; needs a `Book_Bookings` column |
