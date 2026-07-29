'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { runChecks } = require('../lib/runner');

const ROOT = path.join(__dirname, 'fixtures', 'batch3');
const FIX = path.join(ROOT, 'Src');

function findingsFor(checkIds, config) {
  return runChecks(FIX, config || {}).filter((f) => checkIds.includes(f.check));
}

const L4_CONFIG = {
  seedSchemas: { colRooms: path.join(ROOT, 'schema', 'rooms.json') },
};

test('L4 validates seed literals against the schema snapshot', () => {
  const l4 = findingsFor(['L4'], L4_CONFIG);
  assert.strictEqual(l4.length, 3, JSON.stringify(l4, null, 2));
  const msgs = l4.map((f) => f.message).join('\n');
  // Text-vs-number lookup Value - the exact class that masked the
  // double-booking bug (14-site type-error cascade).
  assert.ok(msgs.includes('RoomID'), 'lookup Value type mismatch flagged');
  assert.ok(msgs.includes('Capacity'), 'text literal in number field flagged');
  assert.ok(msgs.includes('Seats'), 'unknown field flagged');
  // colBookings has no configured schema: silently skipped.
  assert.ok(!msgs.includes('colBookings'));
});

test('L6 requires every stateful var at every RESET-SITE marker', () => {
  const l6 = findingsFor(['L6'], {
    statefulVars: ['varWizardStep', 'varSelectedRoom', 'varIsPrivate'],
  });
  assert.strictEqual(l6.length, 1, JSON.stringify(l6, null, 2));
  assert.ok(l6[0].message.includes('modal-close'));
  assert.ok(l6[0].message.includes('varIsPrivate'));
  assert.ok(l6[0].file.endsWith('Booking.pa.yaml'));
});

test('DS1 flags raw color values outside token files, only when enabled', () => {
  const enabled = findingsFor(['DS1'], {
    designSystem: { enabled: true, tokenFiles: ['App.pa.yaml'] },
  });
  const booking = enabled.filter((f) => f.file.endsWith('Booking.pa.yaml'));
  const app = enabled.filter((f) => f.file.endsWith('App.pa.yaml'));
  assert.strictEqual(booking.length, 2, JSON.stringify(enabled, null, 2)); // RGBA fill + hex ColorValue
  assert.strictEqual(app.length, 0, 'token file is exempt');
  const disabled = findingsFor(['DS1'], {});
  assert.strictEqual(disabled.length, 0, 'DS1 off by default');
});

test('normalize strips version suffixes and default-equal props', () => {
  const { normalizeText } = require('../lib/normalize');
  const noisy = fs.readFileSync(path.join(FIX, 'ServerNoisy.pa.yaml'), 'utf8');
  const clean = fs.readFileSync(path.join(FIX, 'ServerClean.pa.yaml'), 'utf8');
  assert.strictEqual(normalizeText(noisy), normalizeText(clean));
});

test('checkMarkers reports found/missing per marker', () => {
  const { checkMarkers } = require('../lib/markers');
  const res = checkMarkers(FIX, ['RESET-SITE[wizard-restart]', 'no-such-marker-xyz']);
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].found, true);
  assert.ok(res[0].sites.length >= 1);
  assert.strictEqual(res[1].found, false);
});

test('CLI exits 1 with JSON findings on errors, 0 on a clean subset', () => {
  const lintJs = path.join(__dirname, '..', 'lint.js');
  let out;
  let code = 0;
  try {
    out = execFileSync(process.execPath, [lintJs, '--src', FIX, '--json'], { encoding: 'utf8' });
  } catch (e) {
    code = e.status;
    out = e.stdout;
  }
  assert.strictEqual(code, 1, 'errors present -> exit 1');
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed.findings) && parsed.findings.length > 0);
  // Restrict to a check this fixture set passes: L7 has no hits here.
  const cleanOut = execFileSync(
    process.execPath,
    [lintJs, '--src', FIX, '--json', '--checks', 'L7'],
    { encoding: 'utf8' },
  );
  assert.strictEqual(JSON.parse(cleanOut).findings.length, 0);
});
