# UI/UX Review — booking-tool Canvas App

- **Date:** 2026-07-31
- **Source reviewed:** `.scratch/overnight-20260731/sync` (fresh `sync_canvas` of the live app)
- **Scope:** static read of `.pa.yaml` control trees only — no rendering, no Studio session. Positioning, colour and visibility findings are derived from formulas, so anything dependent on runtime data (actual row counts, text overflow) is flagged as inferred.
- **Method:** all files read in full: `App.pa.yaml`, `Home`, `Find`, `Rooms`, `myBookings`, `bookingDetail`, `Profile`, `Components/Shell_Header`, `Components/cpt_Modal_`.

Severity: CRITICAL / HIGH / MEDIUM / LOW.
Tag: **SAFE** = cosmetic/mechanical formula change; **RISKY** = requires layout restructure or touches shared behaviour.

---

## 1. Theming architecture (App.pa.yaml)

The app **does** have a real theme system, and most screens use it:

- `App.Formulas` defines `ColourTokens` (raw hex), `ThemeMap` (Light/Dark records), and `AppTheme = If(glbIsDarkMode, ThemeMap.Dark, ThemeMap.Light)` (App.pa.yaml:123–291).
- `ThemeHex` is a URL-encoded mirror for SVG data-URIs (App.pa.yaml:295–297) with a "KEEP IN SYNC" comment — a manual-sync hazard by design.
- SVG-composited controls (`ButtonProperties`, `TileProperties`, `ContentSwitcherItem`) pull from `AppTheme`, so the fake-control pattern is at least token-driven.

### Findings

**F-01 · HIGH · SAFE — The Dark theme token set is not dark.**
`ColourTokens.Dark.Background = "#ffffff"`, `layer01Bg = "#f4f4f4"`, `BorderSubtle = "#ffffff"` (App.pa.yaml:270–276), while `ThemeMap.Dark.TextPrimary = #f4f4f4` and `Surface = #161616`. If `glbIsDarkMode` is ever set true (it is `Set(glbIsDarkMode, false)` in OnStart, App.pa.yaml:591), every screen renders near-white text on white/light backgrounds (`AppTheme.Background`, `layer01Bg`, tiles). The dark theme is currently a booby trap, not a theme. Either populate the Dark tokens or remove the toggle path.

**F-02 · MEDIUM · SAFE — Mixed token types force inconsistent call sites.**
Some `AppTheme` members are `Color` values (`TextPrimary`, `Border`, wrapped in `ColorValue()` at definition), others are raw hex strings (`Primary`, `ButtonPrimary`, `TileBg`, `PrimaryText`). Screens therefore mix `Color: =AppTheme.TextPrimary` with `Color: =ColorValue(AppTheme.ButtonPrimary)` — easy to get wrong and the root cause of F-10 below. Normalising all tokens to `Color` (keeping string mirrors only for SVG) would remove a whole error class.

**F-03 · MEDIUM · SAFE — Off-palette hardcoded colours bypass the theme.**
Representative sites (not exhaustive):
- Every screen: `LoadingSpinnerColor: =RGBA(0, 120, 212, 1)` — Fluent blue, not Carbon `#0f62fe` (Home:5, Find:5, Rooms:5, myBookings:5, bookingDetail:5, Profile:5).
- `Rooms.btn_LoadTimeline` Fill `RGBA(0,120,212,1)` + hover `RGBA(16,110,190,1)` (Rooms.pa.yaml:1028–1032) — invisible control, but still off-palette.
- "View all" buttons hover `ColorValue("#0043ce")` (Home:481, 672, 877) — a Carbon blue-60 hover not present in the token map.
- Danger pressed/hover hexes `"#b81922"` / `"#921620"` inline (myBookings:711/728, bookingDetail:456/475) instead of `ButtonDangerActive`.
- `ButtonProperties` ghost text colour `"#0f62fe"` hardcoded inside the formula (App.pa.yaml:14).
- Home empty-state SVG bakes `#161616`, `#525252`, `#c6c6c6` (Home:590–595); header wordmark HTML bakes `#f4f4f4`/`#c6c6c6` (Shell_Header:95–96); avatar HTML bakes `#f4f4f4` (Shell_Header:403, Profile:102). None of these will follow a theme change.

**F-04 · LOW · SAFE — Semantic token misuse.**
`drpRoomsCapacity.SelectionFill: =AppTheme.ButtonDangerHover` (Rooms.pa.yaml:155) — a danger token used for list selection. `ThemeMap.*.FocusedBorder: Color.Red` (App.pa.yaml:139/201) is defined but the app actually uses `RGBA(15,98,254,1)` everywhere for focus — the token is dead and misleading.

