# Deployment Runbook

Steps required to promote the booking tool to the production environment. Each step
names its verification. Referenced by `CLAUDE.md` ("Sandbox & deploy").

## 1. Provision Book_Bookings series fields

The series-bookings feature (spec: `docs/superpowers/specs/2026-07-30-series-bookings-design.md`)
requires four fields on the production `Book_Bookings` list. Add them with the m365 CLI
(single-quoted CAML attributes; internal name = display name):

```
m365 spo field add --webUrl "<prod site url>" --listTitle "Book_Bookings" -x "<Field Type='Text' Name='SeriesID' DisplayName='SeriesID' />"
m365 spo field add --webUrl "<prod site url>" --listTitle "Book_Bookings" -x "<Field Type='Text' Name='RecurrenceType' DisplayName='RecurrenceType' />"
m365 spo field add --webUrl "<prod site url>" --listTitle "Book_Bookings" -x "<Field Type='Number' Name='OccIndex' DisplayName='OccIndex' />"
m365 spo field add --webUrl "<prod site url>" --listTitle "Book_Bookings" -x "<Field Type='Boolean' Name='IsException'><Default>0</Default></Field>"
```

`Status` is an existing text column; the `Clash` value needs no provisioning.

Verify: `m365 spo field list` shows all four with types Text/Text/Number/Boolean.
Then refresh the `Book_Bookings` data source in Power Apps Studio (Data panel → ⋯ →
Refresh) before packing, or the app will not see the new columns.

## 2. Production pack

Per `CLAUDE.md`:

1. `node tools/prod-revert/revert-check.js --src Src --contract docs/REVERT-CONTRACT.md --require-prod`
2. `node tools/sarif-diff/sarif-diff.js` against the committed App Checker baseline (new issues block — RULES P10)
3. `tools/pack-msapp/pack-msapp.ps1`
