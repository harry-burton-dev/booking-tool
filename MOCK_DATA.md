# Sandbox mock data — revert before transfer

This app currently runs against local mock collections (`colRooms`, `colBookings`) instead of the live SharePoint connections (`Book_Rooms`, `Book_Bookings`) so it can be edited in a sandbox Power Apps environment. See `docs/superpowers/specs/2026-07-24-sandbox-mock-data-design.md` for the full design.

**Before importing this app back into the original environment**, undo the following. `Properties.json` and `References/DataSources.json` were never touched, so the real connections are already declared and ready to use once these read/write calls point at them again.

## 1. Reads — rename `colBookings` → `Book_Bookings`, `colRooms` → `Book_Rooms`

Files with direct read references:
- `Src/App.pa.yaml` — `OnStart`: `ClearCollect(colRooms, MockRoomsSeed)` / `ClearCollect(colBookings, MockBookingsSeed)` → `ClearCollect(colRooms, Book_Rooms)` / `ClearCollect(colBookings, Book_Bookings)`. Also remove (or keep, harmless) the `MockRoomsSeed`/`MockBookingsSeed` named formulas and the `UpdateIf` seed-binding block in `OnStart`.
- `Src/Home.pa.yaml`
- `Src/myBookings.pa.yaml`
- `Src/bookingDetail.pa.yaml`
- `Src/Find.pa.yaml`
- `Src/Rooms.pa.yaml`
- `Src/Components/cpt_Modal_.pa.yaml`

Also restore the `Refresh(Book_Bookings);` calls that were removed from `OnVisible` in `Home.pa.yaml`, `myBookings.pa.yaml`, and `bookingDetail.pa.yaml` (they were no-ops against a local collection, but are meaningful against the live connector).

## 2. Writes

- `Src/Components/cpt_Modal_.pa.yaml` (booking creation): change
  ```
  Collect(colBookings, {ID: Max(colBookings, ID) + 1, Title: ..., RoomID: ..., 'RoomID: Title': ..., StartDateTime: ..., EndDateTime: ..., BookedBy: ...})
  ```
  back to
  ```
  Patch(Book_Bookings, Defaults(Book_Bookings), {Title: ..., RoomID: ..., StartDateTime: ..., EndDateTime: ..., BookedBy: ...})
  ```
  (drop the `ID` and `'RoomID: Title'` fields — SharePoint assigns/computes those automatically.)

- `Src/bookingDetail.pa.yaml` (cancel): `Remove(colBookings, gblSelectedBooking)` → `Remove(Book_Bookings, gblSelectedBooking)`.

## 3. Sanity check

Once reverted, confirm no `colRooms`/`colBookings`-only mock artifacts remain in read/write paths (a couple of `colRooms`/`colBookings` reads elsewhere in the app — e.g. gallery `Items` bound to `colRooms` — are pre-existing and correct; they're not part of this mock layer and should stay as-is).
