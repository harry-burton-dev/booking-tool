'use strict';
// L7: string-literal date/time parses are locale traps.
// DateTimeValue("1900-01-01 08:00:00") parses PER USER LOCALE at runtime.
// Construct numerically instead: DateAdd(Date(1900,1,1), 8, TimeUnit.Hours).
// Only literal string arguments are flagged; parsing user input is legitimate.

const LITERAL_PARSE_RE = /\b(DateTimeValue|DateValue|TimeValue)\s*\(\s*"/g;

module.exports = {
  id: 'L7',
  run(files) {
    const findings = [];
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        const bodyLines = p.text.split('\n');
        for (let li = 0; li < bodyLines.length; li++) {
          LITERAL_PARSE_RE.lastIndex = 0;
          let m;
          while ((m = LITERAL_PARSE_RE.exec(bodyLines[li])) !== null) {
            findings.push({
              check: 'L7',
              severity: 'error',
              file: f.file,
              line: p.line + (p.kind === 'block' ? li + 1 : 0),
              message:
                `${m[1]}("...") parses per user locale - construct numerically ` +
                `(e.g. DateAdd(Date(1900,1,1), H, TimeUnit.Hours)).`,
            });
          }
        }
      }
    }
    return findings;
  },
};
