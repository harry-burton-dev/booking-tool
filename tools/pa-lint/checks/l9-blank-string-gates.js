'use strict';
// L9: a global compared against "" must be seeded in App.OnStart.
//
// Blank() = "" is FALSE in Power Fx. A global with a Set() site somewhere but
// none in App.OnStart therefore holds Blank() on a cold start, and every
// `myGlobal = ""` gate reads false while a Label printing the same global still
// renders empty - so the defect looks like a layout bug, not a state bug.
//
// L2 only asks whether a Set() exists ANYWHERE, which is why this class shipped
// three times: gbl_UI_Detail_ConfirmMode (hid the whole booking-detail footer
// action row), gbl_FixCycleSeriesID (fired the clash-fix cycle on a cold
// session), gbl_UI_CancelSeriesConfirmID (armed cancel survived navigation).
//
// Screens can seed on OnVisible; components have no OnVisible, so for anything
// a component reads, App.OnStart is the only seed site that always runs.

const DEFAULT_PREFIXES = ['gbl', 'glb'];

module.exports = {
  id: 'L9',
  run(files, config) {
    const prefixes = (config && config.globalPrefixes) || DEFAULT_PREFIXES;
    if (prefixes.length === 0) return [];
    const pre = prefixes.join('|');

    // <global> = ""   /   <global> <> ""   (either operand order)
    const gateRe = new RegExp(
      `\\b((?:${pre})[A-Za-z0-9_]*)\\s*(?:=|<>)\\s*""|""\\s*(?:=|<>)\\s*\\b((?:${pre})[A-Za-z0-9_]*)`,
      'g'
    );

    // Collect App.OnStart's Set() targets. OnStart is the only property that is
    // guaranteed to run before anything reads a global.
    const onStartSeeded = new Set();
    for (const f of files) {
      for (const p of f.props) {
        if (p.prop !== 'OnStart') continue;
        const setRe = /\bSet\(\s*([A-Za-z_][A-Za-z0-9_]*)/g;
        let m;
        while ((m = setRe.exec(p.text)) !== null) onStartSeeded.add(m[1]);
      }
    }

    const gated = new Map(); // name -> first {file, line}
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        gateRe.lastIndex = 0;
        let m;
        while ((m = gateRe.exec(p.text)) !== null) {
          const name = m[1] || m[2];
          if (name && !gated.has(name)) gated.set(name, { file: f.file, line: p.line });
        }
      }
    }

    const findings = [];
    for (const [name, site] of gated) {
      if (onStartSeeded.has(name)) continue;
      findings.push({
        check: 'L9',
        severity: 'error',
        file: site.file,
        line: site.line,
        message:
          `Global "${name}" is compared against "" but is never Set in App.OnStart. ` +
          `Blank() = "" is FALSE in Power Fx, so on a cold start this gate reads ` +
          `false while the value still prints as empty. Add Set(${name}, "") to ` +
          `App.OnStart (a component cannot seed it - components have no OnVisible).`,
      });
    }
    return findings;
  },
};
