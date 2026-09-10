'use strict';
const fs = require('node:fs');
const { parseFile, listPaYaml } = require('./yamlwalk');

const CHECKS = [
  require('../checks/l1-block-scalar'),
  require('../checks/l2-unset-globals'),
  require('../checks/l3-authorability'),
  require('../checks/l4-seed-schema'),
  require('../checks/l5-prop-traps'),
  require('../checks/l6-reset-sites'),
  require('../checks/l7-locale'),
  require('../checks/l8-name-collisions'),
  require('../checks/l9-blank-string-gates'),
  require('../checks/ds1-raw-values'),
];

// Run all (or config.checks-selected) checks over every .pa.yaml under srcDir.
// Each check module: { id, run(files, config) -> findings[] }
// finding: { check, severity: 'error'|'warning', file, line, message }
function runChecks(srcDir, config) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`pa-lint: source directory not found: ${srcDir}`);
  }
  const cfg = config || {};
  const files = listPaYaml(srcDir).map(parseFile);
  const selected = cfg.checks
    ? CHECKS.filter((c) => cfg.checks.includes(c.id))
    : CHECKS;
  const findings = [];
  for (const check of selected) findings.push(...check.run(files, cfg));
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return findings;
}

module.exports = { runChecks, CHECKS };
