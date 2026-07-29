'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { findSeedCalls } = require('../lib/fxparse');

test('L4 extraction survives Power Fx comments with apostrophes', () => {
  // An apostrophe in a // comment must not be treated as an identifier quote
  // (it consumed to EOF and silently disabled the check - fail-open).
  const text = [
    'ClearCollect(colRooms, // don\'t break here',
    '  {Title: "A", Capacity: 4});',
    'Collect(colRooms, {Title: "B", Capacity: 2})',
  ].join('\n');
  const calls = findSeedCalls(text, ['colRooms']);
  assert.strictEqual(calls.length, 2, JSON.stringify(calls, null, 2));
  assert.strictEqual(calls[0].records.length, 1);
  assert.strictEqual(calls[0].records[0].fields.length, 2);
});

test('L4 extraction survives block comments and spaced call parens', () => {
  const text = 'ClearCollect (colRooms, /* it\'s fine */ {Title: "C", Capacity: 1})';
  const calls = findSeedCalls(text, ['colRooms']);
  assert.strictEqual(calls.length, 1, JSON.stringify(calls, null, 2));
  assert.strictEqual(calls[0].records[0].fields.length, 2);
});
