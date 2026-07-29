'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { validateFile } = require('../lib/validate-file');

const FIX = path.join(__dirname, 'fixtures');

test('a valid control tree produces no findings', () => {
  const findings = validateFile(path.join(FIX, 'valid', 'Home.pa.yaml'));
  assert.deepStrictEqual(findings, [], JSON.stringify(findings, null, 2));
});

test('an unknown/typo\'d key is flagged (Propertiess vs Properties)', () => {
  const findings = validateFile(path.join(FIX, 'unknown-key', 'Bad.pa.yaml'));
  assert.ok(
    findings.some((f) => f.check === 'SCHEMA' && f.severity === 'error' && f.message.includes('Propertiess')),
    JSON.stringify(findings, null, 2),
  );
});

test('a bad z-order sequence (two controls merged into one Children item) is flagged', () => {
  // btnB is mis-indented as a sibling key of btnA instead of its own "- btnB:"
  // list entry - exactly the kind of manual-edit slip that silently reorders
  // or drops a control at compile time. Children items must have exactly one
  // key (maxProperties: 1 in the schema).
  const findings = validateFile(path.join(FIX, 'bad-zorder', 'Bad.pa.yaml'));
  assert.ok(
    findings.some((f) => f.check === 'SCHEMA' && f.severity === 'error' && /one control|maxProperties|exactly 1/i.test(f.message)),
    JSON.stringify(findings, null, 2),
  );
});

test('a wrong-typed property (quoted string instead of boolean) is flagged', () => {
  const findings = validateFile(path.join(FIX, 'wrong-type', 'Bad.pa.yaml'));
  assert.ok(
    findings.some((f) => f.check === 'SCHEMA' && f.severity === 'error' && /boolean/.test(f.message)),
    JSON.stringify(findings, null, 2),
  );
});