**F-05 · LOW · SAFE — `glbSideNavIconStr` light/dark logic looks inverted.**
`If(!glbIsDarkMode, "rgba(198,198,198,1)", "rgba(82,82,82,1)")` (App.pa.yaml:310–313) gives light-grey icons in light mode and dark-grey in dark mode — the opposite of every other token pair. Currently unused-looking, but a trap.

---

## 2. Cross-screen layout & shell consistency

The shell pattern is genuinely consistent: every screen is `con_shell_*` (ManualLayout) → `Shell_Header` at 48px → body container at `Y = 48`, `Height = Parent.Height - 48`, padding 32 on all sides. `bookingDetail` and `Profile` constrain content to `Min(Parent.Width, 640)` — a nice reading-width pattern that Home/Find/myBookings do not use.

**F-06 · HIGH · SAFE — Header active-tab indicator desyncs from the actual screen.**
`Shell_Header` highlights the tab matching `gblUI_Nav_currentTab`, and its own nav buttons set it. But several in-screen routes navigate without updating it:
- Home `btnTileView → Navigate(Rooms)` (Home:295) and `btnTileMyBook → Navigate(myBookings)` (Home:381) — header still shows "Home".
- Home `btnNextViewAll → Navigate(myBookings)` (Home:485) — same.
- myBookings/series → `Navigate(bookingDetail)` — no tab state at all for the detail screen (arguably fine, but "Bookings" should stay lit; it only does if you arrived via the header).
The Find-bound routes do it correctly (`Set(gblUI_Nav_currentTab, "Find")`, Home:676/796/881), which proves the intended pattern. Fix is mechanical: set the tab var in the four `OnSelect`s that miss it.

**F-07 · MEDIUM · SAFE — Home body has asymmetric gutters.**
`conHomeBody` sets `PaddingBottom: 24, PaddingRight: 24, PaddingTop: 16` but **no `PaddingLeft`** (Home.pa.yaml:56–58). Combined with the shell's 32px, the content sits 32px from the left but 56px from the right. Add `PaddingLeft: =24` or drop the right padding.

**F-08 · MEDIUM · SAFE — Find's local header is 100px tall for 44px of content.**
`con_header` Height 100 (Find.pa.yaml:43) vs Rooms' 64/48 headers and myBookings' 48 switcher row. Also `LayoutMinHeight/MinWidth: =16` here and on `con_rooms_view` (Rooms:63–64) are stray editor defaults every other container sets to 0.

**F-09 · LOW · SAFE — Corner radius is inconsistent by control family.**
Buttons are mostly radius 2, tiles/cards 0, equipment chips 12 (Rooms:243–246). Carbon is square-cornered; either 0 or 2 should win. Purely cosmetic.

**F-10 · LOW · SAFE — Screen `Fill` is hardcoded white instead of `AppTheme.Background`** on all six screens (`Fill: =RGBA(255, 255, 255, 1)`), duplicating what `conHomeBody`/`conMyBookingsBody` already do with the token. Harmless today; breaks with F-01 fixed.

---

## 3. Home

**F-11 · HIGH · RISKY — Room-status chips use hardcoded fractional widths and will clip/misalign at other window sizes.**
`rectChipBg.Width: =210.66666666666663` and `lblChipRoom/lblChipStatus.Width: =192.33333333333334` (Home.pa.yaml:744, 754, 776), with `btnChipOverlay.Width` also 210.67 — these are frozen Studio-drag artifacts of "TemplateWidth at one specific window size". In the WrapCount-3 gallery the template width actually varies with `Parent.Width`; at narrower widths chips overlap the next column, at wider widths they underfill. Should be `Parent.TemplateWidth - 4`-style formulas. (Same class of artifact: `lbl_textItemTitle.Width: =87.83333333333333` in cpt_Modal_:239, though that one is `Visible: false`.)

**F-12 · MEDIUM · SAFE — Chips gallery hides overflow.**
`galRoomChips` Height 120, TemplateSize 60, WrapCount 3, `ShowScrollbar: =false` (Home:698, 716–719) → exactly 6 chips visible; a 7th+ room is reachable only by undiscoverable scroll. Same pattern on `galOccupancy` (Height 192 / TemplateSize 32 → 6 rows, scrollbar hidden, Home:896–908).

**F-13 · MEDIUM · SAFE — Empty-state SVG distorts and ignores the theme.**
`img_nextemptystate_` renders an 800×100 viewBox with `ImagePosition.Stretch` into `Parent.Width × 140` (Home:578–599) — aspect distortion at nearly any width, baked light-theme colours (F-03), text not localisable. Also, inside `conPanelRow` (Height 208) the available inner height is ~136px, so the 140px image slightly overflows its column. A Label-based empty state (like myBookings uses) would be strictly better.

