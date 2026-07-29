'use strict';
// L3: things the YAML push path cannot author, caught at diff time instead of
// as a failed publish (or worse, a control that validates but never
// materializes):
//   - Classic/ComboBox: unsettable SearchItems default referencing Studio
//     sample data. Ship Classic/DropDown + sentinel first row; insert real
//     ComboBoxes in Studio only.
//   - ManualLayout container inside an AutoLayout tree: was observed causing
//     misattributed compile errors / silently ignored layout. WARNING, not
//     error: running this check against the live-synced booking app found 15
//     instances in source that publishes and runs fine, so the nesting is
//     legal in general (a ManualLayout tile inside an AutoLayout row is a
//     normal pattern). Whatever broke originally was narrower than this rule
//     can express, so it advises rather than blocks - an error-level gate here
//     blocks every real app and buys only gate-fatigue.
//   - New component custom properties: server-side definition validation
//     rejects them. Create in Studio first (warning, since edits to EXISTING
//     properties are fine and this check cannot see server state).

const DEFAULT_DENY = {
  'Classic/ComboBox':
    'cannot be authored via YAML (unsettable SearchItems default). Ship Classic/DropDown ' +
    'with a sentinel first row (Reset() returns to first item = cleared); insert real ' +
    'ComboBoxes in Studio only.',
};

module.exports = {
  id: 'L3',
  run(files, config) {
    const deny = Object.assign({}, DEFAULT_DENY, (config && config.denyControls) || {});
    const findings = [];
    for (const f of files) {
      for (const c of f.controls) {
        if (deny[c.type]) {
          findings.push({
            check: 'L3',
            severity: 'error',
            file: f.file,
            line: c.line,
            message: `${c.name}: Classic/ComboBox ${deny[c.type]}`,
          });
        }
        if (c.type.startsWith('GroupContainer') && c.variant === 'ManualLayout') {
          for (let a = c.parent; a; a = a.parent) {
            if (a.type.startsWith('GroupContainer') && a.variant === 'AutoLayout') {
              findings.push({
                check: 'L3',
                severity: 'warning',
                file: f.file,
                line: c.line,
                message:
                  `${c.name} is a ManualLayout container inside AutoLayout container "${a.name}" - ` +
                  `usually intentional (manually-placed tile in an auto-laid-out row). Check it ` +
                  `only if this subtree is misrendering or throwing misattributed compile errors.`,
              });
              break;
            }
          }
        }
      }
      for (let li = 0; li < f.lines.length; li++) {
        if (/^\s*CustomProperties:\s*$/.test(f.lines[li])) {
          findings.push({
            check: 'L3',
            severity: 'warning',
            file: f.file,
            line: li + 1,
            message:
              'CustomProperties block: NEW component custom properties cannot be created via ' +
              'YAML (server-side definition validation). If any property here is new, create it ' +
              'in Studio first; edits to existing properties are fine.',
          });
        }
      }
    }
    return findings;
  },
};
