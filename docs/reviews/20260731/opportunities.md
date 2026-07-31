# Opportunities Review — booking-tool, 2026-07-31

**Reviewer role:** strategy / left-field opportunities.
**Basis:** source snapshot `.scratch/overnight-20260731/sync` (App + 6 screens + Shell_Header,
cpt_Modal_), `docs/RULES.md`, `docs/REVERT-CONTRACT.md`, `docs/superpowers/` specs & plans,
`docs/audit/01-CURRENT-PICTURE.md`, and a skim of `tools/`.

---

## 1. What actually exists (the asset inventory)

Before listing directions, it is worth being precise about what is genuinely valuable here,
because the most interesting opportunities are not "more booking features".

**A. The app.** A 6-screen Canvas App (Home, Find, Rooms, bookingDetail, myBookings, Profile)
on two SharePoint lists (`Book_Rooms`, `Book_Bookings`, with `Book_UserSettings` designed but
unwired — MS1). It is unusually well-architected for a Canvas App:

- **Named formulas as a derived-data layer** (`TodayBookings`, `MyBookings`, `FindBookings`,
  `RoomOccupancyToday`, `RoomsBrowseBase/Data`) — effectively a read-model/CQRS shape inside
  Power Fx. Occupancy-per-room and free/busy status are *already computed* (`StatusKey`,
  `BookedMinutes`, `IsAvailableNow`, window-clamped minute sums).
- **Shared predicates** (`fnOverlaps`, `fnIsPast`) and policy constants (`DayStartHour`,
  `SlotMinutes`, `MaxBookingMinutes`) — the booking rules are centralized, not smeared.
- **A timeline engine** (day + week views in Find/Rooms, `Timeline_*` constants,
  px-per-minute layout) that is resource-agnostic: nothing in it knows it's about *rooms*.
- **A hand-built Carbon design system**: `ThemeMap` light/dark tokens, and SVG-data-URI
  component renderers (`ButtonProperties`, `TileProperties`, `ContentSwitcherItem`) that give
  Canvas Apps IBM-Carbon-quality visuals without PCF controls.
- **A sandbox/prod contract**: `IsSandbox` sentinel, mock seeds mirroring live schema,
  `PROD-REVERT[id]` markers cross-checked by `revert-check.js`.
- **A designed-but-unbuilt series/recurrence model** (SeriesID/RecurrenceType/OccIndex/
  IsException flat columns, Clash status, series manager tab) — spec approved 2026-07-30.

**B. The toolchain (`tools/`, Process V2 @ 84cfd20, 102/102 tests).** This is the sleeper
asset. It solves a problem *every* team doing AI-assisted (or just multi-dev) Canvas App
work has and almost nobody has solved: **there is no local runtime, compile is a publish,
and last-writer-wins clobbers work.** The kit:

- `pa-lint` — 9+ text-level checks for real defect classes (inline-colon YAML, unset
  globals, ComboBox/layout traps, seed-vs-schema drift, reset-site completeness, locale
  date parses, name collisions), each check earned by an actual production failure.
- `canvas-guard` — publish freshness gate (blocks pushing onto a moved server), lint
  preflight, verification-decay ledger (`verified` rungs with timestamps).
- `pac-verify`, `prod-revert`, `sarif-diff` (App Checker baseline ratchet), `pack-msapp`
  (the backslash-entry-name discovery alone is a blog post), `commit-msg-lint`,
  `session-close`, plus the `pa-process-init` installer skill and an orchestration rulebook
  (RULES.md with enforcement-status tags).

**C. The process artifacts.** RULES.md's `[LINT]/[HOOK]/[GATE]/[ADVISORY]` promotion ladder,
the verification ladder ("rung N at HH:MM"), the single-publisher lock protocol, and the
brainstorm→spec→plan pipeline under `docs/superpowers/`. This is a *methodology*, documented
well enough to teach.

---

## 2. Opportunities

Format per item: **What** · **Why now** (what makes it cheap given A/B/C) · **Effort**
(S ≈ days, M ≈ 1–3 weeks, L ≈ month+) · **First step** · **Risk**.

### (a) Product extensions

#### A1. Generalize "rooms" to "bookable resources" (desks, equipment, parking, people)

- **What:** Turn the app into a generic resource-booking tool. Desks are just capacity-1
  rooms; equipment (projectors, cameras, pool cars) are rooms with no capacity; parking
  bays likewise. Add a `ResourceType` column to `Book_Rooms` and a type switcher on Rooms/Find.
