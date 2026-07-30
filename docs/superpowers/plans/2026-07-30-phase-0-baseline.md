# Phase 0 — New Baseline (mock → real data sources) Implementation Plan

> **For agentic workers:** Execution follows the project's `orchestrator-coding` skill and
> `docs/PUBLISHING-PROTOCOL.md` (CLAUDE.md overrides the generic superpowers executors for this
> repo). Workers edit + lint, never compile, never commit (O1). One publisher session holds
> `guard.sh lock`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Phase 0 the app runs against the real SharePoint lists on
`https://hbbaby.sharepoint.com/sites/booking-tool` for rooms and bookings — every implemented
feature (browse, find, book incl. recurring, edit, cancel, privacy masking, profile settings,
book-on-behalf) works end-to-end, with 6 rooms and a realistic week of bookings seeded.

**Descoped by user (2026-07-30):** `Book_UserSettings` and `Office365Users` are NOT wired in
Phase 0. Profile settings and the people picker stay spoofed by local collections (D2) —
session-scoped settings persistence is accepted. The one knock-on that IS in scope: mock-person
claims don't resolve in this tenant, so `BookedBy` person writes must use the actor (see
`booked-by-actor` below) or every book-on-behalf Patch errors.

**Architecture:** Reads already flow `Book_Rooms`/`Book_Bookings` → snapshot collections
(`colRooms`/`colBookings`) at `App.OnStart`; the Home create path is already prod-form. Phase 0
converts the remaining booking write sites (Find/Rooms create, bookingDetail cancel/edit) from
local-collection writes to `Patch(Book_Bookings, …)` + `Refresh` + re-collect, hardens the
`BookedBy` claims at all three create sites, deletes the two dead mock seed tables, and seeds
the lists.

**Tech stack:** Power Apps canvas YAML via canvas-authoring MCP; CLI for Microsoft 365 v11.10.0
(`C:\Users\harry\AppData\Roaming\npm\m365.cmd`, logged in via appId
`176f5f46-c081-49de-af9a-1a49200295a1`); repo tools `pa-lint`, `pa-schema-validate`,
`prod-revert`, `canvas-guard`, `sarif-diff`.

**Rules cited, not restated** (docs/RULES.md): P1–P10, Y1–Y8, D1–D5, O1–O3.

**Known facts this plan anchors on** (fresh sync 2026-07-30 17:0x, scratch
`…/scratchpad/app-498d4962-postwire`, byte-identical to committed `Src/`):

- Data sources connected: `Book_Bookings`, `Book_Rooms` only. `Book_UserSettings` and
  `Office365Users` stay absent by decision — no YAML may reference them in Phase 0 (it would
  not compile).
- The 7 `PROD-REVERT` markers are **bare** (`PROD-REVERT:` no `[id]`) so `revert-check` cannot
  match them; `docs/REVERT-CONTRACT.md` is still the unfilled template (D5 gap).
- `schema/` contains only a README — D1 snapshots never taken.
- SharePoint replica lists exist, empty. `Book_Bookings.RoomID` is a lookup to
  `Book_Rooms.RoomID` (Number) projecting `Title`. **The app patches the lookup with
  `{Id: RoomIdNumber}` — SharePoint item IDs of the 6 room rows MUST equal their RoomID values
  1–6.** Fresh empty list ⇒ create in order, verify (Task 2).
- Book-on-behalf writes `BookedBy` person claims from the picked person. Mock example.com people
  are unresolvable in this tenant ⇒ every book-for-other Patch would error. Fix (`booked-by-actor`):
  claims always resolve to the current user; `BookedByEmail` keeps carrying the picked person, so
  ownership/privacy logic is unaffected. Marked for revert once Office365Users is wired.

---

## Open decision (made, flag if you disagree)

- **People picker**: keep the existing `drpBookFor` DropDown over `MockPeopleSeed` — untouched in
  Phase 0 (user descope). The Studio ComboBox swap noted in the old comment is dropped from scope.
- **Seed dates**: "the real week" = Mon 2026-07-27 → Fri 2026-07-31 (today is Thu 30th), plus two
  next-week rows so *Upcoming* isn't empty over the weekend.

