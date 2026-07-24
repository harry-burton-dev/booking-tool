# Booking Tool — project instructions

## What this is

A Power Apps canvas app (`MOC_Booking_Tool`) exported as source YAML for editing outside Power Apps Studio, then re-imported. Source lives in `Src/*.pa.yaml` (one file per screen, `Src/Components/` for components, `Src/App.pa.yaml` for app-level `OnStart`/named formulas) — this is the standard `pac canvas unpack` layout, not a hand-rolled format.

**`README.md` is stale** — it describes an old `src2/` structure (`Book.pa.yaml`, `View.pa.yaml`, etc.) that was deleted (see `git log`). The real screens are: `Home`, `Find`, `myBookings`, `bookingDetail`, `Rooms`, plus `Shell_Header` and `cpt_Modal_` components. Don't trust the README's file table.

## External connections — do not rewire

The production app has two live SharePoint Online connections, `Book_Rooms` and `Book_Bookings`, pointing at `modgovuk.sharepoint.com/teams/70124`, declared in `Properties.json` and `References/DataSources.json`. **Never edit those two files** — the goal is always a mechanical, no-wiring re-import into the original environment.

The app is currently edited against a **sandbox** environment that doesn't have those connections, so every direct `Book_Rooms`/`Book_Bookings` reference in the screen/component YAML has been swapped for local mock collections (`colRooms`, `colBookings`), seeded from `MockRoomsSeed`/`MockBookingsSeed` named formulas in `App.pa.yaml`. Full rationale: `docs/superpowers/specs/2026-07-24-sandbox-mock-data-design.md`.

**Rule for any future data-source work:** if you add a new external connection or touch an existing one, it must either (a) stay wired exactly as Power Apps generated it, untouched, or (b) be spoofed with a local variable/collection that mirrors its schema — never provision new real connections/lists as a substitute during sandbox editing. The point is zero rewiring effort when the YAML goes back to the original environment.

**Before re-importing into the production environment**, follow `MOCK_DATA.md` at the repo root — it lists every read/write call that needs to flip back from the mock collections to the live connections.

## Editing workflow

There is no local runtime for a canvas app — you cannot "run" this outside Power Apps Studio. The intended editing loop:

1. Edit the `.pa.yaml` source files directly (this is normal, reviewable code editing).
2. A Power Apps canvas-authoring MCP is expected to be available for pushing into a live sandbox coauthoring session — **but as of 2026-07-24 this app could not be pushed to that MCP because it contains components** (`Shell_Header`, `cpt_Modal_`), which made that session read-only. Don't assume the MCP push path works; verify it's actually usable before relying on it.
3. Regardless of MCP availability, the fallback (and current default) path is: commit and push changes to GitHub (`origin` = `github.com/harry-burton-dev/booking-tool`), and the user pastes/imports the YAML into Power Apps Studio by hand. Don't wait on MCP access to make progress — keep editing and pushing to GitHub.

## Commit/push behavior for this repo

Push to `origin` when explicitly asked. This repo is the user's authoritative working copy for a real production app — don't force-push, don't rewrite history.
