# Booking Tool — Canvas App source

Source distribution of the room-booking Power Apps canvas app (app id
`a5fe0780-88fa-4bc5-9e55-5a2e9850ecda`, env `Default-ecf69819-…`). **This repo is a distro, not
the live app** — the live app is the source of truth; `Src/` here is a byte-adopted fresh sync
taken after the last publish. Retrieve from here into your production environment; do not treat
git alone as proof of what is live.

---

## Overnight delivery report — 2026-08-04 (read this first)

This section is the handoff Harry asked for: everything that was built, verified, fixed, and
left open in the unattended 2026-08-04 run, executed from the approved spec
(`docs/superpowers/specs/2026-08-03-battle-rhythm-admin-color-design.md`) and plan
(`docs/superpowers/plans/2026-08-03-battle-rhythm-admin-color.md`).

### What shipped (3 features, commits `9f12fea…eeed349` on `main`)

**1. Owner-coded timelines (Find + RoomsTimeline).** Every booking block/segment is now colored
by owner class, precedence Battle Rhythm → mine → other, with a 45% opacity fade on anything
already past: Battle Rhythm = Carbon purple (`#8a3ffc` light / `#a56eff` dark, new `ThemeMapHex`
tokens), yours = the existing Primary blue, others = the existing gray. Both screens' legends
gained "Battle Rhythm" and "Past" swatches. Find week-view occupancy segments use the same
4-way switch.

**2. Battle Rhythm permanent bookings.** Recurring bookings that stay in the programme forever
without materializing hundreds of rows:

- **One master row** per series in `Book_Bookings`: `RecurrenceType` = `BR-Weekly` |
  `BR-Fortnightly` | `BR-Monthly`, `IsException = false`, `StartDateTime`/`EndDateTime` = the
  first occurrence (anchors weekday, time, duration), `SeriesID` = GUID text. **No SharePoint
  schema change was needed** — the series columns (`SeriesID`, `RecurrenceType`, `OccIndex`,
  `IsException`) already existed.
- **Read-time virtual expansion**: App formulas `colBRMasters` (delegable pull) → `BRVirtual`
  (in-memory occurrences over the −90d..+24mo window) → `AllBookings` (union of reshaped real
  rows and virtual occurrences). All timelines, the Rooms status strips, and **every conflict
  check** read `AllBookings`, so Battle Rhythm slots block new bookings everywhere, while the
  master row itself never renders or blocks.
- **Deviations write one row each**: editing or cancelling a single occurrence writes an
  exception row (`RecurrenceType "BR-Exception"`, `IsException = true`, `OccIndex = k`) that
  suppresses virtual occurrence *k* — the exception's own Status decides whether a moved
  booking renders (`Active`) or the slot just frees up (`Cancelled`). Ending a series cancels
  the master plus its future exceptions.
- Virtual rows carry `ID = -(masterID·10000 + k)` and `IsVirtual: true`; negative-ID guards keep
  them out of `bookingDetail` (they are managed from the Admin screen instead — a deliberate
  deviation from the spec: routing virtual rows through `gblSelectedBooking` would have forced
  an illegal record-type union on that global).

**3. Admin screen.** Nav entry "Admin" (Shell_Header), visible only to admins;
`AdminEmails = ["harry@harry-burton.ai"]` / `IsAdmin` live in `App.Formulas` — edit that list to
add admins; swap for a SharePoint list later if wanted. Gating is **UI-level only** (SharePoint
list permissions unchanged). The screen mirrors the myBookings chrome (breadcrumb, Carbon type
ramp, IBM Plex via HtmlViewers) with three tabs:

- **All bookings** — every user's bookings in the window; search + date-range filters; View
  (opens bookingDetail) and Cancel row actions; virtual BR rows are display-only.
- **Battle Rhythm** — master series table (cadence, time, next occurrence), create form with
  first-occurrence conflict pre-check, two-step End series, and a per-master "next 8
  occurrences" panel with Cancel and Deviate (date/time mini-form; the date defaults to the
  occurrence being deviated; the check that the new time is free excludes the occurrence's own
  virtual row).
- **Rooms** — room list with Add / Edit forms (Title, Capacity, Equipment, description). No
  delete, by design.

### Verification status (claim = rung earned, per `docs/RULES.md` P8)