---

### Task 1: D1 schema snapshots + contract normalization (git only, no app changes)

**Files:**
- Create: `schema/Book_Rooms.json`, `schema/Book_Bookings.json`, `schema/Book_UserSettings.json`
- Modify: `docs/REVERT-CONTRACT.md` (replace template with real entries)

- [ ] **Step 1.1: Write the three schema snapshots** (from `get_data_source_schema` + the replica
  list DDL; custom columns only, internal names):

`schema/Book_Rooms.json`:
```json
{
  "list": "Book_Rooms",
  "site": "https://hbbaby.sharepoint.com/sites/booking-tool",
  "columns": {
    "Title": "Text",
    "RoomID": "Number",
    "Capacity": "Number",
    "description": "Text",
    "Equipment": "Text",
    "BookedBy": "Person"
  },
  "invariant": "SharePoint item ID == RoomID for all rows (app patches lookup {Id: RoomIdNumber})"
}
```

`schema/Book_Bookings.json`:
```json
{
  "list": "Book_Bookings",
  "site": "https://hbbaby.sharepoint.com/sites/booking-tool",
  "columns": {
    "Title": "Text",
    "BookedByEmail": "Text (always lowercase)",
    "StartDateTime": "DateTime",
    "EndDateTime": "DateTime",
    "Status": "Text ('Active' | 'Cancelled')",
    "isPrivate": "Boolean (display name IsPrivate)",
    "BookedBy": "Person",
    "RoomID": "Lookup -> Book_Rooms.RoomID (Number), .Value is the number as text",
    "RoomID_x003a__x0020_Title": "Projected lookup (display 'RoomID: Title'), read-only — never Patch it"
  }
}
```

`schema/Book_UserSettings.json`:
```json
{
  "list": "Book_UserSettings",
  "site": "https://hbbaby.sharepoint.com/sites/booking-tool",
  "columns": {
    "Title": "Text (mirror of Email)",
    "Email": "Text (always lowercase, unique per user)",
    "NotifyConfirm": "Boolean",
    "NotifyCancel": "Boolean",
    "NotifyReminder": "Boolean",
    "NotifyDigest": "Boolean",
    "ReminderMinutes": "Number (15|30|60)"
  }
}
```

- [ ] **Step 1.2: Rewrite `docs/REVERT-CONTRACT.md` entries.** Replace the `example-reads-rooms`
  template entry with these six real entries (a seventh, `people-picker-mock`, is added by Task
  4.2; markers get `[id]`s in Tasks 4–8; the checker matches `dev`/`prod` patterns within 30
  lines after each marker):

````markdown
### booking-create-find

Find screen series create: dev Collects into colBookings with minted IDs; prod Patches Book_Bookings and lets SharePoint assign IDs.

```dev
Collect(
                                  colBookings,
```

```prod
Patch(
                                  Book_Bookings,
```

### booking-create-rooms

Rooms screen create: same dev/prod shapes as booking-create-find.

```dev
Collect(
                                  colBookings,
```

```prod
Patch(
                                  Book_Bookings,
```

### booking-cancel

Soft-delete: dev patches colBookings Status; prod patches Book_Bookings (Remove() retired per WS4).

```dev
Patch(colBookings, LookUp(colBookings, ID = gblSelectedBooking.ID), {Status: "Cancelled"})
```

```prod
Patch(Book_Bookings, LookUp(Book_Bookings, ID = gblSelectedBooking.ID), {Status: "Cancelled"})
```

### booking-edit

Edit: dev patches colBookings (incl. projected 'RoomID: Title'); prod patches Book_Bookings without the projected column.

```dev
Patch(
                                  colBookings,
```

```prod
Patch(
                                  Book_Bookings,
```

### user-settings-writes

