'use strict';
// L2: every referenced global must have a Set() site somewhere in the app.
// Power Fx compiles "Name isn't valid" for a global that is read but never
// Set - "unset is falsy" is runtime thinking and cost a compile round-trip.
// Globals are identified by naming prefix (config.globalPrefixes).

const DEFAULT_PREFIXES = ['gbl', 'glb'];

module.exports = {
  id: 'L2',
  run(files, config) {
    const prefixes = (config && config.globalPrefixes) || DEFAULT_PREFIXES;
    if (prefixes.length === 0) return [];
    const identRe = new RegExp(`\\b(?:${prefixes.join('|')})[A-Za-z0-9_]*\\b`, 'g');
    const setRe = /\bSet\(\s*([A-Za-z_][A-Za-z0-9_]*)/g;
    // A named formula ("Name = expr;", or a UDF "Fn(a:Number):Text = expr;") is a
    // declaration site just like Set(). Only valid inside a Formulas block, so the
    // pattern is applied there alone - matching it anywhere would swallow equality
    // tests and mask genuine unset globals.
    const formulaDeclRe =
      /^[ \t]*=?[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?:\([^)]*\)[ \t]*:[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*)?=(?!=)/gm;

    const setNames = new Set();
    const refs = new Map(); // name -> first {file, line}
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        let m;
        setRe.lastIndex = 0;
        while ((m = setRe.exec(p.text)) !== null) setNames.add(m[1]);
        if (p.prop === 'Formulas') {
          formulaDeclRe.lastIndex = 0;
          while ((m = formulaDeclRe.exec(p.text)) !== null) setNames.add(m[1]);
        }
        identRe.lastIndex = 0;
        while ((m = identRe.exec(p.text)) !== null) {
          if (!refs.has(m[0])) refs.set(m[0], { file: f.file, line: p.line });
        }
      }
    }

    const findings = [];
    for (const [name, site] of refs) {
      if (!setNames.has(name)) {
        findings.push({
          check: 'L2',
          severity: 'error',
          file: site.file,
          line: site.line,
          message:
            `Global "${name}" is referenced but has no Set() site anywhere - ` +
            `Power Fx will fail compile with "Name isn't valid". Add Set(${name}, ...) to App.OnStart.`,
        });
      }
    }
    return findings;
  },
};
