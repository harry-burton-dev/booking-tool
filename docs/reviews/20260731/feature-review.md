# Feature Review — booking-tool (fresh sync 2026-07-31)

Source reviewed: `.scratch/overnight-20260731/sync` (App, Home, Rooms, Find, bookingDetail,
myBookings, Profile, Components/cpt_Modal_, Components/Shell_Header). Static formula trace only —
no runtime verification (rung 0). Product context: `docs/RULES.md`, `docs/REVERT-CONTRACT.md`,
`docs/superpowers/plans/*`.

Data model: `colRooms` / `colBookings` are **OnStart snapshots** of SharePoint `Book_Rooms` /
`Book_Bookings` (App.OnStart, `App.pa.yaml:610-611`). All availability, conflict and series logic
runs against these snapshots; writes go to `Book_Bookings` and re-snapshot afterwards.

---

## Top findings

| # | Sev | Tag | Finding | Where |
|---|-----|-----|---------|-------|
| 1 | CRITICAL | RISKY | Double-booking race: every conflict check (create, edit, series) runs only against the session-local `colBookings` snapshot; there is no server-side re-check at write time. Two users who open the wizard around the same time both see the slot free and both write `Status: "Active"` rows for the same room/time. | `cpt_Modal_.pa.yaml:1737-1848` (btnConfirm), Home/Find/Rooms `OnSubmit`, `bookingDetail.pa.yaml:795-841` |
| 2 | CRITICAL | RISKY | Delegation time bomb: `ClearCollect(colBookings, Book_Bookings)` is a non-delegable full-table pull, capped at the data-row limit (500/2000). Once the list outgrows the cap, older/newer rows silently vanish from the snapshot, timelines show busy slots as free, and #1 fires deterministically. Only Find carries a ≥500 warning (`Find.pa.yaml:155-157`); every other surface is silent. | `App.pa.yaml:610-611`, all `Refresh + ClearCollect` sites |
| 3 | HIGH | SAFE | Stale availability between sessions: the snapshot is refreshed only after *your own* writes. No screen's `OnVisible` re-pulls `Book_Bookings`, so a colleague's booking/cancellation made after your app start is invisible everywhere (Home chips, Rooms, Find, myBookings) until you write something yourself. Compounds #1. | `Home.pa.yaml:6`, `Rooms.pa.yaml:6-17`, `Find.pa.yaml:6-9`, `myBookings` (no OnVisible) |
| 4 | HIGH | RISKY | Notifications are a facade: all Profile notification toggles are `DisplayMode.Disabled`, they write only to the session-local mock `colUserSettings` (PROD-REVERT[user-settings-writes], MS1 deferred), and no connector/flow anywhere sends email or reminders. The UI promises confirmation emails, cancellation notices, reminders and digests that cannot happen. | `Profile.pa.yaml:211-409`, `App.pa.yaml:565-569` |
| 5 | HIGH | RISKY | "Show as busy" (private) and "Booking for someone else" toggles are `DisplayMode.Disabled` in the wizard — both features are dead in the current build even though full downstream support exists (privacy masking in Find/Rooms/conflict panel, `BookedByEmail` routing). When enabled, on-behalf bookings become invisible to the *creator* (`MyBookings` filters `BookedByEmail = me`) and, with the mock people list (example.com addresses, PROD-REVERT[people-picker-mock]), orphaned — nobody can see or cancel them. | `cpt_Modal_.pa.yaml:1313-1319, 1360-1367`, `App.pa.yaml:401-408, 576-582` |
| 6 | MEDIUM | SAFE | "Next free slot" suggestion is wrong: `varNextFreeSlot` is a `LookUp` over an unsorted filter — it returns the `EndDateTime` of an *arbitrary* later booking, not the earliest; the conflict-panel timeline only labels a slot "Next free slot" when a 30-min grid line happens to equal that value exactly, so the marker almost never appears. | `cpt_Modal_.pa.yaml:605-618, 730-743, 1750-1763`, timeline label `:1057-1083` |
| 7 | MEDIUM | SAFE | Rooms "Book" (selection bar) opens the wizard with `varSelectedDate = Blank()`: the weekend/past-date gates are written `!IsBlank(varSelectedDate) && …` so a blank date passes them, the time dropdowns compute items from a blank date, and the date error label never fires. Should be `Today()`. | `Rooms.pa.yaml:1215-1231`, gates at `cpt_Modal_.pa.yaml:1693, 1726` |
| 8 | MEDIUM | SAFE | Past/weekend days remain fully navigable in Find and the Rooms timeline; free slots on those days render as bookable buttons and open the wizard, which then dead-ends at a disabled Confirm with an error label. Functionally safe but a confusing trap. | `Find.pa.yaml:60, 82`, `Rooms.pa.yaml:699-746` |
| 9 | MEDIUM | RISKY | Timezone/DST risk: all window math (8:00–18:00, `Now()`, slot generation) is client-local wall clock while the SharePoint site TZ was deliberately set to UTC (REVERT-CONTRACT MS4). For BST users, stored-vs-displayed times and series that span a DST transition risk a one-hour shift. Unverified — needs a runtime check either side of a DST boundary. | `App.pa.yaml:322-323, 363-364`, `docs/REVERT-CONTRACT.md` MS4 |
| 10 | MEDIUM | SAFE | An in-progress booking cannot be re-timed: "Change time" is offered while `EndDateTime` is future, but Confirm is gated on `fnIsPast(varStartTime)`, and the prefilled (already-started) start time blocks the save; the start dropdown also only lists future times. Extending/shortening a meeting you are currently in is impossible. | `bookingDetail.pa.yaml:295-344`, `cpt_Modal_.pa.yaml:1726` |