Profile settings: dev patches colUserSettings (STAYS in Phase 0 by decision); prod patches Book_UserSettings once that data source is wired (all five setting rows follow the marked NotifyConfirm site's pattern).

```dev
Patch(colUserSettings,
```

```prod
Patch(Book_UserSettings,
```

### booked-by-actor

Create paths (Home/Find/Rooms): dev/mock-people era writes BookedBy claims from the picked person, which errors on unresolvable mock users; Phase 0 form writes the actor's claims (BookedByEmail still carries the picked person). Prod form returns with Office365Users.

```dev
Claims: $"i:0#.f|membership|{Lower(User().Email)}",
```

```prod
Claims: $"i:0#.f|membership|{If(IsBlank(varBookForEmail), Lower(User().Email), varBookForEmail)}",
```

(Note: dev/prod are inverted-looking here because the "dev" form is the safe Phase 0 form; the
contract records the intended end state.)
````

- [ ] **Step 1.3: Fill the Manual steps section** of the contract (replace the `<e.g. …>`
  placeholders):

```markdown
- [ ] MS1 (DEFERRED post-Phase-0): Add the Book_UserSettings SharePoint data source in Studio
      (site https://hbbaby.sharepoint.com/sites/booking-tool), then revert user-settings-writes.
- [ ] MS2 (DEFERRED post-Phase-0): Add the Office365Users connection in Studio, then revert
      booked-by-actor and repoint colPeople.
- [ ] MS3: SharePoint lists provisioned + seeded per schema/*.json — 6 rooms with item ID ==
      RoomID, 18 bookings. (2026-07-30 via m365 CLI.)
- [ ] MS4: Verify site regional settings: timezone UTC, and app times render correctly in Studio
      preview.
```

- [ ] **Step 1.4: Commit** (P9 format):

```bash
git add schema/ docs/REVERT-CONTRACT.md
git commit -m "docs(contract): real revert entries + D1 schema snapshots (D1,D5)"
```

---

### Task 2: Seed the SharePoint lists (no app changes)

**Tool:** `$m365 = "C:\Users\harry\AppData\Roaming\npm\m365.cmd"`,
`$site = "https://hbbaby.sharepoint.com/sites/booking-tool"`. Already authenticated.

- [ ] **Step 2.1: Verify site timezone (MS4)**

```powershell
& $m365 request --url "$site/_api/web/regionalsettings/timezone" --output json
```
Expected: `"Id": 13` (UTC) or GMT London. If not UTC, set it:
```powershell
& $m365 request --method post --url "$site/_api/web/regionalsettings/timezone" --body '{ "Id": 13 }' --content-type "application/json"
```
Record the before/after as MS4 evidence in the contract.

- [ ] **Step 2.2: Probe one room row, verify field round-trip**

```powershell
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Boardroom" --RoomID 1 --Capacity 14 --description "Large boardroom · seats 14 · screen + VC" --Equipment "Screen;VC" --output json
```
Expected: created item with `Id: 1`. Then confirm values:
```powershell
& $m365 spo listitem get --webUrl $site --listTitle Book_Rooms --id 1 --properties "Id,Title,RoomID,Capacity,description,Equipment" --output json
```
**If Id ≠ 1 or fields didn't stick: STOP, delete all rows, diagnose before bulk.** (Item-ID
alignment is load-bearing — see header invariant.)

- [ ] **Step 2.3: Seed the remaining 5 rooms in this exact order** (IDs must come out 2–6):

```powershell
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Meeting Room A" --RoomID 2 --Capacity 8 --description "Meeting room · seats 8 · screen" --Equipment "Screen"
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Meeting Room B" --RoomID 3 --Capacity 8 --description "Meeting room · seats 8 · whiteboard" --Equipment "Whiteboard"
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Huddle Space 1" --RoomID 4 --Capacity 4 --description "Huddle space · seats 4" --Equipment ""
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Huddle Space 2" --RoomID 5 --Capacity 4 --description "Huddle space · seats 4" --Equipment ""
& $m365 spo listitem add --webUrl $site --listTitle Book_Rooms --Title "Training Room" --RoomID 6 --Capacity 20 --description "Training room · seats 20 · projector" --Equipment "Projector"
```
Verify alignment:
```powershell
& $m365 spo listitem list --webUrl $site --listTitle Book_Rooms --fields "Id,RoomID,Title" --output json
```
Expected: 6 rows, `Id == RoomID` on every row.

- [ ] **Step 2.4: Probe one booking row** (lookup + person + dates + boolean in one go):

