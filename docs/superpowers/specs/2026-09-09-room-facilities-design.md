# Room Properties & Facilities — Design

**Status:** proposed, awaiting Harry's approval.
**Date:** 2026-09-09.
**Basis:** git `0ea5e77` (`Src/`) + a live App Checker read at 2026-09-09. **No fresh
`sync_canvas` was possible** — see §9 Blockers. Every anchor below must be re-anchored.

**Goal.** Admins can set a room's **capacity**, **security classification**, **systems** and a
**public note**. Users can filter on those and see them on the card.

---

## 1. What exists today

`Book_Rooms` has six columns: `Title`, `RoomID`, `Capacity`, `description`, `Equipment`
(free text), `BookedBy`. Facilities are one comma-separated `Equipment` string.

Three surfaces read it, each carrying its own hardcoded copy of the tag vocabulary
(`Screen / VC / Whiteboard / Projector`):

| Surface | Control | Filter model |
|---|---|---|
| Rooms browse | `galRoomsEquipmentFilters`, `galRoomsCardEquipment` | `colRoomsEquipmentFilter`, **multi**-select |
| Find timeline | five `btnFind*` chips | `varFindEquipment`, **single**-select |
| Admin | `adRmInpEquip` | free-text input, no vocabulary at all |

Matching is substring: `varFindEquipment in Equipment` and
`Lower(_required.Value) in Lower(_room.Equipment)`.

## 2. Decisions

### D1 — Three new columns on `Book_Rooms`, all `Text`

| Column | Type | Holds |
|---|---|---|
| `Classification` | Text | one stable **code** (`OFF`, `OS`, `SEC`) — not the display label |
| `Systems` | Text | delimited tag list, human-readable (`MODNET; DVS`) |
| `RoomNotes` | Text (multi-line) | public note, shown to every user |

`Text` not `Choice`: the repo's `schema/*.json` and every mock seed (D1) model plain types,
`Equipment` is already Text, and SharePoint Choice columns force `.Value` unwrapping through
every `Filter`/`LookUp` in `RoomsBrowseBase`. Nothing here needs data-layer enforcement that the
vocabulary plus the admin UI do not already give.

`Capacity` needs no schema change — it is already a Number and already editable. Its work in this
spec is validation and display, not storage.

### D2 — Classification stores a code; the vocabulary owns the label

A room row holds `OS`. The vocabulary maps `OS` to label `Official-Sensitive`, rank `20`, colour
token `StatusBusy`. Renaming a level is then a settings edit, not a data migration across every
room. Storing the label directly would orphan every room on the first rename.

**Rank is the point.** Classification is ordered, so the filter means *"rooms rated at or above
what I need"* — `Rank >= selectedRank`, never equality. An equality filter would hide the SECRET
room from someone who asked for OFFICIAL, which is exactly backwards.

### D3 — Systems and Equipment canonicalise on **read**, not on write

Storage stays human-readable (`MODNET; DVS`). `RoomsBrowseBase` — which already reshapes every
room once per evaluation — gains two derived keys:

```
SystemsKey:   ";" & Lower(fnNormalizeTags(_room.Systems))   & ";",
EquipmentKey: ";" & Lower(fnNormalizeTags(_room.Equipment)) & ";",
```

and matching becomes an exact, bounded-token test:

```
fnHasTag(key:Text, tag:Text):Boolean = ";" & Lower(Trim(tag)) & ";" in key;
```

This kills the substring bug (§3 B-1) with no data migration and without making the SharePoint
list unreadable to a human. `fnNormalizeTags` accepts both `,` and `;`, so legacy rows keep
working untouched.

### D4 — Vocabularies live in `Book_AppSettings`, with defaults in code

Multi-row keys, exactly the `AdminEmailList` pattern
(`Filter(colAppSettings, Title = "AdminEmail")`). `Value` is pipe-delimited:

| `Title` | `Value` | Fields |
|---|---|---|
| `Classification` | `OS\|Official-Sensitive\|20\|StatusBusy` | code, label, rank, **theme token** |
| `SystemTag` | `MODNET\|MODNET` | code, label |
| `EquipmentTag` | `SCR\|Screen` | code, label |

The fourth field is a **theme token name, never a hex literal** — DS1 forbids raw hex outside the
token block, and a settings row is outside it by definition.

Empty settings fall back to a `Table(...)` default in `App.Formulas`, mirroring
`SettingNumber("DayStartHour", 8)`. The feature therefore works the moment it ships, before an
admin has configured anything.

### D5 — Classification is **advisory**, and the spec says so out loud

The badge, the filter and the confirm-step banner are an aid to the person booking. They are
**not** access control:

- the app holds no clearance data for any user;
- `IsAdmin` is a UI-level gate only (stated in the 2026-08-03 spec) — anyone who can reach the
  data source can reach every row;
- SharePoint item-level permissions are not in play.

