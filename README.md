# Booking Tool

A Power Apps canvas room-booking app. Source is stored as `.pa.yaml` (Power Apps YAML) — one file per screen, plus one for app-level startup and formulas.

## Structure

| File | Contents |
|------|----------|
| [`src2/App.pa.yaml`](src2/App.pa.yaml) | App start (`OnStart`) and named formulas — theme tokens (`AppTheme`), timeline windows (`Timeline_DayStart`, `varFindWindowStart`), and the SVG tile/button generators. |
| [`src2/Home.pa.yaml`](src2/Home.pa.yaml) | Dashboard — action tiles, next booking, rooms-available-now, today's occupancy. |
| [`src2/Book.pa.yaml`](src2/Book.pa.yaml) | New booking form (single-card, modal-ready) — room, date, time, conflict check, confirm. |
| [`src2/Find.pa.yaml`](src2/Find.pa.yaml) | Multi-room day timeline grid. |
| [`src2/View.pa.yaml`](src2/View.pa.yaml) | Per-room timeline view with date navigation. |
| [`src2/myBookings.pa.yaml`](src2/myBookings.pa.yaml) | The current user's upcoming / past bookings. |
| [`src2/bookingDetail.pa.yaml`](src2/bookingDetail.pa.yaml) | Single booking detail with cancel. |

## Data sources

SharePoint lists `Rooms` and `RoomBookings` (intended to be re-pointed on environment migration).

## Editing

Screens are authored/validated through the Power Apps canvas-authoring MCP, which compiles the `.pa.yaml` files and pushes them to a live coauthoring session.