```powershell
& $m365 spo listitem add --webUrl $site --listTitle Book_Bookings --Title "Team Standup" --BookedByEmail "harry@harry-burton.ai" --Status "Active" --isPrivate "false" --RoomID 1 --StartDateTime "2026-07-27T09:00:00Z" --EndDateTime "2026-07-27T09:30:00Z" --BookedBy '[{"Key":"i:0#.f|membership|harry@harry-burton.ai"}]' --output json
```
Then `listitem get --id 1 --properties "Title,RoomID,StartDateTime,isPrivate,BookedBy"` and check:
lookup shows `{Id:1, Value:"1"}`-shaped, person resolved, times not shifted. **Fix syntax here
before bulk** (ValidateUpdateListItem is picky; booleans may need `"1"`/`"0"`, person may need
`-1;#i:0#.f|membership|…` — adjust on the probe, not on 17 rows).

- [ ] **Step 2.5: Seed the remaining 17 bookings.** Rows (all times UTC; `BookedBy` person set
  only on harry's rows — example.com users don't resolve; their rows get person left unset):

| # | Title | Room | Start | End | BookedByEmail | Status | isPrivate |
|---|---|---|---|---|---|---|---|
| 2 | Team Standup | 1 | 07-28 09:00 | 09:30 | harry@harry-burton.ai | Active | false |
| 3 | Team Standup | 1 | 07-29 09:00 | 09:30 | harry@harry-burton.ai | Active | false |
| 4 | Team Standup | 1 | 07-30 09:00 | 09:30 | harry@harry-burton.ai | Active | false |
| 5 | Team Standup | 1 | 07-31 09:00 | 09:30 | harry@harry-burton.ai | Active | false |
| 6 | Marketing Sync | 2 | 07-27 10:00 | 11:00 | alex.morgan@example.com | Active | false |
| 7 | Training: Onboarding | 6 | 07-28 09:00 | 12:00 | priya.shah@example.com | Active | false |
| 8 | Design Review | 3 | 07-28 13:00 | 14:30 | priya.shah@example.com | Active | false |
| 9 | All Hands | 6 | 07-29 15:00 | 16:00 | alex.morgan@example.com | Active | false |
| 10 | Sprint Planning | 1 | 07-30 10:00 | 11:30 | harry@harry-burton.ai | Active | false |
| 11 | Budget Review | 2 | 07-30 11:00 | 12:00 | alex.morgan@example.com | Active | false |
| 12 | 1:1 (private) | 4 | 07-30 15:00 | 15:30 | sam.patel@example.com | Active | **true** |
| 13 | Cancelled clash | 1 | 07-30 09:00 | 09:30 | sam.patel@example.com | **Cancelled** | false |
| 14 | Interview Loop | 3 | 07-31 10:00 | 12:00 | sam.lee@example.com | Active | false |
| 15 | Client Demo | 2 | 07-31 14:00 | 15:00 | harry@harry-burton.ai | Active | false |
| 16 | Board Prep | 1 | 07-31 16:00 | 17:30 | alex.morgan@example.com | Active | false |
| 17 | Kickoff | 6 | 08-03 10:00 | 12:00 | harry@harry-burton.ai | Active | false |
| 18 | Roadmap Review | 1 | 08-04 11:00 | 12:00 | priya.shah@example.com | Active | false |

Rows 12 and 13 are the hostile regression fixtures (D3): private-other-owner masking, and a
cancelled row overlapping row 4's slot that must neither render nor block.

- [ ] **Step 2.6: Record acceptance numbers** (used in Task 10 verification):
  - rooms = **6**; bookings = **18** (17 Active, 1 Cancelled)
  - Active today (Thu 07-30) = **4** (rows 4, 10, 11, 12)
  - Boardroom occupancy today = (30 + 90) / 600 = **20%**
  - harry's Active bookings ("All" tab) = **8** (5 standups + Sprint Planning + Client Demo + Kickoff)

---

### Task 3: DESCOPED (was: add Book_UserSettings + Office365Users in Studio)

Deferred post-Phase-0 by user decision — see MS1/MS2 in the contract. No Studio step, no
re-baseline needed; edits anchor on the `app-498d4962-postwire` sync.

