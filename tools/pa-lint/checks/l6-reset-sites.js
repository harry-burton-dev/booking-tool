'use strict';
// L6: reset-site completeness. Reset omissions were fixed in three separate
// commits on the source project - every new stateful control forgot at least
// one wizard/modal reset site.
//
// Convention: each reset site is marked IN SOURCE with a comment
//   // RESET-SITE[<name>]
// inside the behavior formula. Config lists the stateful vars
// (config.statefulVars); every marked site must mention every one of them.
// Self-anchoring by design - no brittle file:line config to go stale.

const MARKER_RE = /RESET-SITE\[([^\]]+)\]/g;

module.exports = {
  id: 'L6',
  run(files, config) {
    const vars = (config && config.statefulVars) || [];
    if (vars.length === 0) return [];
    const findings = [];
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        MARKER_RE.lastIndex = 0;
        let m;
        while ((m = MARKER_RE.exec(p.text)) !== null) {
          const site = m[1];
          for (const v of vars) {
            if (!new RegExp(`\\b${v}\\b`).test(p.text)) {
              findings.push({
                check: 'L6',
                severity: 'error',
                file: f.file,
                line: p.line,
                message:
                  `Reset site "${site}" does not reset stateful var "${v}" - every ` +
                  `registered stateful var must appear at every RESET-SITE. ` +
                  `(Reset(control) alone does not clear picker state; pair with Set(${v}, ...).)`,
              });
            }
          }
        }
      }
    }
    return findings;
  },
};
