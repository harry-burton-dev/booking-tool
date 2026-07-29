'use strict';
// L9: strip known server-normalization noise so diffs show real drift.
// The compiler round-trip strips default-equal properties and control version
// suffixes; without normalization every post-publish diff is polluted with
// false drift (triage by line-count delta was the manual workaround).

const DEFAULT_EQUAL_PROPS = [
  'Checked: =false',
  'TabIndex: =0',
];

function normalizeText(text, opts) {
  const drop = new Set(((opts && opts.defaultEqualProps) || DEFAULT_EQUAL_PROPS));
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (drop.has(trimmed)) continue;
    out.push(line.replace(/^(\s*Control:\s*[^@\s]+)@[\d.]+\s*$/, '$1').trimEnd());
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

module.exports = { normalizeText, DEFAULT_EQUAL_PROPS };
