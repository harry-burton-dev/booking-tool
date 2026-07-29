'use strict';
// L1: any INLINE formula containing ": " (colon-space) is invalid YAML or a
// parse trap - it must be a block scalar (|-). This defect shipped three times
// in two days on the source project; in a component file the parse error
// cascades into phantom "Could not find Canvas Component" errors.

module.exports = {
  id: 'L1',
  run(files) {
    const findings = [];
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline') continue;
        if (p.text.includes(': ')) {
          findings.push({
            check: 'L1',
            severity: 'error',
            file: f.file,
            line: p.line,
            message:
              `${p.prop}: inline formula contains ": " - convert to a block scalar ` +
              `("${p.prop}: |-" with the formula on the next line).`,
          });
        }
      }
    }
    return findings;
  },
};