---

### Task 4: App.pa.yaml — dead mock-table cleanup only

**Files:** Modify scratch `App.pa.yaml` (anchor: quoted code below, not line numbers — O3)

`OnStart` is untouched: `colUserSettings`/`colPeople` stay collection-spoofed (descope, D2), and
`ClearCollect(colRooms, Book_Rooms); ClearCollect(colBookings, Book_Bookings);` is already live.

- [ ] **Step 4.1:** In `Formulas`, delete ONLY the two dead tables `MockRoomsSeed` and
  `MockBookingsSeed` (nothing references them — `colRooms`/`colBookings` collect from the real
  lists). `MockUserSettingsSeed` and `MockPeopleSeed` MUST stay (OnStart consumes them). Each
  table is one `Name = Table( … );` statement inside the
  `//--- Sandbox mock data (mirrors Book_Rooms/Book_Bookings) ---` block; keep the block and its
  end marker, since the two surviving seeds remain inside it.
- [ ] **Step 4.2:** In the surviving `MockPeopleSeed` comment, replace
  `PROD-REVERT: drpBookFor is replaced in Studio by a ComboBox wired` (and the rest of that
  sentence) with `PROD-REVERT[people-picker-mock] mock people until Office365Users is wired;` —
  bare-marker normalization, behaviour unchanged. Add matching contract entry:

````markdown
### people-picker-mock

Book-for picker: dev feeds drpBookFor from MockPeopleSeed; prod feeds colPeople from Office365Users.SearchUserV2 (deferred with MS2).

```dev
MockPeopleSeed = Table(
```

```prod
Office365Users.SearchUserV2(
```
````

- [ ] **Step 4.3:** Worker lint: `node tools/pa-lint/lint.js --src <scratch>` → expect clean
  (L2: every remaining global still has its Set site; L4: surviving seeds unchanged).

---

### Task 5: Find + Rooms OnSubmit → Patch (markers `booking-create-find` / `booking-create-rooms`)

**Files:** Modify scratch `Find.pa.yaml` (control `cpt_Modal__book_find`) and `Rooms.pa.yaml`
(control `cpt_Modal__book_rooms`) — the two OnSubmit blocks are line-identical apart from the
component name; apply the same three edits to each.

- [ ] **Step 5.1:** Delete the ID-minting preamble (both files):

```
/* Snapshot the max ID once: Max() inside the ForAll re-reads a collection
                     that has not yet settled, so a multi-week series can mint duplicate IDs.
                     SANDBOX ONLY - vanishes on revert to Patch(), which lets SharePoint assign IDs. */
                  Set(varSeriesBaseId, Max(colBookings, ID));
```

- [ ] **Step 5.2:** Replace the sandbox Collect (both files) — from `Collect(` through the
  closing of the BookedBy record — with the Patch form. Before (abridged anchor — the full block
  starts `IfError(\n Collect(\n colBookings,\n {\n ID: varSeriesBaseId + _occ.OccIndex,`):

```
IfError(
                              Collect(
                                  colBookings,
                                  {
                                      ID: varSeriesBaseId + _occ.OccIndex,
                                      Title: _occ.Title,
                                      …
                                      'RoomID: Title': { Id: _occ.RoomIdNumber, Value: _occ.RoomTitle },
                                      …
                                  }
                              ),
```

After (drop `ID:` and `'RoomID: Title':` — SharePoint assigns/projects both; everything else
verbatim from the current block):

```
IfError(
                              Patch(
                                  Book_Bookings,
                                  Defaults(Book_Bookings),
                                  {
                                      Title: _occ.Title,
                                      BookedByEmail: _occ.BookedByEmail,
                                      RoomID: {
                                          Id: _occ.RoomIdNumber,
                                          Value: _occ.RoomIdText
                                      },
                                      StartDateTime: _occ.StartDateTime,
                                      EndDateTime: _occ.EndDateTime,
                                      Status: "Active",
                                      IsPrivate: _occ.IsPrivate,
                                      /* PROD-REVERT[booked-by-actor] person = actor; mock claims don't resolve */
                                      BookedBy: {
                                          '@odata.type': "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
                                          Claims: $"i:0#.f|membership|{Lower(User().Email)}",
                                          DisplayName: User().FullName,
                                          Email: Lower(User().Email),
                                          Department: "",
                                          JobTitle: "",
                                          Picture: ""
                                      }
                                  }
                              ),
```

