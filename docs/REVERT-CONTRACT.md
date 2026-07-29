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

### example-reads-rooms

Read site: mock collection in dev, SharePoint connection in prod.

```dev
Filter(colRooms,
```

```prod
Filter(Book_Rooms,
```

---

## Manual steps (Studio / SharePoint — human-executed, per deploy)

- [ ] MS1: <e.g. add the Office365Users connection in Studio>
- [ ] MS2: <e.g. replace ddlPerson (DropDown) with a ComboBox in Studio>
- [ ] MS3: <e.g. provision SharePoint columns per schema/*.json and backfill blank rows —
      blank rows silently vanish from filters>
- [ ] MS4: <e.g. flip UserLocale to en-GB in Studio; verify site regional settings UTC+0>

Each manual step gets a verification line ("evidence, not edits") when executed.