Real enforcement needs a clearance source (Entra group or HR feed) **and** list-level
permissions. That is separate work and must not be implied by this pass. The banner is worded as
a prompt to the user's own judgement, never as a decision the app has made.

### D6 — Unify the Find and Rooms filter models first

Find is single-select on `varFindEquipment`; Rooms is multi-select on
`colRoomsEquipmentFilter`. Adding two more facets to both, in both shapes, doubles a surface that
is already the source of the divergence. **Collapse to one model before adding facets:**

```
colRoomFacetSystems     // multi-select codes
colRoomFacetEquipment   // multi-select codes
gblRoomMinClassRank     // 0 = any
gblRoomsMinCapacity     // exists already
```

read by one named formula that both screens consume. This is a prerequisite task, not a
nice-to-have — it is what stops the feature costing twice.

### D7 — Also add `IsActive` (Yes/No, default true)

Not asked for, and I am flagging it rather than assuming it: **there is currently no way to
retire a room.** `Admin.pa.yaml` contains no `Remove`/`RemoveIf` at all, and deleting the
SharePoint row would orphan every booking whose `RoomID` lookup points at it. A room being
refurbished cannot be hidden today. One boolean plus one predicate in `RoomsBrowseBase` fixes it,
and it belongs in this pass because it is the same admin form and the same read model.

## 3. Defects this pass should fix

- **B-1 · substring facility matching.** `varFindEquipment in Equipment` matches "VC" against a
  room whose equipment reads "AVC" or "VCR". Fixed by D3.
- **B-2 · dead filter UI on Rooms.** `conRoomsEquipmentFilters` is `Visible: =false`, yet
  `colRoomsEquipmentFilter` still filters `RoomsBrowseData`. The filter exists with no way to
  reach it. Fixed by rebuilding the row.
- **B-3 · vocabulary triplicated.** `Screen/VC/Whiteboard/Projector` is hardcoded in
  `galRoomsEquipmentFilters.Items`, `galRoomsCardEquipment.Items` and five Find chips. Adding a
  tag today means three or more edits. Fixed by D4.
- **B-4 · "Clear filters" does not clear favourites.** `btnRoomsClearFilters.OnSelect` resets
  search, capacity, sort, availability and `colRoomsEquipmentFilter` — but not `gblRoomsFavOnly`.
  `Rooms.OnVisible` resets the same four and likewise skips it. A user can land on
  `conRoomsEmptyState` with Favourites active and find Clear filters does nothing.
- **B-5 · `RoomID` allocation contradicts its own invariant.** `schema/Book_Rooms.json` asserts
  *"SharePoint item ID == RoomID for all rows"*, but `adRmBtnSave.OnSelect` writes
  `RoomID: Max(colRooms, RoomID) + 1` from a client snapshot. SharePoint assigns `ID`
  independently, so the two diverge permanently after the first deleted row, and two admins
  adding rooms concurrently mint duplicate `RoomID`s. Bookings resolve rooms by `RoomID.Id`, so
  this is data integrity, not cosmetics. **Scope call: diagnosed here, fixed in its own change.**
  It is not a facilities problem and deserves its own reasoning.

## 4. Admin editing

`adRmConForm` gains, between `adRmInpCap` and `adRmInpDesc`:

- **Classification** — `Classic/DropDown` over `ClassificationLevels`. Y3 bars `Classic/ComboBox`
  via YAML; `Classic/DropDown` is already proven here (`asDrpDayStart`, `drpRoomsCapacity`).
- **Systems** — chip gallery over `SystemTags`, backed by `colAdRmSystems`.
- **Equipment** — chip gallery over `EquipmentTags`, backed by `colAdRmEquip`, replacing the
  free-text `adRmInpEquip`.
- **Notes** — `Classic/TextInput` with `Mode: =TextMode.MultiLine`.

**Seeding is the trap.** Today the form loads a room through control `.Default` plus
`Reset(...)` in `adRmBtnEdit.OnSelect`. Collections have no `.Default`, so the Edit button and
the Add button must each seed `colAdRmSystems` / `colAdRmEquip` explicitly. Both are D4
reset-sites and carry `// RESET-SITE[adrm-form]` naming every registered var.

Capacity validation extends the existing gate with a sane upper bound, and warns — does not
block — when capacity is reduced below the attendee count of any future booking on that room.

## 5. Display

| Surface | Control | Add |
|---|---|---|
| Rooms card | `con_tile_view` | classification badge top-left; systems tags beside equipment tags; note indicator |
| Find timeline | room column HTML in the `_rows` `With(...)` | badge + systems on the `"seats " & ThisItem.Capacity` line |
| Wizard picker | `cpt_Modal_`, `colRooms As _wzr` | badge, so classification is visible **before** booking |
| Booking detail | `cpt_BookingDetailModal`, `" · seats " & _room.Capacity` | badge |