**F-14 · MEDIUM · RISKY — Fixed 220px action tiles have no responsive behaviour.**
`con_TileBook/View/MyBook` are each `Width: =220` in a horizontal AutoLayout with gap 4 (Home:94, 238, 324). Rooms screen has real breakpoints (`If(App.Width < 768, …)`, WrapCount by width — Rooms:106–108, 262); Home and Find have none. Below ~750px app width the third tile clips. Inconsistent responsive strategy across sibling screens.

**F-15 · LOW · SAFE — Hidden-label + SVG-image + overlay-button "tile" pattern costs 4 controls per tile.**
`lbl_TitleTileBook`/`lbl_SubTileBook` exist only as invisible text feeders for `TileProperties` (Home:96–130). Works, and the overlay `Classic/Button` carries good accessible text ("Book a room — start a new booking") — noted as a consistency positive; but hover feedback differs between tiles: `btn_TileBook` HoverFill 0.08 opacity vs 0.04 on the other two (Home:150 vs 294/380).

---

## 4. Find

**F-16 · CRITICAL · SAFE — Week-view booking counts are white text on a light-grey cell: illegible.**
`conWeekBlock_v2.Fill: =AppTheme.layer01Bg` (light theme: `#f4f4f4`) and `lblWeekCount_v2.Color: =ColorValue(AppTheme.PrimaryText)` where `PrimaryText` is `"#ffffff"` (Find.pa.yaml:579, 592). White on `#f4f4f4` is ~1.07:1 — the "N bookings" line in every week cell is effectively invisible. The sibling `lblWeekFree_v2` uses `TextMuted` and is fine, which suggests the intent was `TextPrimary`, not `PrimaryText` — the token names are one word apart and this is exactly the confusion F-02 predicts. Same misuse is *correct-by-luck* in `lblBookingTitle_v2` (Find:457) only because its container is filled with `HeaderBackground` (blue).

**F-17 · MEDIUM · SAFE — Day/Week booked block uses `HeaderBackground` as a data colour.**
`conSlotBlock_v2.Fill: =AppTheme.HeaderBackground` (Find:442) — the brand/header token doubles as "busy" state. Rooms' own timeline uses `HeaderAccent`/`StatusFreeBg` for the same semantic (Rooms:848). Two different colour languages for "booked" between the two timeline screens.

**F-18 · MEDIUM · SAFE — Find header lacks the affordances Rooms' timeline header has.**
Rooms timeline: Today button (disabled when already today — good), ModernDatePicker, prev/next (Rooms:670–746). Find: prev/next arrows and a static date label only (Find:53–84) — no Today, no picker, so returning to today after paging weeks takes many clicks. Same journey, different controls.

**F-19 · MEDIUM · SAFE — No loading feedback while the timeline grid is rebuilt.**
`btnLoadFindBookings.OnSelect` does heavy multi-pass `ForAll`/`Collect` work (Find:154–240) triggered from OnVisible, arrows, dropdowns and week cells; there is no spinner/skeleton and the previous grid stays visible until the rebuild lands. On slow rebuilds users see stale data with no signal. (The modal has a `varRebuilding` label; the screens have nothing.)

**F-20 · LOW · SAFE — Duplicated inline chevron assets.**
The prev/next arrow base64 SVG is pasted 4× (Find:59, 81; Rooms:705, 741) despite `ShellIconSet` existing precisely to de-duplicate shell icons (App.pa.yaml:299–306).

**F-21 · LOW · SAFE — Empty state only covers "no rooms".**
`lbl_textFindEmptyState` (Find:651–662) handles empty `FindRooms`/`colRooms`, but a day where every room is fully booked shows only solid blue blocks with no "no free slots" message; fine, but the free-slot buttons are the only interactive elements and can all disappear.

---

## 5. Rooms

The browse view is the most mature screen: real breakpoints (toolbar stacks under 768px, card grid WrapCount 4/2/1 — Rooms:106–108, 262), a proper empty state with a "Clear filters" recovery action (Rooms:528–573), result-count summary line, and selected-state borders on cards. Noted as the pattern the other screens should converge on.

**F-22 · MEDIUM · SAFE — Availability strip is colour-only and the mapping is counter-intuitive.**
`rectRoomsAvailabilitySegment.Fill: =If(ThisItem.IsBooked, AppTheme.TextMuted, AppTheme.HeaderAccent)` (Rooms:409) — booked = mid-grey, free = pale blue. No legend, no text alternative, and grey-vs-pale-blue is a weak pair for colour-vision deficiency. The status dot (`lblRoomsCardStatusDot`, Rooms:517–527) is also colour-only but is backed by the adjacent `StatusText`, which is the right pattern — the strip has no such backup.

**F-23 · MEDIUM · SAFE — Timeline header summary is 70% white on brand blue at size 10.**
`lblHeaderSummary.Color: =RGBA(255,255,255,0.7)` on `HeaderBackground` `#0f62fe` (Rooms:655–659) ≈ 3.5:1 at 10pt — below WCAG 4.5:1 for small text.

