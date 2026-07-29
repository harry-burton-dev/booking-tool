'use strict';
// Verification-ladder rung 3 helper: marker greps against a fresh sync.
// "Verified" means each fix's specific marker string is present (or absent)
// in the pulled tree - never a whole-file diff, which drowns in
// normalization noise.

const fs = require('node:fs');
const { listPaYaml } = require('./yamlwalk');

// -> [{ marker, found, sites: [{file, line}] }]
function checkMarkers(dir, markers) {
  const files = listPaYaml(dir);
  const results = markers.map((m) => ({ marker: m, found: false, sites: [] }));
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const r of results) {
        if (lines[i].includes(r.marker)) {
          r.found = true;
          r.sites.push({ file, line: i + 1 });
        }
      }
    }
  }
  return results;
}

module.exports = { checkMarkers };
