# pack-msapp

Packs a Power Apps Canvas App repo (as produced by `pac canvas unpack` in
layout form) into a `.msapp` file suitable for import.

## Why backslash entry names

A `.msapp` is a flat zip whose entry names use **backslash** (`\`) path
separators, e.g. `Src\App.pa.yaml` — verified against a real reference
`.msapp` on 2026-07-24. Standard zip tooling (`Compress-Archive`, `zip`,
7-Zip, `ZipFile.CreateFromDirectory`) writes forward slashes per the zip
spec, and Power Apps rejects or misreads the result as a broken `.msapp`.

This script therefore builds the archive with `System.IO.Compression.ZipArchive`
and calls `CreateEntry` with an explicitly constructed entry-name string (the
RepoRoot-relative path with `\` separators), streaming each file's bytes in.

## Usage

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\pack-msapp\pack-msapp.ps1 `
    -RepoRoot C:\path\to\canvas-repo `
    -OutFile  C:\temp\MyApp.msapp
```

Parameters:

| Parameter  | Required | Description |
|------------|----------|-------------|
| `-RepoRoot` | Yes | Root of the unpacked canvas app repo. |
| `-OutFile`  | Yes | Destination `.msapp` path. Must **not** be inside `RepoRoot` (errors otherwise) — this prevents the output from being swept into a later pack or committed by accident. |
| `-Members`  | No  | Members to pack (see below). |
| `-Force`    | No  | Overwrite `OutFile` if it already exists; without it, an existing file is an error. |

On success the script prints a summary (entry count, total bytes, output
path) and exits 0. Any error exits 1.

## Member set rationale

Only a specific member set belongs in a `.msapp`; everything else in the repo
(README, docs, CI config, tooling) must be excluded or the import breaks or
carries junk. Default members:

- `Controls`, `Components`, `References`, `Resources`, `Src` — directories,
  recursed fully.
- `Header.json`, `Properties.json`, `ComponentsMetadata.json`,
  `AppCheckerResult.sarif` — single files at the repo root.

Members absent from `RepoRoot` are skipped with a warning (not every app has
components or a SARIF report). `Src` is the one mandatory member: without it
there is no app source, so a missing `Src` is a hard error (exit 1).

## Never commit the packed .msapp

The `.msapp` is a build artifact, reproducible from the repo at any time.
Write it outside the repo (the `-OutFile`-inside-`RepoRoot` guard enforces
this) and never commit it.

## Tests

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\pack-msapp\test\run-tests.ps1
```

Self-contained (no framework): builds a dummy tree in `$env:TEMP`, packs it,
and asserts on separator correctness, exact entry set, byte-level round-trip,
the OutFile-inside-RepoRoot guard, and the missing-`Src` error. Exits 1 on any
failure.