---

## Flow 1 — Navigation from Home / shell

**Verdict: works.** Shell_Header gives Home / Rooms / Bookings / Find tabs plus avatar → Profile
(`Shell_Header.pa.yaml:132-281, 411-427`). Home tiles route to the create wizard, Rooms and
myBookings; "Rooms available now" chips and occupancy rows deep-link into Find with
`gblFindFocusRoomID` (header highlight only — it does not scroll or filter, `Find.pa.yaml:316`).

Issues:
- **LOW/SAFE** — Tab indicator drift: Home tiles (`btn_TileView`, `btn_TileMyBook`) and
  "View all" buttons navigate without setting `gblUI_Nav_currentTab`, so the header underline
  stays on "Home" (`Home.pa.yaml:295, 381, 485`). The chip/occupancy paths do set it.
- **LOW/SAFE** — Fixed-height galleries: `galRoomChips` (120px, wrap 3, no scrollbar) and
  `galOccupancy` (192px) fit exactly the current 6 rooms; a 7th room is silently clipped
  (`Home.pa.yaml:698, 902`).
- `varNowTick` re-ticks on Home/Rooms OnVisible only; Find and myBookings surfaces reuse the old
  tick (mostly cosmetic given finding #3 dominates).

## Flow 2 — Browse/search rooms (Rooms)

**Verdict: works well** — the strongest screen. Search (delayed output), capacity filter, sort,
multi-select equipment chips, live counts ("N of M rooms · K available now"), availability strip
per card, empty state with "Clear filters", selection bar, and a per-room day timeline with
bookable free gaps. Status logic (`RoomsBrowseBase`, `App.pa.yaml:445-521`) correctly handles
outside-hours, busy-until, free-until and free-all-day, and clamps spans to the working window.

Issues:
- **MEDIUM/SAFE** — "View week" is a permanently disabled placeholder button with a tooltip
  ("Week view is not available yet", `Rooms.pa.yaml:1187-1203`). Explicit gap; Find's week view
  partially covers it.
- **MEDIUM/SAFE** — finding #7 (Book with blank date).
- **MEDIUM/SAFE** — timeline free-gap builder (`btn_LoadTimeline`, `Rooms.pa.yaml:1033-1131`)
  assumes bookings in a room are disjoint. Overlapping Active rows (possible via race #1) produce
  malformed gap rows. Same assumption in Find's builder.
- **LOW/SAFE** — Rooms OnVisible resets all filters and selection on every visit; returning from
  a timeline keeps state, but leaving the screen loses it.
- Past days navigable in the timeline (finding #8); Confirm gate catches it.

## Flow 3 — Find a time (Find)

**Verdict: works.** Day view renders a per-room column timeline built from `colFindRows`
(booked blocks + clickable free gaps); week view aggregates per-day booked minutes and free hours
and drills into day view. Capacity/equipment filters re-run the builder; empty states for
"no rooms" and "no rooms match filters" exist. Private bookings are masked to "Busy" with no
booker name (`Find.pa.yaml:171-172`) — correct, though privacy can't currently be set (finding #5).

Issues:
- Free-slot click prefills start (clamped to next 15-min mark if the slot already started) and a
  60-min end capped at the free run — good UX (`Find.pa.yaml:504-557`).
- **MEDIUM/SAFE** — finding #8: unlimited back-navigation into past dates/weekends with
  bookable-looking slots. On a past day the clamp mixes "today" times with a past
  `varFindSelectedDate`, producing an inconsistent wizard state that is only caught by the
  disabled Confirm.
- **LOW/SAFE** — The ≥500-row incompleteness warning exists only here; week view aggregates
  (`WeekBookings`) share the same snapshot cap silently.
- OnVisible resets to today/Day view every visit — acceptable, loses context on round-trips.

## Flow 4 — Create a booking (wizard, hosted on Home / Find / Rooms)

**Verdict: completes correctly in the happy path, with genuinely good validation UX** — required
title with touched-state error, weekend and past-date errors, end-after-start, 4-hour cap, 15-min
slot grid 08:00–18:00, per-field disabled-reason label on the confirm step, discard-confirmation
on close, and a conflict panel with a mini-timeline and alternative rooms.

The three hosts' `OnSubmit` handlers are near-identical ~120-line copies (Home
`Home.pa.yaml:958-1076`, Find `Find.pa.yaml:678-800`, Rooms `Rooms.pa.yaml:1240-1362`): they
snapshot `PatchPayload`, expand recurrence (Weekly / BiWeekly / Monthly × 2–12 occurrences,
shared `SeriesID` GUID), write each occurrence with `Status: "Clash"` when the slot is taken or
lands on a weekend, collect failures, re-snapshot, and notify (success / N clash / error). This
"write-as-Clash, never silently drop" recurrence design is solid.

Issues:
- **CRITICAL/RISKY** — findings #1/#2: the pre-write `_hasClash` check is against the local
  snapshot; concurrent users double-book with both rows Active.
- **HIGH/RISKY** — finding #5: private + on-behalf toggles disabled.
- **MEDIUM/SAFE** — finding #6: wrong next-free-slot suggestion.
- **MEDIUM/SAFE** — Alternative-rooms UX conflict: tapping a row selects that room, but the
  primary CTA always reads/books `First(varAlternativeRooms)` regardless of the tapped row
  (`cpt_Modal_.pa.yaml:1261-1272`); alternatives also ignore the capacity/equipment of the
  request.
- **LOW/SAFE** — `lblStep2Hint` (the only in-flow statement of the Mon–Fri / 4-hour policy) has
  `Visible: =false` (`cpt_Modal_.pa.yaml:925`); users discover policy only via error labels. The
  policy is otherwise stated only on Profile → About.
- **LOW/SAFE** — Home's `OnSubmit` ends with `Navigate(Home)` while already on Home (harmless);
  no dedicated confirmation screen — outcome is a toast only.
- Maintainability: the triplicated OnSubmit invites drift (Find/Rooms carry
  `PROD-REVERT[booking-create-*]` markers; Home's copy has none above its Refresh).

## Flow 5 — View / edit / cancel bookings (myBookings + bookingDetail)

**Verdict: works, including a fairly sophisticated series model.** Upcoming/All/Series tabs;
clash badges; empty states with a "Book a room" CTA; detail screen with Past/Upcoming badge,
"Change time" (wizard step 2, times-only prefill), two-step cancel confirmation, series scope
prompts (just this / whole series) for both edit and cancel, and a clash "fix cycle" that walks
each clashed occurrence through re-timing and reports "All clashes resolved". Series edit
re-times future non-exception members by minutes-of-day, marks weekend/occupied targets as
Clash, and reports healed/new clash counts (`bookingDetail.pa.yaml:652-758`). Cancel is a soft
delete (`Status: "Cancelled"`, prod form per PROD-REVERT[booking-cancel]).

Issues:
- **MEDIUM/SAFE** — finding #10: in-progress bookings can't be re-timed.
- **MEDIUM/RISKY** — Concurrent edits are last-writer-wins Patches by ID; series edit iterates
  per-row `Patch` with only a generic "Couldn't update one or more occurrences" on partial
  failure, leaving a mixed-state series with no retry/rollback.
- **MEDIUM/SAFE** — The "All" tab is silently bounded to a 90-day lookback
  (`App.pa.yaml:398-408`) — deliberate for delegation, but the label promises "All".
- **LOW/SAFE** — Edit is described as "times-only" but the wizard's Back button reaches step 1,
  so the room *can* be changed during an edit; `OnSubmitEdit` does patch `RoomID`, so it works,
  just contradicts the comment. Title is also editable (patched).
- **LOW/SAFE** — `conCancelZone` has `Height: 180` but `LayoutMaxHeight: 110`; the series scope
  prompt (label + 3 buttons) lives inside it and risks clipping (cosmetic, unverified).
- **LOW/SAFE** — Clash badge (176px, x = Width−192) can collide with the title on narrow
  windows (title width = Width−80).
- `gblSelectedBooking` is a gallery-row snapshot; details shown can be stale vs. the list until
  a write refreshes (subset of #3).

## Flow 6 — Profile

**Verdict: identity/About work; the Notifications card is inert.** Avatar initials, name, email,
version (`Phase 6 · 2026-07-26`), environment ("Production" — `IsSandbox = false`), booking
policy text, privacy note.

Issues:
- **HIGH/RISKY** — finding #4: every toggle and its label is `DisplayMode.Disabled`; handlers
  Patch only the mock `colUserSettings` (session-only — lost on restart, `Book_UserSettings`
  unwired per MS1); nothing sends any notification.
- **LOW/SAFE** — "Report a problem" button's `OnSelect: =false` — a dead control
  (`Profile.pa.yaml:537`).

---

## Stubbed / mock-only inventory (PROD-REVERT + friends)

| Marker / site | State in this sync | Effect |
|---|---|---|
| `people-picker-mock` (`App.pa.yaml:575-582`) | DEV by decision (MS2 deferred) | `colPeople` = 4 fake example.com people + select-sentinel; real people search unwired |
| `user-settings-writes` (`Profile.pa.yaml:220`) | DEV by decision (MS1 deferred) | Settings live in session-only `colUserSettings`; never persisted |
| `booked-by-actor` (all 3 create hosts) | DEV by decision (MS2 deferred) | `BookedBy` person column is always the actor even when booking for someone else; `BookedByEmail` carries the target |
| `booking-cancel`, `booking-edit`, `booking-create-find`, `booking-create-rooms` | PROD form present (Patch/Refresh against `Book_Bookings`) | Live SharePoint writes — correct for current prod-replica state |
| `IsSandbox` (`App.pa.yaml:121`) | `false` | Profile reports "Production" |
| Disabled controls | `tglPrivate`, `tglBookOnBehalf`, all Profile notification toggles, `btnRoomsViewWeek`, `btnReportProblem` | Visible but non-functional features |

## Feature gaps vs. a complete room-booking product

- **No notifications of any kind** (email confirmation, cancellation notice, reminder, digest) —
  UI promises them (finding #4). No Power Automate flow, no Office365Outlook connector.
- **No calendar integration** — bookings don't create Outlook/ICS events; no export.
- **No approvals** — every booking is instantly Active; no room-owner or managed-room concept.
- **No check-in / auto-release** — no-show rooms stay booked all day.
- **No capacity-vs-attendees check** — capacity is a browse filter only; the wizard never asks
  how many people are coming.
- **Recurrence is bounded** — Weekly/BiWeekly/Monthly, 2–12 occurrences, no custom end date, no
  "every weekday", and recurrence/privacy cannot be edited after creation (times/room/title can).
- **No waitlist / notify-when-free.**
- **No admin surface** — rooms are managed directly in SharePoint.
- **Rooms week view** stubbed (disabled button); Find has no free-text room search.
- **No booking-history/audit view** beyond the 90-day "All" tab.

## Suggested priority order

1. (#1/#2) Server-verified conflict handling + delegable date-windowed reads — the two combine
   into the product's core correctness guarantee.
2. (#3) `Refresh + ClearCollect` (or windowed re-pull) on Find/Rooms/myBookings OnVisible.
3. (#4/#5) Decide: either wire MS1/MS2 + a notification flow, or hide the dead toggles/cards so
   the UI stops promising them.
4. (#6, #7, #8, #10) Small contained wizard/timeline fixes — all SAFE.
5. (#9) Runtime DST verification before winter clock change.

*Review generated 2026-07-31 by static formula trace (verification rung 0 — no compile, no
runtime).* 