- **Why now:** The timeline engine, `fnOverlaps` conflict logic, occupancy math, and the
  wizard modal are all already resource-agnostic — they operate on `colRooms`/`colBookings`
  generically. The Rooms browse layer (`RoomsBrowseBase`) already filters on capacity and an
  `Equipment` token list, which is exactly the attribute-filter shape other resource types need.
  This is mostly a data-model rename plus one filter dimension.
- **Effort:** S–M.
- **First step:** Add `ResourceType` (Text) to `Book_Rooms` in the prod-replica site, seed 4
  desks + 2 equipment rows, and add a ContentSwitcher on Rooms bound to it (the
  `ContentSwitcherItem` SVG renderer already exists).
- **Risk:** Scope creep — desk booking wants floor-plan UX (see A2) and per-half-day slots,
  which pulls against the 15-min slot model. Keep v1 list-based.

#### A2. Hot-desking with floor-plan view

- **What:** An SVG floor map where desks/rooms are clickable shapes colored by live
  free/busy status; tap to open the existing booking wizard pre-filled.
- **Why now:** The app already renders arbitrary SVG via data-URIs as its core UI technique
  (`ButtonProperties` etc. prove the pipeline), and `RoomsBrowseBase.StatusKey` already
  computes the color-state per resource. A floor plan is "one more generated SVG" fed by an
  existing named formula — most Canvas App teams would need PCF; Harry doesn't.
- **Effort:** M.
- **First step:** Hand-draw one floor as an inline SVG formula with 6 `rect`s filled from
  `RoomsBrowseBase.StatusKey`, displayed in an Image control with a tap-to-lookup on X/Y.
- **Risk:** Hit-testing on a single Image control is coordinate math (fiddly on responsive
  layouts); per-shape controls don't scale past ~50 desks. Prototype hit-testing first.

#### A3. Visitor management / front-desk companion

- **What:** A lightweight second app (or screen) — pre-register a visitor against a booking,
  front-desk check-in list for today, host notification. `Book_Visitors` list keyed on
  BookingID.
- **Why now:** `TodayBookings` is already the exact read model a reception screen needs;
  bookingDetail is the natural place for "add visitor"; the mock-seed + PROD-REVERT process
  makes adding a list low-ceremony. Visitor management is also the classic upsell in every
  commercial room-booking product (Robin, Envoy) — it is the market-validated adjacent step.
- **Effort:** M.
- **First step:** Add `Book_Visitors` schema JSON + mock seed (D1 process), and a visitors
  section on bookingDetail.
- **Risk:** Real visitor management wants badge printing/GDPR retention — stay "expected
  visitors list" scope. Notification depends on MS2/Office365 wiring.

#### A4. Ship the series/recurrence feature (already specced)

- **What:** Implement `docs/superpowers/specs/2026-07-30-series-bookings-design.md` —
  Weekly/BiWeekly/Monthly, 2–12 occurrences, Clash status, Series tab in myBookings.
- **Why now:** Spec approved, data model decided (flat columns), `MyBookings` already
  includes `Status = "Clash"` rows — the app half-expects it. This is the highest-value
  *product* gap versus commercial tools, and it unblocks credibility for any resale play (d).
- **Effort:** M (plan exists to be written; modal bug root cause already diagnosed).
- **First step:** Run the writing-plans flow against the approved spec.
- **Risk:** Known modal output-property evaluation-order trap (the diagnosed
  reset-before-read bug); the spec supersedes the current mechanism, so build to spec, don't
  patch the toggle.

### (b) Integrations

#### B1. Outlook/Teams calendar sync via Power Automate

- **What:** Flow on `Book_Bookings` create/modify/cancel → create/update/delete an Outlook
  event (and Teams meeting link) for BookedByEmail; optionally write-back a `CalEventId`
  column for round-trip.
- **Why now:** Bookings already carry everything an event needs (Title, Start/End UTC —
  MS4 fixed the site to UTC precisely so times are trustworthy — BookedByEmail as plain
  delegable text). SharePoint triggers make this zero-app-change: the flow is additive, so
  it doesn't touch the guarded publish path at all.
- **Effort:** S for one-way push; M for two-way (needs conflict semantics vs `fnOverlaps`).
- **First step:** One flow: "When an item is created in Book_Bookings → Create event (V4)",
  on the prod-replica site, storing EventId in a new column.