(Note the `BookedBy` block: actor claims, not the picked person — `BookedByEmail` above it still
carries `_occ.BookedByEmail`. This is the `booked-by-actor` contract site.)

- [ ] **Step 5.3:** Replace the marker line (both files):

```
/* PROD-REVERT: reinstate Refresh(Book_Bookings) here per MOCK_DATA.md */
```

with:

```
/* PROD-REVERT[booking-create-find] SharePoint round-trip after series create */
                  Refresh(Book_Bookings);
                  ClearCollect(colBookings, Book_Bookings);
```

(`[booking-create-rooms]` in `Rooms.pa.yaml`.)

- [ ] **Step 5.4:** In `cpt_Modal_.pa.yaml`, update the stale comment on `PatchPayload` —
  replace `mint sequential mock IDs (SANDBOX ONLY - see PROD-REVERT in the host handler). */`
  with `the host Patches Book_Bookings; OccIndex orders the occurrences. */`. `OccIndex` itself
  stays (harmless, still orders payload rows).
- [ ] **Step 5.5:** Worker lint → clean; report READY with `LINT: clean` (O1).

---

### Task 6: bookingDetail cancel + edit (markers `booking-cancel` / `booking-edit`)

**Files:** Modify scratch `bookingDetail.pa.yaml`

- [ ] **Step 6.1:** `btnConfirmCancel.OnSelect` — replace the whole formula with:

```
=/* PROD-REVERT[booking-cancel] soft delete via Patch; Remove() retired per WS4 */
IfError(
    Patch(Book_Bookings, LookUp(Book_Bookings, ID = gblSelectedBooking.ID), {Status: "Cancelled"}),
    Notify("Couldn't cancel this booking. Please try again.", NotificationType.Error),
    Refresh(Book_Bookings);
    ClearCollect(colBookings, Book_Bookings);
    Set(gblSelectedBooking, Blank());
    Notify("Booking cancelled", NotificationType.Success);
    Navigate(myBookings, ScreenTransition.Fade)
)
```

- [ ] **Step 6.2:** `cpt_Modal__book_detail.OnSubmitEdit` — inside the inner `IfError`, replace:

```
Patch(
                                  colBookings,
                                  LookUp(colBookings, ID = gblEditingBookingID),
                                  {
                                      Title: _occ.Title,
                                      RoomID: {Id: _occ.RoomIdNumber, Value: _occ.RoomIdText},
                                      'RoomID: Title': {Id: _occ.RoomIdNumber, Value: _occ.RoomTitle},
                                      StartDateTime: _occ.StartDateTime,
                                      EndDateTime: _occ.EndDateTime
                                  }
                              ),
                              Notify("Couldn't update this booking. Please try again.", NotificationType.Error),
                              Notify("Booking updated", NotificationType.Success)
```

with (projected column dropped — read-only in SharePoint; refresh added on success):

```
Patch(
                                  Book_Bookings,
                                  LookUp(Book_Bookings, ID = gblEditingBookingID),
                                  {
                                      Title: _occ.Title,
                                      RoomID: {Id: _occ.RoomIdNumber, Value: _occ.RoomIdText},
                                      StartDateTime: _occ.StartDateTime,
                                      EndDateTime: _occ.EndDateTime
                                  }
                              ),
                              Notify("Couldn't update this booking. Please try again.", NotificationType.Error),
                              Refresh(Book_Bookings);
                              ClearCollect(colBookings, Book_Bookings);
                              Notify("Booking updated", NotificationType.Success)
```

- [ ] **Step 6.3:** Replace the marker comment below that block —
  `/* PROD-REVERT: Patch(Book_Bookings, LookUp(Book_Bookings, ID = gblEditingBookingID), {...}) per MOCK_DATA.md */`
  → `/* PROD-REVERT[booking-edit] prod form: Patch(Book_Bookings, …) above */`. The existing tail
  (`Set(gblSelectedBooking, LookUp(colBookings, ID = gblEditingBookingID)); …`) stays — it now
  reads the refreshed collection. Update the cancel marker similarly (6.1 already embeds it).