`con_tile_view` is `ManualLayout` with fixed `Y` offsets and `TemplateSize: =216`. Adding a badge
row and a systems row means re-laying-out the whole tile, not appending to it — Y9 applies.
Budget `TemplateSize` 216 → ~252 and re-derive every `Y` in one pass, once.

The Find room column is width-constrained by `Timeline_RoomColPx`, so the badge goes there as the
short code (`OS`), with the full label reserved for the card and detail views.

## 6. Non-goals

- Any access enforcement, per D5.
- Per-user clearance, booking approval workflows, or classification on the *booking*.
- Floor / building / location columns — a reasonable next facet, deliberately out of this pass.
- Fixing B-5. Diagnosed here, fixed separately.

## 7. Acceptance — sharp numbers (RULES D3)

1. A room with `Equipment = "AVC"` is **not** returned by a `VC` filter on either screen.
2. Adding a `SystemTag` row in Admin > Settings makes the chip appear on Rooms **and** Find
   **and** the Admin room form, with no code change and no publish.
3. Filtering classification at `Official` returns rooms rated `Official`, `Official-Sensitive`
   **and** `Secret` — 3 of 3 in the seed, not 1.
4. `btnRoomsClearFilters` from the empty state with Favourites active returns the full list.
5. An `IsActive = false` room disappears from Rooms, Find and the wizard picker, and its existing
   bookings still resolve their room title.
6. pa-lint clean; App Checker count does not rise above the baseline established in T1.

## 8. Vocabulary seed

| Code | Label | Rank | Token |
|---|---|---|---|
| `OFF` | Official | 10 | `StatusFree` |
| `OS` | Official-Sensitive | 20 | `StatusBusy` |
| `SEC` | Secret | 30 | `StatusBusy` |

Systems: `MODNET`, `DVS`, `VTC`, `STANDALONE`.
Equipment: `Screen`, `Whiteboard`, `Projector`, `VC`.

Ranks are spaced by 10 so a level can be inserted between two without renumbering.
**Harry to confirm the real level names and system names before T2** — these are placeholders
chosen to make the shape concrete, not a recommendation about terminology.

## 9. Blockers — status at 2026-09-09 21:33

1. ~~`sync_canvas` and `get_data_source_schema` error.~~ **CLEARED — operator error, not a broken
   session.** Both tools take **camelCase** parameters (`directoryPath`, `dataSourceName`); they
   were being called with snake_case. See §10 — this is worth a CLAUDE.md correction, because
   CLAUDE.md's connect note ("parameters are **snake_case**") is true of `connect` and false of
   these two, and reading it as a general rule is what caused the failure.
   Fresh sync at 21:33 → 16 files into `.scratch/rf-20260909-2130`. Anchors in this spec are
   confirmed against it.
2. **The app ID has changed.** Live is `a5fe0780-88fa-4bc5-9e55-5a2e9850ecda`; every plan and
   `docs/APP-CHECKER-BASELINE.md` still name `498d4962-0b5f-4990-a400-1bf5de9a367c`. Task 0 of
   every existing plan connects to the wrong app. **Still open.**
3. **App Checker has drifted and P10 is still unenforced.** 15 issues at Phase 0 (2026-07-30),
   **19 today**, and `docs/APP-CHECKER-BASELINE.md` still reads "NOT YET ESTABLISHED". This pass
   adds `Book_AppSettings` reads, which draw the same `CollectDelegatableDataSource` finding.
   Establish the baseline in T1 or the count keeps climbing unnoticed. **Still open.**
4. **Uncommitted server drift in `AdminPermanentNew.pa.yaml`** — 16 lines, live vs git: the
   `adRecHtxHint` HtmlViewer was deleted in Studio, `FillPortions: =0` dropped from its parent,
   `AutoHeight: =true` added to `adRecHtxPreview`. Live is truth; git is behind. **P5 reconcile
   owed before any branch is cut.** Every other file is byte-identical.

## 10. Live facts confirmed at 2026-09-09 21:33

- **`Book_Rooms` live schema** (`get_data_source_schema`): 29 columns, of which **six are real** —
  `Title` String, `RoomID` Number, `Capacity` Number, `description` String, `Equipment` String,
  `BookedBy` Record. The rest are SharePoint system columns. **No `Classification`, `Systems`,
  `RoomNotes` or `IsActive` exists** — D1 is a genuine schema addition, not a rename.
- **Live app:** `MOC_Booking_Tool_Production`, coauthoring **On**, 6 rooms (Boardroom, Meeting
  Room A, Meeting Room B, Huddle Space 1, Huddle Space 2, Training Room).
- **MCP parameter casing (gotcha).** `connect` takes snake_case (`environment_id`, `app_id`,
  `cluster_category`); `sync_canvas` takes `directoryPath` and `get_data_source_schema` takes
  `dataSourceName`, both camelCase. The repo's own hook config in `.claude/settings.json` already
  encodes the camelCase form — it is the authority when prose and schema disagree. **Read the
  tool schema per tool, never generalise one tool's casing to another.**
