# Data source schema snapshots

`pa-lint`'s **L4** check validates seed literals in `Src/**/*.pa.yaml` against the snapshots in
this directory — field names plus literal types, including the lookup `Value` shape. It is the
check that catches the Text/Number cascade and masked double-booking classes of bug.

One JSON file per data source. Format (authoritative copy: `tools/pa-lint/README.md`):

```json
{ "source": "Book_Rooms (SharePoint)", "capturedAt": "2026-07-28",
  "fields": { "Title": "text", "RoomID": "lookup-number", "Capacity": "number", "IsPrivate": "boolean" } }
```

Types: `text | number | boolean | date | lookup-number | lookup-text`.

Only literals are validated; computed seed expressions are skipped by design.

Register each snapshot under `seedSchemas` in `palint.config.json` — a file here that is not
referenced from the config is not checked by anything. Both are empty as of install; L4 is inert
until the first snapshot is captured and registered.
