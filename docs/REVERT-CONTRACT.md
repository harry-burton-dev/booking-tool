# REVERT-CONTRACT.md — dev → prod revert contract

Every code site that differs between the sandbox and production carries a source marker:

```
// PROD-REVERT[<id>]        (or  /* PROD-REVERT[<id>] */ )
```

and one entry below. `node tools/prod-revert/revert-check.js --src Src --contract
docs/REVERT-CONTRACT.md` cross-checks both directions (orphan markers, orphan entries) and
classifies each site DEV / PROD / UNKNOWN / AMBIGUOUS by matching the patterns within 30 lines
after the marker. The deploy gate requires `--require-prod` to pass.

**Re-run the check after every structural phase** — this contract demonstrably goes stale
otherwise. Non-code manual steps (Studio swaps, SharePoint provisioning, locale flips) live in
the **Manual steps** section at the bottom; they are checklist-gated, not marker-gated.

**Phase 0 note (2026-07-30):** `user-settings-writes`, `people-picker-mock`, and
`booked-by-actor` stay DEV-classified by decision — Book_UserSettings and Office365Users are
deliberately unwired (MS1/MS2). Do not run `--require-prod` until those manual steps execute.

---

## Entry format

### <id>

One sentence: what this site does in dev and what it must become in prod.

```dev
<literal substring(s) of the dev form — enough to identify it uniquely>
```

```prod
<literal substring(s) of the prod form>
```

---

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

---

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

---

### booking-cancel

Soft-delete: dev patches colBookings Status; prod patches Book_Bookings (Remove() retired per WS4).

```dev
Patch(colBookings, LookUp(colBookings, ID = gblSelectedBooking.ID), {Status: "Cancelled"})
```

```prod
Patch(Book_Bookings, LookUp(Book_Bookings, ID = gblSelectedBooking.ID), {Status: "Cancelled"})
```

---

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

---

### user-settings-writes

Profile settings: dev patches colUserSettings (stays in Phase 0 by decision); prod patches Book_UserSettings once that data source is wired (all five setting rows follow the marked NotifyConfirm site's pattern).

```dev
Patch(colUserSettings,
```

```prod
Patch(Book_UserSettings,
```

---

### booked-by-actor

Create paths (Home/Find/Rooms): with mock people, writing the picked person's claims errors on unresolvable users, so the Phase 0 form writes the actor's claims (BookedByEmail still carries the picked person). Prod form returns with Office365Users (MS2).

```dev
Claims: $"i:0#.f|membership|{Lower(User().Email)}",
```

```prod
Claims: $"i:0#.f|membership|{If(IsBlank(varBookForEmail), Lower(User().Email), varBookForEmail)}",
```

(Note: dev/prod look inverted here because the "dev" form is the safe Phase 0 form; the contract
records the intended end state.)

---

## Manual steps (Studio / SharePoint — human-executed, per deploy)

- [ ] MS1 (DEFERRED post-Phase-0): Add the Book_UserSettings SharePoint data source in Studio
      (site https://hbbaby.sharepoint.com/sites/booking-tool), then revert user-settings-writes.
- [ ] MS2 (DEFERRED post-Phase-0): Add the Office365Users connection in Studio, then revert
      booked-by-actor and repoint colPeople (people-picker-mock).
- [x] MS3: SharePoint lists provisioned + seeded per schema/*.json — 6 rooms with item ID ==
      RoomID, 18 bookings. Evidence: `m365 spo listitem list` 2026-07-30 ~18:20 — Book_Rooms 6
      rows Id==RoomID 1–6; Book_Bookings 18 rows (17 Active, 1 Cancelled), times land at
      intended UTC values, person resolved on harry rows (BookedById 6), lookup RoomIDId set on
      all rows. Book_UserSettings left empty (descoped, MS1).
- [x] MS4: Site regional settings timezone set to UTC (Id 93, was Pacific Id 13) via CSOM
      ProcessQuery, verified by `_api/web/regionalsettings/timezone` 2026-07-30 ~18:10. Studio
      preview render check pending Phase 0 Task 10.

Each manual step gets a verification line ("evidence, not edits") when executed.
