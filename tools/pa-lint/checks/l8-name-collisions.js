'use strict';
// L8: control names (including component instance names) are APP-GLOBAL.
// A duplicate anywhere fails compile with a name-collision error.

const path = require('node:path');

module.exports = {
  id: 'L8',
  run(files) {
    const byName = new Map(); // name -> [{file, line}]
    for (const f of files) {
      for (const c of f.controls) {
        if (!byName.has(c.name)) byName.set(c.name, []);
        byName.get(c.name).push({ file: f.file, line: c.line });
      }
    }
    const findings = [];
    for (const [name, sites] of byName) {
      if (sites.length > 1) {
        const list = sites.map((s) => `${path.basename(s.file)}:${s.line}`).join(', ');
        findings.push({
          check: 'L8',
          severity: 'error',
          file: sites[0].file,
          line: sites[0].line,
          message:
            `Control name "${name}" declared ${sites.length} times (${list}) - ` +
            `control names are app-global; every instance needs a globally fresh name.`,
        });
      }
    }
    return findings;
  },
};