**F-24 · MEDIUM · SAFE — Rooms.OnVisible resets every filter on each visit** (Rooms:6–17): search text, capacity, sort, availability toggle, equipment chips. Navigating Home → Rooms → Home → Rooms loses all filter state; combined with `Reset()` only happening via "Clear filters", the reset-on-entry makes the toolbar state feel unreliable. Deliberate? If so, cheap to keep; if not, remove the resets.

**F-25 · LOW · SAFE — "View week" is a permanently disabled button** with tooltip-only explanation (Rooms:1187–1203). Acceptable as a roadmap placeholder, but tooltips don't exist on touch; the pattern used for it (visible + disabled + tooltip) differs from how every other unfinished feature is handled (hidden: `con_Header_Search` Visible false).

**F-26 · LOW · SAFE — Overlapping labels at Y=124.**
`lblRoomsStripMid` (centered, full width), `lblRoomsStripStart` (left, w59) and `lblRoomsStripEnd` (right) all sit at Y=124 (Rooms:297–434). At narrow template widths the centered midpoint time will collide with the start/end captions. Inferred; verify at 1-column breakpoint.

---

## 6. myBookings

Good: three-state content switcher with "(selected)" appended to SR text (myBookings:146, 213, 280), inline destructive-action confirm (Cancel series → Keep/Yes pair), empty states for both list modes with a recovery CTA.

**F-27 · MEDIUM · RISKY — Series card action layout breaks at narrow widths.**
Buttons are absolutely placed at `X: =Parent.Width - 264 / -144 / -128` and text labels sized `Parent.Width - 280` (myBookings:562, 574, 586, 642, 669, 696, 737). Below ~600px screen width the label widths go ≤0 and the two button clusters overlap the text block. There is no breakpoint handling on this screen at all (contrast Rooms).

**F-28 · MEDIUM · SAFE — "Book a room" CTA colour handling is inconsistent with itself.**
`btnEmptyBook` hardcodes hover/pressed `RGBA(13,83,217,1)` / `RGBA(11,69,182,1)` (myBookings:467, 502) while its Fill uses the token — same-button mixed sourcing (part of F-03 but called out because this is the primary CTA).

**F-29 · LOW · SAFE — Clash badge width is fixed at 176px for a fixed English string** (myBookings:383–397). Fine today; will truncate on any copy change since `Wrap: =false` and `Align.Center`.

**F-30 · LOW · SAFE — Occurrence rows use `Height: =Parent.TemplateHeight` labels for vertical centering** (myBookings:805, 817) — works, but the row overlay button (`btnOccOverlay`) duplicates all row text into its own `Text`; if the row copy changes, two formulas must change. Consistent with the app-wide overlay pattern though.

---

## 7. bookingDetail

Clean caption/value field pattern (`capX`/`valX`, muted 11pt over primary 14pt) applied uniformly; destructive flow (Cancel → inline confirm → scope prompt for series) is well-affordanced with distinct warn/danger palettes; all buttons carry real text. Best-behaved screen in the app.

**F-31 · MEDIUM · SAFE — "Past" status badge fails contrast.**
`lblStatusBadge` past-state: `Color: =AppTheme.TextMuted` (`#6f6f6f`) on `Fill: =AppTheme.Border` (`#e0e0e0`) (bookingDetail:140–141) ≈ 2.9:1 at 11pt — below 4.5:1. The upcoming-state (white on `ButtonPrimary`) is fine.

**F-32 · LOW · SAFE — `conCancelZone` declares `Height: =180` *and* `LayoutMaxHeight: =110`** (bookingDetail:287, 292) with `LayoutJustifyContent.End` — contradictory constraints that happen to work in AutoLayout (max wins) but read as leftover tuning. Mechanical cleanup.

---

## 8. Profile

**F-33 · HIGH · SAFE — The entire Notifications section is disabled with zero explanation.**
Every toggle (`tglSetNotifyConfirm/Cancel/Reminder/Digest`) and its label carries `DisplayMode: =DisplayMode.Disabled` (Profile:163, 203/215, 260, 304, 400), yet each has fully wired OnCheck/OnUncheck handlers, and `lblNotifCaption` — the obvious place for "coming soon" copy — has `Text: =` **blank** (Profile:180). Users see a grey, dead settings panel that looks broken, not unreleased. Either enable them (handlers exist and write to `colUserSettings`) or put one sentence in the caption. Also note `drpReminderMinutes` is *not* disabled (Profile:344–365) while its gating toggle is — so the visible-if-checked row can never appear, but the inconsistency will bite when the toggles are re-enabled.

