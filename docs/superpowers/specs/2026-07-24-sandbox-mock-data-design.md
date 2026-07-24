# Sandbox mock data layer — design

## Context

This app (`MOC_Booking_Tool`) was exported from a Power Apps environment where it has two live SharePoint Online connections: `Book_Rooms` and `Book_Bookings`, pointing at `https://modgovuk.sharepoint.com/teams/70124`. It will be edited going forward via the Power Apps canvas-authoring MCP, coauthoring against a **different, sandbox environment** that does not have these connections. The final YAML will be imported back into the original environment, where the real connections already exist and must not need re-wiring.

Because `Book_Rooms`/`Book_Bookings` won't resolve in the sandbox, any formula that references them directly will fail to compile/open there. This spec covers replacing those direct references with a local mock data layer that mirrors the real schema, so the app can be opened, edited, and previewed in the sandbox without touching the production data source definitions.

Feature/UX improvements to the app itself are **out of scope** for this spec — those will be explored screen-by-screen once the MCP connection is live, as a separate piece of work.

## Current state (as found)

- `Book_Rooms` is referenced directly in exactly one place: `App.pa.yaml` `OnStart` (`ClearCollect(colRooms, Book_Rooms)`). Everything else already reads from the local `colRooms` collection.
- `Book_Bookings` is referenced directly in ~15 places across 6 files (`App.pa.yaml`, `Home.pa.yaml`, `myBookings.pa.yaml`, `bookingDetail.pa.yaml`, `Find.pa.yaml`, `Rooms.pa.yaml`, `Components/cpt_Modal_.pa.yaml`) — both reads (`Filter`, `LookUp`, `Refresh`) and writes (`Patch` to create a booking, `Remove` to cancel one). A `colBookings` local collection exists (seeded from `Book_Bookings` at `OnStart`) but is only consulted in one read site (`Home.pa.yaml`); most of the app talks to the live connector directly.

## Goal

Every screen and component compiles and behaves identically whether pointed at the real SharePoint lists or the mock collections, with a purely mechanical (rename + two call-shape flips) path back to production — no redesign needed at transfer time.

## Mock schema

### `colRooms` (mirrors `Book_Rooms`)

Only the fields the app actually reads:

| Field | Type | Notes |
|---|---|---|
| `ID` | Number | SharePoint list item id |
| `Title` | Text | Room display name |
| `RoomID` | Number | The app's own room identifier (distinct from `ID`) |

Seed: 6 rooms with `RoomID` 1–6 (matches `Find.pa.yaml`, which hardcodes references to rooms 1–6), e.g. sequential `ID`/`RoomID` pairs with plausible meeting-room names.

### `colBookings` (mirrors `Book_Bookings`)

| Field | Type | Notes |
|---|---|---|
| `ID` | Number | SharePoint list item id |
| `Title` | Text | Booking subject |
| `StartDateTime` | DateTime | |
| `EndDateTime` | DateTime | |
| `RoomID` | Record `{Id: Number, Value: Number}` | Replicates the SharePoint lookup column shape. `Id` = the room's SharePoint item id; `Value` = the room's `RoomID` number (the real list's lookup column is configured to surface `RoomID`, not `Title` — confirmed by existing code comparing `RoomID.Value = varSelectedRoom.RoomID`, a numeric field). |
| `'RoomID: Title'` | Record `{Id: Number, Value: Text}` | Second lookup column read by `myBookings.pa.yaml` (`ThisItem.'RoomID: Title'.Value`) for the room's display name. |
| `BookedBy` | Record `{Claims, DisplayName, Email, Department, JobTitle, Picture}` | Matches the SharePoint person-field shape already written by `cpt_Modal_` today. |

Seed: a spread of bookings across today and the current week, across different rooms, to exercise conflict detection, "next booking", per-room occupancy %, and the My Bookings past/future split. Include at least one booking with `BookedBy.Email` set to `User().Email` (evaluated at `OnStart`) so My Bookings has data for whichever account is signed into the sandbox session.

## File-by-file changes

- **`App.pa.yaml`**: add `MockRoomsSeed` / `MockBookingsSeed` named formulas (literal tables per the schema above) in the `Formulas` block. `OnStart` seeds `colRooms`/`colBookings` from those instead of `ClearCollect(colRooms, Book_Rooms)` / `ClearCollect(colBookings, Book_Bookings)`.
- **`Home.pa.yaml`, `myBookings.pa.yaml`, `bookingDetail.pa.yaml`, `Find.pa.yaml`, `Rooms.pa.yaml`, `Components/cpt_Modal_.pa.yaml`**: swap direct `Book_Bookings` reads (`Filter(Book_Bookings, ...)`, `LookUp(Book_Bookings, ...)`) to `colBookings`. Drop the now-pointless `Refresh(Book_Bookings)` calls (no-op against a local collection).
- **`Components/cpt_Modal_.pa.yaml`**: booking creation — `Patch(Book_Bookings, Defaults(Book_Bookings), {...})` becomes `Collect(colBookings, {ID: Max(colBookings, ID) + 1, ...same fields...})`, since a plain collection has no connector-provided `Defaults`.
- **`bookingDetail.pa.yaml`**: cancel — `Remove(Book_Bookings, gblSelectedBooking)` becomes `Remove(colBookings, gblSelectedBooking)`. `gblSelectedBooking` is already set from a `colBookings`-backed gallery item in `myBookings.pa.yaml`, so this is a straight swap.

No changes to `Properties.json` or `References/DataSources.json` — the real connection references stay declared exactly as they are; they're just unused while the mock collections are in play.

## Revert-to-production plan

A `MOCK_DATA.md` file at the repo root documents exactly what to flip back before re-importing into the production environment:

1. Read sites: `colBookings` → `Book_Bookings`, `colRooms` → `Book_Rooms`.
2. `cpt_Modal_.pa.yaml` create: `Collect(colBookings, {ID: ..., ...})` → `Patch(Book_Bookings, Defaults(Book_Bookings), {...})`.
3. `bookingDetail.pa.yaml` cancel: `Remove(colBookings, ...)` → `Remove(Book_Bookings, ...)`.
4. Restore the `OnStart` `ClearCollect` calls from the live sources (or remove the seeding entirely if no longer needed).

This can be done by hand in Studio, or as a follow-up YAML edit pass.

## Verification

There's no local runtime for a canvas app outside Studio. Verification happens by pushing the edited YAML through the Power Apps MCP coauthoring session (once connected) and confirming each screen renders and behaves correctly against the mock data — conflict detection still blocks overlapping bookings, cancel removes the row, occupancy/next-booking calculations reflect the seed data, etc.