- **Risk:** Two-way sync is a genuinely hard distributed-systems problem (room mailboxes,
  external edits). Do not promise "sync"; promise "your bookings appear in your calendar".
  Cancellation paths must respect the soft-delete Status convention, not deletes.

#### B2. Room-door QR / digital signage

- **What:** A per-room "door view" — free/busy now, next booking, book-now-for-30-min — as
  a QR code on the door linking to the app deep-linked to that room, and/or a cheap tablet
  showing a kiosk screen.
- **Why now:** `RoomsBrowseBase` already computes exactly the door-display strings
  ("Busy until 14:30", "Free until 15:00") per room. Canvas Apps support URL parameters
  (`Param("roomid")`) — a kiosk screen is one new screen reusing existing formulas. QR
  generation is a static one-off per room.
- **Effort:** S (deep-link + kiosk screen) — the cheapest visible "wow" on this list.
- **First step:** Add `Param("room")` handling in App.OnStart → navigate to Rooms with the
  room preselected; print one QR.
- **Risk:** Kiosk licensing (a tablet running Canvas Apps needs a signed-in account);
  screen burn-in/timeout on tablets. Signage-grade product needs the Power Pages/web route
  instead.

#### B3. n8n automation pack (no-show detection, digest, housekeeping)

- **What:** An n8n workflow bundle against the SharePoint REST API: (1) nightly digest of
  tomorrow's bookings per user (the `NotifyDigest` setting already exists in
  `MockUserSettingsSeed`); (2) no-show candidate flagging (bookings whose start passed with
  no check-in — pairs with B2's QR as the check-in signal); (3) stale-Clash nagging once A4
  ships.
- **Why now:** Harry has n8n MCP tooling wired into his environment already; the
  Book_UserSettings schema was *designed* with notification preferences
  (NotifyConfirm/Cancel/Reminder/ReminderMinutes/Digest) that currently drive nothing —
  the automation pack is the missing consumer that justifies wiring MS1.
- **Effort:** S per workflow.
- **First step:** Build the digest workflow against the prod-replica site (list IDs are in
  memory/prod-replica-sharepoint.md) sending to harry only.
- **Risk:** Auth (app registration for SharePoint from n8n); duplicate-notification
  storms — idempotency keys per booking per notification type from day one.

### (c) Data plays

#### C1. Utilization dashboard (Power BI on the SharePoint lists)

- **What:** Power BI report over `Book_Bookings`: utilization by room/day/hour heatmap,
  booking lead time, meeting-size vs room-capacity mismatch ("6 people booked the 20-seat
  room"), cancellation rates.
- **Why now:** The hard part of utilization analytics is clean interval data with a policy
  window — and the app's write path already enforces slot alignment, `MaxBookingMinutes`,
  overlap rejection, and soft-delete (Cancelled rows are *retained*, which is exactly what
  analytics needs and what naive Remove()-based apps destroy; WS4 retired Remove()
  deliberately). `RoomOccupancyToday` is the in-app teaser; Power BI is the same formula
  over history. Zero app changes.
- **Effort:** S for a first report; M for a polished workspace with RLS.
- **First step:** Power BI Desktop → SharePoint Online List connector → Book_Bookings on
  the replica site; rebuild `RoomOccupancyToday` as a DAX measure over an hour-grain date
  table.
- **Risk:** SharePoint connector refresh limits at scale (fine at this volume); privacy —
  `IsPrivate` bookings must be masked in shared reports, mirroring the app's own handling.

#### C2. Occupancy forecasting + "right-size your estate" narrative

- **What:** Forecast per-room demand (day-of-week/hour seasonality is enough; no ML
  required initially) and surface "book-ahead pressure" — e.g., recommend which rooms to
  convert to desks. Later: suggest better-fit rooms at booking time ("Room 3 fits 4 and is
  free — the 12-seater you picked is the only big room").
- **Why now:** Needs C1's history accumulation, which starts the day the app is live — an
  argument for going live soon. The recommendation variant reuses `FindRooms` capacity/
  equipment filtering plus `fnOverlaps` — it's a Sort over an existing named formula.
- **Effort:** M (forecast report); S for the in-app "better fit" nudge.
- **First step:** Add the "better fit" suggestion to the wizard's confirm step: cheapest
  room satisfying capacity+equipment that is free for the slot.
- **Risk:** Forecasting with 6 rooms and 18 seed bookings is noise; frame it as a
  capability demo until months of real data exist.

#### C3. No-show / ghost-meeting detection

- **What:** Identify recurring bookings that nobody attends (the #1 utilization killer in
  real estates) and auto-release rooms 10 minutes after start absent a check-in.
- **Why now:** Becomes possible the moment B2 (QR check-in) and A4 (series) exist — the
  data model addition is one `CheckedInAt` column. The `Status` text convention extends
  naturally (`Released`).
- **Effort:** M (depends on B2 + a release automation from B3).
- **First step:** Add `CheckedInAt` to the schema JSON and a "Check in" button on
  bookingDetail visible during the booking window (`fnIsPast` negation already exists).
- **Risk:** Auto-release is politically hot in a real org; ship as report-only first,
  auto-release behind a setting.

### (d) Platform plays

#### D1. Package `tools/` as its own product: "the missing CI for Canvas Apps"

- **What:** Extract pa-lint, canvas-guard, pac-verify, prod-revert, sarif-diff,
  pack-msapp, commit-msg-lint + RULES.md template + pa-process-init installer into a
  standalone repo — open-source core, with either paid support, a hosted dashboard, or a
  GitHub Action wrapper as the commercial layer.
- **Why now:** It already *is* a product: versioned (TOOLKIT-VERSION, provenance-stamped),
  tested (102/102), zero-dependency Node, documented with README-per-tool, and installable
  into any repo via the pa-process-init skill. The pain is universal and acute — every
  Power Apps team doing source control hits "compile is a publish, last writer wins, no
  local lint," and Microsoft's own tooling (pac CLI, Power Platform pipelines) does not
  cover the lint/guard/verification-decay layer at all. AI-assisted Power Apps development
  (Canvas MCP is now official) makes the guard-rails story *more* valuable, not less: this
  kit is precisely "how to let agents write Power Fx without them clobbering prod." The
  defect-class-earned-each-check framing (each lint rule cites the failure that earned it)
  is a credibility machine.
- **Effort:** M to a public v0.1 (extraction, de-project-ification, docs); L to commercial.
- **First step:** New repo `pa-process` (or similar); move tools + tests + RULES template;
  make `pa-lint` runnable as `npx` against any `pac canvas unpack` or MCP-sync tree; write
  the README around one story: "the publish that ate a day's work."
- **Risk:** Microsoft could ship overlapping tooling (they have repeatedly not, for years —
  and the guard/verification-ledger concept is opinionated enough to survive); maintenance
  gravity of OSS; the pa-lint checks encode `.pa.yaml` dialect details that drift with
  Studio versions — pin and test against dialect versions early.

#### D2. Templatize the app for resale/consulting

- **What:** A "SharePoint-only room booking" template: the app + list provisioning script
  (the m365 CLI provisioning is already proven in MS3) + deploy runbook, sold as a
  fixed-price install or listed free as a consulting lead magnet. Target: SMBs on M365 who
  won't pay Robin/Skedda per-seat but already pay for SharePoint.
- **Why now:** The REVERT-CONTRACT discipline means the sandbox→prod transformation is
  *mechanized* — exactly what a repeatable install needs. pack-msapp gives a distributable
  `.msapp`. The Carbon theming makes it demo unusually well versus stock Canvas Apps. The
  main gap for "template" status is finishing MS1/MS2 wiring and A4.
- **Effort:** M (productize provisioning + import docs; note the CLAUDE.md caveat: a
  production pack needs `pac canvas unpack` structure — Controls/References/Properties.json —
  not just the MCP sync tree).
- **First step:** Do one end-to-end clean install into a second SharePoint site from the
  runbook alone, timing it and logging every manual step.
- **Risk:** Crowded category with free templates from Microsoft; differentiation is
  quality + no-Dataverse-license cost + the install service, not the idea. Support burden
  if given away without a wedge.

#### D3. Content: "AI-safe Power Apps engineering" series

- **What:** Blog/YouTube series from the artifacts: the msapp backslash zip discovery, the
  named-formulas-as-read-models pattern, the SVG data-URI design-system technique, the
  verification-decay ladder, letting Claude/agents co-author a Canvas App with guard rails.
  Each of these is genuinely novel material in the Power Platform content space.
- **Why now:** The material is already written — RULES.md, the audit docs, tool READMEs are
  80% of the posts. Content is the demand engine for D1 and D2 and costs no code. The
  "agentic Power Apps development" angle is early: almost nobody is publishing on
  MCP + Canvas Apps process discipline yet (the Canvas MCP is new; the failure modes Harry
  has catalogued are exactly what the incoming wave will hit).
- **Effort:** S per piece, ongoing.
- **First step:** Publish "A .msapp is a zip with backslash entry names (and other things
  the docs won't tell you)" — self-contained, high-search-value, links to the repo.
- **Risk:** Low. Main cost is attention; main risk is publishing tenant-identifying details
  (scrub app/environment IDs).

### (e) AI angles

#### E1. Natural-language booking ("book me a room for 6 with a screen tomorrow at 2")

- **What:** An NL front door that parses intent → capacity/equipment/time → calls the
  existing availability logic → confirms → writes the booking. Delivery options: Copilot
  Studio agent in Teams writing to the SharePoint lists, or an n8n/Claude-API webhook doing
  the same.
- **Why now:** The hard 80% is *not* the NLU, it's correct availability/conflict/policy
  logic — and that exists as centralized, reusable formulas (`fnOverlaps`, `FindRooms`,
  slot/`MaxBookingMinutes` policy) with a matching list schema an external agent can query
  directly. Because writes go to SharePoint (not through the app), the agent needs only to
  replicate the write contract (Status/BookedByEmail/UTC conventions), which
  REVERT-CONTRACT and schema/*.json document precisely. UTC site settings (MS4) remove the
  classic time-zone-parsing failure mode.
- **Effort:** M. (S for a read-only "is there a room at 2?" agent — do that first.)
- **First step:** Read-only Copilot Studio (or Claude tool-use) agent with one tool:
  query Book_Bookings + Book_Rooms and answer availability questions; validate answers
  against the Find screen.
- **Risk:** Double-booking race between agent-writes and app-writes (no server-side
  uniqueness on SharePoint) — mitigate with a re-check-then-write pattern and, later, a
  Clash-status sweep (A4's mechanism generalizes). Don't let the agent write until its
  read answers match the app for a week.

#### E2. Meeting-room concierge agent (the ops layer)

- **What:** A standing agent that watches the lists and acts: resolves Clash rows by
  proposing alternatives, offers released rooms to waitlisted users, answers "why can't I
  book X", nudges serial no-shows. Effectively B3 + C3 + E1 fused with an LLM policy layer.
- **Why now:** Every ingredient is on this list already (statuses as a text state machine,
  named-formula read models, n8n plumbing, NL layer). It is also the natural *demo* for the
  D1/D3 story: "an agent operating a production business app safely, because the process
  layer makes it safe" — the toolchain and the AI angle sell each other.
- **Effort:** L (sequenced after A4, B3, E1).
- **First step:** None directly — sequence via E1 read-only agent + B3 digest workflow.
- **Risk:** Autonomy on a shared calendar is trust-sensitive; every action proposes, human
  confirms, until earned. Cost/latency of a standing LLM loop — trigger on list changes,
  not polling.

---

## 3. Top 5 (ranked)

| # | Opportunity | Why it wins |
|---|-------------|-------------|
| 1 | **D1 — Package the `tools/` toolchain as "CI/guard rails for Canvas Apps"** | The most differentiated asset in the repo, already versioned/tested/installable; universal pain; perfectly timed with the agentic-Power-Apps wave; the app becomes its reference customer. |
| 2 | **D3 — Content series (feeds D1/D2)** | Near-zero marginal cost (material already written), genuinely novel topics, and it is the distribution channel every other play needs. Start this week. |
| 3 | **B1 + B2 — Outlook sync + QR door deep-links** | Two S-effort, zero-publish-risk (additive flows / one param) integrations that convert the app from "internal tool" to "thing people would actually adopt", and B2's check-in unlocks the whole data play (C3). |
| 4 | **A4 — Ship series bookings** | Spec approved, model decided, app already anticipates Clash rows; it's the credibility gate for template/resale (D2) and the prerequisite for the concierge (E2). Momentum play. |
| 5 | **E1 — NL availability agent (read-only first)** | Cheapest credible AI angle because the domain logic already exists as reusable formulas over documented lists; read-only scoping kills the risk; upgrades to write-path later and headlines the D3 content. |

**Sequencing note:** 2 → 3 → 4 can run in parallel with 1; C1 (Power BI) is the best "quiet
background" item since its value compounds with every day of real booking data — which argues
for finishing MS1/MS2 and going genuinely live sooner rather than later.