**F-34 · HIGH · SAFE — "Report a problem" is a primary-styled button that does nothing.**
`OnSelect: =false /* placeholder */` (Profile:537) with full hover/pressed states. A no-op that looks like the most important action on the card. Disable it with a reason, or hide it.

**F-35 · MEDIUM · SAFE — Identity card layout formulas contradict the container.**
`lblProfileName`/`lblProfileEmail` carry `X: =40, Y: =40` inside an AutoLayout container (Profile:120–121, 133–134) — ignored at runtime, but misleading; and `conProfileIdentity` is `LayoutDirection.Vertical` with `LayoutMaxHeight: =120` (Profile:65–68) holding an avatar *row* whose children (avatar + name + email) are in a nested horizontal container — the name/email stack vertically **beside** the avatar only because they're `FillPortions: 1` in a horizontal box; email and name both render in the same row space. Inferred risk: name and email overlap or sit side-by-side rather than stacked (two `FillPortions: 1` labels in one horizontal container split the width 50/50). Verify in Studio; if confirmed, wrap name+email in a vertical child container. Tagged RISKY for the fix itself: **RISKY**.

**F-36 · LOW · SAFE — Toggles have no accessible name.**
All four toggles set `Label: =` blank; the visible text lives in a separate Label control (Profile:211–216 etc.). Screen readers announce an unnamed switch. Modern Toggle supports its own label (visually hideable); or add `AccessibleLabel`. (Same issue in cpt_Modal_: `tglPrivate`, `tglBookOnBehalf` — cpt_Modal_:1313–1319, 1360–1366.)

---

## 9. Shell_Header (component)

**F-37 · HIGH · SAFE — The avatar button is an unnamed interactive control.**
`btn_Header_Avatar` has `Text: =` blank and no `AccessibleLabel` (Shell_Header:411–427). It is the only route to Profile in the whole app. Keyboard/SR users get an anonymous button; sighted users get a 48×48 target with no tooltip either. Add `AccessibleLabel: ="Profile — " & User().FullName`.

**F-38 · MEDIUM · SAFE — Nav width is fixed, not responsive.**
Wordmark 192 + nav 360 + spacer + global bar 144 (Shell_Header:102, 116, 304). Under ~700px the four 96px tabs compress via the spacer only; there is no overflow/hamburger behaviour (the hamburger exists but is `Visible: =false`, Shell_Header:60). Consistent with F-14: no mobile strategy.

**F-39 · LOW · SAFE — Dead chrome shipped in the header.**
Search and Notification buttons fully built but `Visible: =false` (Shell_Header:318, 357); menu button likewise. Also `rct_Header_Spacer.Width: =` (blank formula, Shell_Header:288) — relies on default. Mechanical cleanup only.

**F-40 · LOW · SAFE — Active-tab underline is 3px at Y=45 inside a 48px row** — fine — but the tab's active treatment is `FontWeight.Semibold` vs `FontWeight.Lighter` (Shell_Header:140 etc.). Lighter-weight resting text at 14px on `#161616` is thin; Carbon uses regular resting weight. Cosmetic.

---

## 10. cpt_Modal_ (booking wizard component)

Strong points: centered card `Min(Parent.Width, 560)` with computed X/Y (cpt_Modal_:87–92) — the only truly size-adaptive surface in the app; validation errors are inline, per-field, with reserved-height formulas so the layout doesn't jump; `lbl_textConfirmDisabledReason` (cpt_Modal_:1532–1553) explains *why* Confirm is disabled — an excellent pattern.

**F-41 · HIGH · SAFE — "Show as busy" and "Booking for someone else?" are permanently disabled but still load-bearing.**
`tglPrivate` and `tglBookOnBehalf` both have `DisplayMode: =DisplayMode.Disabled` (cpt_Modal_:1316, 1363), yet `ValidPayload` gates on `tglBookOnBehalf.Checked` (cpt_Modal_:53), the payload writes `IsPrivate: tglPrivate.Checked` (cpt_Modal_:1823), and Profile's privacy copy promises "…unless you choose 'Show as busy' when booking" (Profile:519). The UI advertises and documents features the user cannot reach. Same class as F-33; the copy contradiction upgrades it.

**F-42 · HIGH · SAFE — On step 2, Next disables with no visible reason.**
`btnNext.DisplayMode` has a 7-clause disable condition including the Mon–Fri rule and the 4-hour cap (cpt_Modal_:1693), but the explanatory hint `lblStep2Hint` — which states exactly those rules — is `Visible: =false` (cpt_Modal_:925), and the disabled-reason label only exists on step 3. A user picking a Saturday or a 5-hour span on step 2 just sees a dead Next button. Re-enable the hint or move the reason label to step 2.

