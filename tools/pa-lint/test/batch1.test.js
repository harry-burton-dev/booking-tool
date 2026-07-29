'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runChecks } = require('../lib/runner');

const FIX = path.join(__dirname, 'fixtures', 'batch1', 'Src');

function findingsFor(checkIds, config) {
  const all = runChecks(FIX, config || {});
  return all.filter((f) => checkIds.includes(f.check));
}

test('L1 flags inline formulas containing colon-space, not block scalars', () => {
  const l1 = findingsFor(['L1']);
  const bad = l1.filter((f) => f.file.endsWith('Bad.pa.yaml'));
  const good = l1.filter((f) => f.file.endsWith('Good.pa.yaml'));
  // "Room: " concat, 'RoomID: Title' selector, $"Label: {varCount}" interpolation
  assert.strictEqual(bad.length, 3, JSON.stringify(bad, null, 2));
  assert.ok(bad.every((f) => f.severity === 'error'));
  assert.ok(bad.every((f) => typeof f.line === 'number' && f.line > 0));
  assert.strictEqual(good.length, 0, JSON.stringify(good, null, 2));
});

test('L5 flags Toggle Default: and Classic/Button AccessibleLabel', () => {
  const l5 = findingsFor(['L5']);
  const bad = l5.filter((f) => f.file.endsWith('Bad.pa.yaml'));
  assert.strictEqual(bad.length, 2, JSON.stringify(bad, null, 2));
  const toggle = bad.find((f) => f.message.includes('Checked'));
  assert.ok(toggle, 'Toggle Default trap should suggest Checked:');
  const btn = bad.find((f) => f.message.includes('AccessibleLabel'));
  assert.ok(btn, 'Classic/Button AccessibleLabel trap');
  assert.strictEqual(l5.filter((f) => f.file.endsWith('Good.pa.yaml')).length, 0);
});

test('L5 trap table is extensible via config.extraTraps', () => {
  const l5 = findingsFor(['L5'], {
    extraTraps: [{ control: 'Toggle', prop: 'X', suggest: 'test trap' }],
  });
  const xTraps = l5.filter((f) => f.message.includes('test trap'));
  // Bad.pa.yaml's tglPrivate has X: =40; Good's tglPrivateOk also has X: =40
  assert.strictEqual(xTraps.length, 2, JSON.stringify(xTraps, null, 2));
});

test('L7 flags string-literal date parses only', () => {
  const l7 = findingsFor(['L7']);
  const bad = l7.filter((f) => f.file.endsWith('Bad.pa.yaml'));
  // DateTimeValue("...") and DateValue("...")
  assert.strictEqual(bad.length, 2, JSON.stringify(bad, null, 2));
  assert.ok(bad.every((f) => f.severity === 'error'));
  // Non-literal DateTimeValue(txtInput.Text) in Good must not flag
  assert.strictEqual(l7.filter((f) => f.file.endsWith('Good.pa.yaml')).length, 0);
});
