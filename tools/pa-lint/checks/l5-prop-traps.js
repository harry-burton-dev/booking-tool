'use strict';
// L5: known property-name traps, each learned from a failed compile.
// Table-driven; extend per app via config.extraTraps.

const BUILTIN_TRAPS = [
  {
    control: 'Toggle',
    prop: 'Default',
    suggest: 'Toggle initial state is "Checked:", not "Default:" (schema validation error).',
  },
  {
    control: 'Classic/Button',
    prop: 'AccessibleLabel',
    suggest:
      'Classic/Button has no AccessibleLabel - its accessible name is Text. ' +
      'For overlay buttons set Text and make the four text-state colors transparent.',
  },
];

module.exports = {
  id: 'L5',
  run(files, config) {
    const traps = BUILTIN_TRAPS.concat((config && config.extraTraps) || []);
    const findings = [];
    for (const f of files) {
      for (const p of f.props) {
        if (!p.control) continue;
        for (const t of traps) {
          if (p.control.type === t.control && p.prop === t.prop) {
            findings.push({
              check: 'L5',
              severity: 'error',
              file: f.file,
              line: p.line,
              message: `${p.control.name} (${p.control.type}) uses "${p.prop}:": ${t.suggest}`,
            });
          }
        }
      }
    }
    return findings;
  },
};