**F-43 · MEDIUM · SAFE — The "Booking your slot…" progress row can never be seen.**
`conProgressBar.Visible: =varSubmitting` (cpt_Modal_:144), but `btnConfirm.OnSelect` sets `varSubmitting` true and back to false within one synchronous formula (cpt_Modal_:1738, 1847). There is no frame where it renders. Either drop it or restructure the submit so the flag survives until the host's OnSubmit completes.

**F-44 · MEDIUM · SAFE — Alternative-room rows: unnamed button, empty detail label.**
`btnSelectAltRoom` has `Text: =""` and no AccessibleLabel (cpt_Modal_:1188) — selecting an alternative room is invisible to SR users; `lbl_textAlternativeRoomDetails.Text: =""` (cpt_Modal_:1145) renders an empty line reserved in every row. Also selecting an alt room updates `varSelectedRoom` but does **not** recompute `varAlternativeRooms`/`varNextFreeSlot`, so the panel can show the now-chosen room in its own alternatives list until conflict state clears.

**F-45 · MEDIUM · SAFE — Footer offers both "Cancel/Back" and "Close" doing overlapping things.**
`btnBack` (Cancel on step 1, Back otherwise) and `btnClose` sit adjacent with identical secondary styling (cpt_Modal_:1578–1674); on step 1 both perform the same full reset-and-close. Two same-looking buttons, one label pair of which ("Cancel" vs "Close") is a distinction without a difference. The scrim click is a third close affordance with slightly different behaviour (straight to confirm on later steps — same as Close). Collapse to one.

**F-46 · LOW · SAFE — Conflict mini-timeline is anchored to the conflicting booking, not the requested slot.**
`galConflictTimeline` items are 7 half-hour slots centred on `varConflictingBooking.StartDateTime` (cpt_Modal_:1032–1038) with fixed Height 280 / TemplateSize 40. If the user's requested time is late in a long conflicting booking, their requested window may fall outside the 3.5-hour strip. Minor comprehension gap.

**F-47 · LOW · SAFE — Default custom-property junk is user-visible in the tree.**
`ModalTitleText` default "Add a new Role to the Database" (cpt_Modal_:11), `HeaderNavTab: ="Text"`, `OnSubmitEdit: ="Text"` defaults — screens pass `ModalTitleText: =` (blank) and the header ignores `HeaderNavTab` entirely. Dead API surface on both components.

---

## 11. Cross-cutting

### Typography

**F-48 · MEDIUM · SAFE — Three font systems coexist.**
- `Font.Lato` — most labels/buttons on Home, Find (partial), myBookings, bookingDetail, Profile, cpt_Modal_.
- `"IBM Plex Sans"` string — the entire Rooms screen and Shell_Header nav buttons (Rooms:88 et al., Shell_Header:139).
- `CarbonFontFamily` (`IBM Plex Sans, Segoe UI, Arial`) — all SVG-rendered text (tiles, content switcher, wordmark, avatars).
So Home's tile titles render in IBM Plex (SVG) while the labels beside them are Lato; Rooms is Plex while myBookings is Lato. Pick one (the app's design language is Carbon → IBM Plex Sans) and sweep. Size scale is also ad hoc: 9, 10, 11, 12, 14, 15, 16, 18, 20 all appear; body text at 11 and captions at 9 (`lblRoomsEquipmentHeading`, Rooms:206) are small for 100% zoom.

### Accessibility summary

Positive: the invisible-overlay-button pattern consistently carries rich descriptive `Text` (chips, cards, rows, tiles) — SR output for galleries is genuinely good. Focus styling is a consistent 2px `#0f62fe` border everywhere. Date-nav images have `AccessibleLabel` + `TabIndex: =0`.

Gaps (rolled up):
- Unnamed interactive controls: header avatar (F-37), alt-room select (F-44), all Toggle controls (F-36), `ModernDatePicker` DatePicker2 (Rooms:711–721 — no AccessibleLabel).
- Contrast failures: F-16 (critical), F-23, F-31; borderline: `btnFreeSlot` muted-on-white at 11pt (Rooms:928, Find:492).
- Colour-only encodings: F-22 strip; Home chip status is colour+text (good); occupancy bar has % text (good).
- Touch targets: 24px-high "View all"/"Find a time" buttons (Home:479, 670, 875), 24px equipment chip buttons (Rooms:236), 28px series-action buttons (myBookings:628, 655, 709) — all below the 44–48px guidance the app itself follows elsewhere (48px inputs on Rooms toolbar).
- Tab order: not explicitly managed anywhere except the two arrow images; within ManualLayout cards the overlay button is declared last, which generally lands focus correctly after the visual content, but this is unverified from source.

### Responsiveness