- [ ] **Step 6.4:** Worker lint → clean.

---

### Task 7: Profile settings — marker normalization only (writes stay on colUserSettings)

**Files:** Modify scratch `Profile.pa.yaml` — one comment line. The five write sites are
DESCOPED (user decision): they keep patching `colUserSettings` (session-scoped persistence,
accepted).

- [ ] **Step 7.1:** In `tglSetNotifyConfirm.OnCheck`, replace the bare marker line
  `/* PROD-REVERT: Patch(Book_UserSettings, ...) per MOCK_DATA.md */` with
  `/* PROD-REVERT[user-settings-writes] colUserSettings until Book_UserSettings is wired (MS1) */`.
  No other change.
- [ ] **Step 7.2:** Worker lint → clean.

---

### Task 8: Home create path — `booked-by-actor` + the `//FIX THE WRAPPING` note

**Files:** Modify scratch `Home.pa.yaml` (`cpt_Modal__book.OnSubmit`)

- [ ] **Step 8.0:** Apply the `booked-by-actor` claims hardening here too. Replace (inside the
  `Patch(Book_Bookings, Defaults(Book_Bookings), {…})` record):

```
BookedBy: {
                            '@odata.type': "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
                            Claims: $"i:0#.f|membership|{If(
                                IsBlank(varBookForEmail),
                                Lower(User().Email),
                                varBookForEmail
                            )}",
                            DisplayName: If(
                                IsBlank(varBookForEmail),
                                User().FullName,
                                varBookForName
                            ),
                            Email: If(
                                IsBlank(varBookForEmail),
                                Lower(User().Email),
                                varBookForEmail
                            ),
```

with:

```
/* PROD-REVERT[booked-by-actor] person = actor; mock claims don't resolve */
                        BookedBy: {
                            '@odata.type': "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
                            Claims: $"i:0#.f|membership|{Lower(User().Email)}",
                            DisplayName: User().FullName,
                            Email: Lower(User().Email),
```

(Home's OnSubmit is a flow-scalar YAML string — the worker must keep the `\n` escaping intact or
convert the property to a block scalar per Y1 if it touches `: ` sequences. Lint will catch it.)

- [ ] **Step 8.1:** The block already Patches `Book_Bookings` but opens with
  `//FIX THE WRAPPING OF FOR ALL AROUND THE FAILURE AFTER REFRESH`. Structural review: the
  `IfError(Patch(…), Collect(colFailedBookings, …); Blank())` per-row error capture is the same
  shape Task 5 introduces, and `Refresh`/`ClearCollect`/failure-tally ordering looks correct.
  Treat as unproven, not broken.
- [ ] **Step 8.2 (human, Studio preview, after publish):** Repro attempt — book a 2-week
  recurring slot from Home where week 2 collides with an existing booking (e.g. Boardroom Thu
  10:00). Expected: week 1 created, week 2 reported as conflict toast, no phantom rows. If it
  misbehaves, capture the exact symptom into a new issue — **fixing beyond a comment-removal is
  out of Phase 0 scope unless the create path is actually broken.**
- [ ] **Step 8.3:** If 8.2 passes, delete the `//FIX THE WRAPPING OF FOR ALL AROUND THE FAILURE AFTER REFRESH` comment line (verified-dead note).

---

### Task 9: Gate + publish (publisher session only)

- [ ] **Step 9.1:** Full worker gate on the final scratch:

```bash
node tools/pa-lint/lint.js --src <scratch>
node tools/pa-schema-validate/validate.js --src <scratch>
node tools/prod-revert/revert-check.js --src <scratch> --contract docs/REVERT-CONTRACT.md
```
Expected: lint clean, schema clean, revert-check finds no orphan markers/entries (D5). **No
`--require-prod`** — Phase 0 deliberately leaves DEV-classified sites (`user-settings-writes`,
`people-picker-mock`, `booked-by-actor`); the booking-write sites (`booking-create-find`,
`booking-create-rooms`, `booking-cancel`, `booking-edit`) must classify **PROD**. Fix before
proceeding; never bypass.
- [ ] **Step 9.2:** `guard.sh lock` (P6), then `compile_canvas` on the scratch dir. The guard
  preflight re-syncs + lints (P1–P3). On block: read the reason, re-anchor, never retry unchanged.