| Rung | Status |
|---|---|
| 1. pa-lint | **PASS** — 0 errors, 24 warnings (all pre-existing L3 advisories + 1 expected new nav-link L3) |
| 2. compile | **PASS** — final `compile_canvas` validated 13 files, 0 diagnostics |
| 3. fresh-sync marker greps | **PASS** — post-publish sync shows `BattleRhythm`/`BRVirtual`/`AllBookings` in `App.pa.yaml`, `Admin.pa.yaml` present (13 files); `Src/` = that sync, byte-adopted |
| App Checker (P10) | **14 = baseline.** One finding swapped: `adRmBtnSave` `CollectDelegatableDataSource` accepted (same class as the baselined `App.OnStart` pull; rooms list ≪ 500 rows; the Filter wrapper alternative draws a publish-failing delegation warning) |
| 4. pac-verify | **NOT RUN** (needs `.msapp` pack tooling; run before any production pack) |
| 5. Studio / 6. player | **PENDING — human.** See "Your checklist" below |

Two independent diff-scoped reviews ran on the high-risk lanes; every behavioural finding was
fixed and re-compiled (details in the commit messages of `98d60ad`, `6dbf3ad`, `585d91e`).

### ⚠ The P7 caveat (why this repo matters tonight)

The publish was made **without a Studio session co-attached and without a human save**. Repo
rule P7 says a server session read-back is not persistence — a push in this state has
evaporated before. The final fresh sync round-tripped every change (rung 3), which is the
strongest verification available unattended, but until someone opens the app in Studio and
saves a version, treat the live server state as *probably-but-not-guaranteed* current. **If the
server has reverted when you look: everything is in this repo** — reconnect, `compile_canvas`
the `Src/` directory (it is exactly the published state), then save in Studio.

### Your checklist (rung 5/6, from the spec's Testing section)

1. Open the app in Studio, confirm it loads, **save a version** (clears the P7 caveat).
2. Colors: a day on Find with your own + others' + past bookings renders blue/gray/faded per the
   legend, in both themes; RoomsTimeline matches.
3. Battle Rhythm: create a weekly series in Admin → purple blocks on the right weekdays on
   Find/RoomsTimeline; try to book over one → conflict panel blocks; deviate one occurrence →
   only that date moves; cancel one → only that date frees; end the series → future occurrences
   vanish.
4. Admin gating: a non-admin account sees no Admin nav link and gets "You need administrator
   access" if they land on the screen.
5. Rooms: add/edit a room → appears on Rooms/Find after save.

### Known limitations / open items

- **Admin gating is cosmetic** — anyone with SharePoint list access can still write rows
  directly. Accepted in the spec for this app's trust level.
- **BUG-1 exception race (benign)**: an exception row created by another user between your
  snapshot and a Confirm can briefly double-block (real row + still-unsuppressed virtual row).
  The conflict verdict is unaffected; only the "conflicting booking" label can lag. Documented
  in-code at the BUG-1 site in `cpt_Modal_`.
- **Deviating across periods**: an exception row suppresses its occurrence index regardless of
  the new date, so a deviation moved far from its original slot still frees exactly that one
  occurrence — the occurrence panel shows "Deviated to <date>" so the state is visible.
- `schema/Book_Bookings.json` (local schema mirror) still omits the series columns — harmless
  to the validators today, worth refreshing before the next `pack-msapp` production pack.
- `docs/APP-CHECKER-BASELINE.md` should be regenerated to note the `adRmBtnSave` finding swap.
- Deferred plan item: bookingDetail never handles virtual rows (Admin owns BR management) —
  intentional, see feature 2 above.

### Retrieval into production

1. Clone this repo; the app source is `Src/` (13 `.pa.yaml` files: App, 8 screens incl. the new
   `Admin.pa.yaml`, 3 components, editor state).
2. Via the canvas-authoring MCP: `connect` (env + app id above, snake_case params) →
   `compile_canvas(<repo>/Src)` → save in Studio. Or import through your existing
   `tools/pack-msapp` flow (run `revert-check` + `sarif-diff` first — see `CLAUDE.md` "Sandbox
   & deploy"; note the three new `PROD-REVERT[booked-by-actor]` sites in `Admin.pa.yaml`).
3. Admins: edit `AdminEmails` in `App.pa.yaml` `Formulas:`.

---

## Repo map

- `Src/` — canvas app source (synced via canvas-authoring MCP; no `Controls/`/`References/` —
  those come only from `pac canvas unpack`).
- `docs/RULES.md` — the rulebook (P/Y/D/DS/O rule IDs); `CLAUDE.md` — editing workflow;
  `docs/PUBLISHING-PROTOCOL.md`, `docs/REVERT-CONTRACT.md`, `docs/APP-CHECKER-BASELINE.md`.
- `docs/superpowers/specs/` + `docs/superpowers/plans/` — design docs and executed plans
  (2026-08-03 Battle Rhythm spec/plan are the current delivery).
- `tools/` — pa-lint, pa-schema-validate, canvas-guard, sarif-diff, pack-msapp, prod-revert.
