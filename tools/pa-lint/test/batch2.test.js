'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runChecks } = require('../lib/runner');

const FIX = path.join(__dirname, 'fixtures', 'batch2', 'Src');

function findingsFor(checkIds, config) {
  return runChecks(FIX, config || {}).filter((f) => checkIds.includes(f.check));
}

test('L2 flags referenced globals with no Set() site anywhere', () => {
  const l2 = findingsFor(['L2']);
  // gblFindLegacyGrid is referenced in Home OnSelect but never Set;
  // gblUserEmail and gblIsSandbox are Set in App.OnStart and must not flag.
  assert.strictEqual(l2.length, 1, JSON.stringify(l2, null, 2));
  assert.ok(l2[0].message.includes('gblFindLegacyGrid'));
  assert.ok(l2[0].file.endsWith('Home.pa.yaml'));
  assert.strictEqual(l2[0].severity, 'error');
});

test('L2 treats a named formula as a declaration site, not an unset global', () => {
  // gblSideNavIconStr is declared in App.Formulas as "name = expr", never Set().
  // Named formulas are a real declaration form; flagging them is a false positive
  // (found running pa-lint against the live-synced booking app).
  const l2 = findingsFor(['L2']);
  assert.ok(
    !l2.some((f) => f.message.includes('gblSideNavIconStr')),
    JSON.stringify(l2, null, 2)
  );
});

test('L2 global prefixes are configurable', () => {
  // With a prefix set that excludes gbl, nothing is treated as a global.
  const l2 = findingsFor(['L2'], { globalPrefixes: ['zzz'] });
  assert.strictEqual(l2.length, 0, JSON.stringify(l2, null, 2));
});

test('L8 flags duplicate control names across files', () => {
  const l8 = findingsFor(['L8']);
  // btnSave declared in Home.pa.yaml and Find.pa.yaml.
  assert.strictEqual(l8.length, 1, JSON.stringify(l8, null, 2));
  assert.ok(l8[0].message.includes('btnSave'));
  assert.ok(l8[0].message.includes('Home.pa.yaml'));
  assert.ok(l8[0].message.includes('Find.pa.yaml'));
});

test('L3 flags denylisted control types (Classic/ComboBox)', () => {
  const l3 = findingsFor(['L3']);
  const combo = l3.filter((f) => f.message.includes('Classic/ComboBox'));
  assert.strictEqual(combo.length, 1, JSON.stringify(l3, null, 2));
  assert.strictEqual(combo[0].severity, 'error');
  assert.ok(combo[0].message.includes('DropDown'), 'must suggest the DropDown+sentinel workaround');
});

test('L3 flags ManualLayout container nested under an AutoLayout container', () => {
  const l3 = findingsFor(['L3']);
  const manual = l3.filter((f) => f.message.includes('ManualLayout'));
  // conLegacy (inside AutoLayout conShell) flags; top-level conFlat in Find does not.
  assert.strictEqual(manual.length, 1, JSON.stringify(manual, null, 2));
  assert.ok(manual[0].message.includes('conLegacy'));
  assert.ok(manual[0].file.endsWith('Home.pa.yaml'));
  // Warning, not error: the live booking app ships 15 of these and publishes
  // fine, so this cannot be a blocking gate. See check header.
  assert.strictEqual(manual[0].severity, 'warning');
});

test('L3 warns on CustomProperties blocks (Studio-first rule)', () => {
  const l3 = findingsFor(['L3']);
  const cp = l3.filter((f) => f.message.includes('CustomProperties'));
  assert.strictEqual(cp.length, 1, JSON.stringify(cp, null, 2));
  assert.strictEqual(cp[0].severity, 'warning');
  assert.ok(cp[0].file.endsWith('cpt_Card.pa.yaml'));
});