- [ ] **Step 9.3:** Copy the compiled scratch over `Src/` and commit in the same breath (P4, P9):

```bash
git add Src/ docs/REVERT-CONTRACT.md
git commit -m "feat(app): Phase 0 baseline - all writes to SharePoint, mocks removed (D5,P4)"
```
- [ ] **Step 9.4 (human co-attached in Studio):** Save to persist an app version (P7). Record
  `guard.sh verified "rung 3 marker greps"` after fresh-sync grep-back of the five new
  `PROD-REVERT[…]` ids + zero `Mock` hits (P8).

---

### Task 10: Verification — sharp numbers, not vibes (D3)

All in Studio preview/player as harry, each recorded via `guard.sh verified` with rung + time (P8):

- [ ] **Home:** room count 6; Boardroom occupancy today **20%**; Today list shows **4** active
  (Cancelled clash absent — hostile row 13); Next booking = the soonest of harry's upcoming rows.
- [ ] **Find:** Equipment filter "VC" → exactly **1** room (Boardroom); MinCapacity 10 → **2**
  rooms (Boardroom, Training). Week timeline shows seeded rows; private row 12 renders masked
  (no title/owner leak).
- [ ] **myBookings:** "All" = **8**; Upcoming excludes past rows; cancel one standup → toast,
  row leaves the list, SharePoint row Status = Cancelled (check via
  `m365 spo listitem get`), then re-book it for the checklist to stay reusable.
- [ ] **Booking create (each of Home, Find, Rooms):** single booking succeeds → row appears in
  SharePoint with SharePoint-assigned ID, correct lookup, person = harry; deliberate
  double-booking of Boardroom Thu 09:00 → conflict toast, no row written (hostile row 13 must
  not block — it's Cancelled).
- [ ] **Recurring create:** 2 weeks OK + the Task 8.2 conflict repro.
- [ ] **Edit:** move a booking to a free slot → SharePoint row updated; to a taken slot →
  "no longer free" warning, row unchanged.
- [ ] **Profile:** flip NotifyConfirm, change ReminderMinutes to 30 → toggles/dropdown reflect
  the change within the session (collection-backed; persistence across restarts is expected NOT
  to survive — descoped, do not log as a defect).
- [ ] **Book-on-behalf:** pick a mock person (e.g. Priya Shah) → booking is created (no Patch
  error), SharePoint row has BookedByEmail = priya.shah@example.com and BookedBy person = harry
  (actor); the booking does NOT appear in harry's myBookings; sentinel row keeps Confirm gated.
- [ ] **App Checker:** `get_appchecker_errors` → `node tools/sarif-diff/sarif-diff.js` against
  `docs/APP-CHECKER-BASELINE.md`'s committed baseline — **no new issues** (P10).
- [ ] **Close-out:** post-publish re-sync, `chore:` normalization commit if the server reshaped
  anything (P5); session-close hook must find nothing uncommitted.

---

## Self-review notes

- Spec coverage: switch-breakage fixed (T5, T6, T8.0 — collection writes and unresolvable
  person claims ARE the breakage; reads were already live), fully-working features (T10 walks
  every implemented feature at Phase 0 scope), seeding 6 rooms + real week (T2). ✔
- Descoped with the user, 2026-07-30: Book_UserSettings + Office365Users wiring (MS1/MS2 in the
  contract carry the forward path; `user-settings-writes`, `people-picker-mock`,
  `booked-by-actor` stay DEV-classified on purpose).
- The one deliberately-open item: Task 8 treats Home's `//FIX` note as verify-then-delete, with
  an explicit out-of-scope boundary if it turns out broken.
- Type consistency: all writes use display names (`IsPrivate`; `'RoomID: Title'` never patched);
  `gblUserSettings`/`colUserSettings` shapes unchanged (no consumer edits).