One screen (Rooms browse) and one component (cpt_Modal_) are genuinely responsive; everything else is fixed-width: Home tiles (F-14), Home chips (F-11), Find header/toolbar, myBookings series cards (F-27), Shell_Header (F-38). At tablet widths the app will show clipping on Home and myBookings while Rooms adapts — an inconsistent story that is more jarring than uniformly-fixed layouts would be.

### State/feedback

Every write path uses `IfError` + `Notify` with success/warn/error variants and `App.OnError` traps the rest (App.pa.yaml:587–589) — solid. Gaps are the perceivable-loading ones: F-19 (Find rebuild) and F-43 (modal submit), plus the reset-on-visit surprise (F-24).

### Duplication (maintenance risk with UX consequences)

The ~150-line booking-create `OnSubmit` is pasted into three modal instances (Home:958, Find:678, Rooms:1240) with one behavioural divergence each (navigate home vs `Select(btnLoadFindBookings)` vs `Select(btn_LoadTimeline)`) — and Find's copy carries Rooms' comment ("Stay on Rooms —", Find:797). Divergence has already begun; any UX change to the submit flow now needs three edits. Same for the four pasted arrow SVGs (F-20) and the two identical time-dropdown conflict-recompute blocks inside cpt_Modal_ (drpStartTime/drpEndTime OnChange).

---

## Findings table

