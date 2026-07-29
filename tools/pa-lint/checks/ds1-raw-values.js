'use strict';
// DS1: when a design-system kit is active, raw color values are forbidden
// outside the token definition files - all color comes from DS.* tokens.
// This is the fail-closed half of the design system: assembly from tokens is
// only deterministic if off-kit values cannot ship.
//
// Config: designSystem: { enabled: true, tokenFiles: ["App.pa.yaml"],
//                         exemptMarker: "DS-EXEMPT" }

const path = require('node:path');

const RAW_COLOR_RE = /\bRGBA\s*\(|#[0-9A-Fa-f]{3,8}\b/;

module.exports = {
  id: 'DS1',
  run(files, config) {
    const ds = (config && config.designSystem) || {};
    if (!ds.enabled) return [];
    const tokenFiles = ds.tokenFiles || ['App.pa.yaml'];
    const exempt = ds.exemptMarker || 'DS-EXEMPT';
    const findings = [];
    for (const f of files) {
      const base = path.basename(f.file);
      if (tokenFiles.some((t) => base === t || f.file.endsWith(t))) continue;
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        const bodyLines = p.text.split('\n');
        for (let li = 0; li < bodyLines.length; li++) {
          const lineText = bodyLines[li];
          if (!RAW_COLOR_RE.test(lineText) || lineText.includes(exempt)) continue;
          findings.push({
            check: 'DS1',
            severity: 'error',
            file: f.file,
            line: p.line + (p.kind === 'block' ? li + 1 : 0),
            message:
              `${p.prop}: raw color value outside the token block - use a DS.* token ` +
              `(or annotate the line with // ${exempt} and justify it in the kit RULES.md).`,
          });
        }
      }
    }
    return findings;
  },
};
