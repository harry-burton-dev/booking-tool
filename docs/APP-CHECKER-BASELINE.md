# App Checker baseline — NOT YET ESTABLISHED

`sarif-diff` enforces RULES **P10** ("App Checker issues never increase") by diffing the current
App Checker SARIF against a committed baseline. **There is no baseline in this repo yet.**

Consequence: **P10 is currently unenforced.** `sarif-diff` has nothing to diff against, so no
deploy can be blocked on new App Checker issues.

To establish it, export App Checker results for app
`498d4962-0b5f-4990-a400-1bf5de9a367c` and commit them as `sarif-baseline.json` at the repo root,
then confirm the gate has teeth:

```bash
node tools/sarif-diff/sarif-diff.js --baseline sarif-baseline.json --current AppCheckerResult.sarif
```

Recorded at install (toolkit 84cfd20, 2026-07-29) so the gap is visible rather than assumed
covered. The first deploy should establish the baseline.