| ID | Sev | Tag | Screen/File | Summary |
|----|-----|-----|-------------|---------|
| F-16 | CRITICAL | SAFE | Find.pa.yaml:579,592 | Week-view booking count: white `PrimaryText` on `layer01Bg` — illegible (~1.07:1) |
| F-01 | HIGH | SAFE | App.pa.yaml:270–276 | Dark theme tokens are light values; enabling dark mode yields light-on-white app-wide |
| F-06 | HIGH | SAFE | Home:295,381,485 | Header active-tab indicator desyncs on 4 navigation routes that skip `gblUI_Nav_currentTab` |
| F-11 | HIGH | RISKY | Home:744,754,776,806 | Room chips hardcode fractional widths (210.67/192.33) — clip/misalign at other window sizes |
| F-33 | HIGH | SAFE | Profile:163–400 | Entire Notifications panel disabled with blank explanatory caption; looks broken |
| F-34 | HIGH | SAFE | Profile:537 | "Report a problem" primary button is a no-op (`OnSelect: =false`) |
| F-37 | HIGH | SAFE | Shell_Header:411–427 | Avatar button (only route to Profile) has no text and no AccessibleLabel |
| F-41 | HIGH | SAFE | cpt_Modal_:1316,1363; Profile:519 | "Show as busy" / "Book on behalf" toggles permanently disabled yet referenced by validation and privacy copy |
| F-42 | HIGH | SAFE | cpt_Modal_:925,1693 | Step-2 Next disables (weekend/4h rules) with no visible reason; hint label is `Visible: =false` |
| F-02 | MEDIUM | SAFE | App.pa.yaml:123–291 | Mixed Color/string theme tokens force inconsistent `ColorValue()` wrapping (root cause of F-16) |
| F-03 | MEDIUM | SAFE | all screens | Off-palette hardcoded colours: Fluent-blue spinners, `#0043ce` hovers, baked SVG/HTML hexes |
| F-07 | MEDIUM | SAFE | Home:56–58 | `conHomeBody` missing `PaddingLeft` — asymmetric gutters (32 left vs 56 right) |
| F-08 | MEDIUM | SAFE | Find:43 | Find local header 100px tall vs 48–64 elsewhere; stray `LayoutMin* =16` |
| F-12 | MEDIUM | SAFE | Home:698–719,896–908 | Chip and occupancy galleries hide scrollbars with fixed heights — rows beyond 6 undiscoverable |
| F-13 | MEDIUM | SAFE | Home:578–599 | Empty-state SVG stretched (800×100 → w×140), theme-blind, slightly overflows panel |
| F-14 | MEDIUM | RISKY | Home:94,238,324 | Fixed 220px tiles, no breakpoints; clips below ~750px while Rooms adapts |
| F-17 | MEDIUM | SAFE | Find:442 vs Rooms:848 | "Booked" colour language differs between Find and Rooms timelines |
| F-18 | MEDIUM | SAFE | Find:53–84 | Find header lacks Today button/date picker that Rooms timeline header has |
| F-19 | MEDIUM | SAFE | Find:154–240 | No loading indicator during timeline grid rebuild; stale grid shown |
| F-22 | MEDIUM | SAFE | Rooms:409 | Availability strip colour-only, counter-intuitive mapping (grey=busy, accent=free), no legend |
| F-23 | MEDIUM | SAFE | Rooms:655–659 | Timeline header summary 70% white on `#0f62fe` at 10pt (~3.5:1) |
| F-24 | MEDIUM | SAFE | Rooms:6–17 | OnVisible resets all browse filters every visit |
| F-27 | MEDIUM | RISKY | myBookings:562–737 | Series card fixed X offsets (`Parent.Width-264` etc.); labels go ≤0 width at narrow sizes |
| F-28 | MEDIUM | SAFE | myBookings:467,502 | Primary CTA mixes token Fill with hardcoded hover/pressed hexes |
| F-31 | MEDIUM | SAFE | bookingDetail:140–141 | "Past" badge `#6f6f6f` on `#e0e0e0` (~2.9:1) fails contrast |
| F-35 | MEDIUM | RISKY | Profile:97–134 | Identity card: two `FillPortions:1` labels in one horizontal box — name/email likely misplaced; stray X/Y in AutoLayout |
| F-43 | MEDIUM | SAFE | cpt_Modal_:144,1738,1847 | "Booking your slot…" progress row can never render (flag toggled synchronously) |
| F-44 | MEDIUM | SAFE | cpt_Modal_:1145,1173–1188 | Alt-room row: unnamed select button, empty detail label, stale alternatives after selection |
| F-45 | MEDIUM | SAFE | cpt_Modal_:1578–1674 | Redundant Cancel/Back + Close buttons with overlapping behaviour; scrim is a third variant |
| F-48 | MEDIUM | SAFE | app-wide | Font.Lato vs "IBM Plex Sans" vs SVG CarbonFontFamily; ad-hoc size scale incl. 9pt captions |
| F-04 | LOW | SAFE | Rooms:155; App:139 | Danger token as SelectionFill; dead `FocusedBorder: Color.Red` token |
| F-05 | LOW | SAFE | App:310–313 | `glbSideNavIconStr` light/dark branches appear inverted |
| F-09 | LOW | SAFE | app-wide | Corner radius 0 vs 2 vs 12 by control family |
| F-10 | LOW | SAFE | all screens | Screen Fill hardcoded white instead of `AppTheme.Background` |
| F-15 | LOW | SAFE | Home:150 vs 294 | Tile hover opacities differ (0.08 vs 0.04) between equivalent tiles |
| F-20 | LOW | SAFE | Find:59,81; Rooms:705,741 | Arrow SVG pasted 4× instead of shared token |
| F-21 | LOW | SAFE | Find:651–662 | No message when all rooms fully booked (only "no rooms" case handled) |
| F-25 | LOW | SAFE | Rooms:1187–1203 | Permanently disabled "View week" with tooltip-only rationale |
| F-26 | LOW | SAFE | Rooms:297–434 | Three labels share Y=124; midpoint caption may collide at narrow widths |
| F-29 | LOW | SAFE | myBookings:383–397 | Clash badge fixed 176px, `Wrap: false` — truncates on copy change |
| F-30 | LOW | SAFE | myBookings:805–848 | Row text duplicated between labels and overlay-button SR text |
| F-32 | LOW | SAFE | bookingDetail:287,292 | `Height 180` + `LayoutMaxHeight 110` contradictory constraints |
| F-36 | LOW | SAFE | Profile, cpt_Modal_ | Toggles have blank `Label`, no AccessibleLabel — unnamed switches for SR |
| F-38 | MEDIUM | SAFE | Shell_Header:102–304 | Fixed-width header, hamburger built but hidden; no narrow-width strategy |
| F-39 | LOW | SAFE | Shell_Header:60,288,318,357 | Dead chrome (hidden search/notification/menu), blank spacer Width formula |
| F-40 | LOW | SAFE | Shell_Header:140 | `FontWeight.Lighter` resting nav tabs — thin at 14px |
| F-46 | LOW | SAFE | cpt_Modal_:1032–1043 | Conflict mini-timeline centred on conflicting booking, may exclude requested slot |
| F-47 | LOW | SAFE | components | Junk custom-property defaults ("Add a new Role to the Database", `="Text"`), ignored inputs |

**Totals: 1 CRITICAL · 8 HIGH · 22 MEDIUM · 17 LOW (48 findings).**
RISKY-tagged: F-11, F-14, F-27, F-35 (4). All others SAFE.

---

## Suggested fix order

1. **F-16** — one-token change (`PrimaryText` → `TextPrimary`), restores legibility of week view.
2. **F-06** — add `Set(gblUI_Nav_currentTab, …)` to four OnSelects.
3. **F-37 / F-36 / F-44** — AccessibleLabel sweep; pure additions.
4. **F-33 / F-41 / F-34 / F-42** — decide per feature: enable, or explain-and-disable; all copy/DisplayMode edits.
5. **F-01 / F-02 / F-03** — theme hygiene pass (token types, dark palette, hardcoded colour sweep).
6. **F-48** — font unification (large but mechanical).
7. RISKY layout items (F-11, F-14, F-27, F-35) — schedule with Studio verification per the rulebook's verification ladder; each needs a human eyeball after compile.
