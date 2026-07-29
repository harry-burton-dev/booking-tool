'use strict';
// L4: mock seeds must mirror the LIVE schema - names AND types. A Text-vs-
// Number RoomID.Value seed masked the app's worst production bug (a broken
// double-booking guard, 14 type-error sites). Wrong seeds create false
// confidence, which is worse than failing.
//
// Config: seedSchemas: { <collectionName>: <path to schema snapshot json> }
// Snapshot: { "fields": { "<Field>": "text"|"number"|"boolean"|"date"
//                                   |"lookup-number"|"lookup-text" } }
// Only literals are validated; computed expressions are skipped (documented).

const fs = require('node:fs');
const { findSeedCalls } = require('../lib/fxparse');

function literalMatches(classified, declared) {
  switch (declared) {
    case 'text': return classified.kind === 'text';
    case 'number': return classified.kind === 'number';
    case 'boolean': return classified.kind === 'boolean';
    case 'date': return true; // date literals are expressions (Date(...)) - skipped
    case 'lookup-number':
    case 'lookup-text': {
      if (classified.kind !== 'record') return false;
      const value = (classified.fields || []).find((f) => f.name === 'Value');
      if (!value) return false;
      const want = declared === 'lookup-number' ? 'number' : 'text';
      return value.classified.kind === 'expression' || value.classified.kind === want;
    }
    default: return true; // unknown declared type: don't guess
  }
}

module.exports = {
  id: 'L4',
  run(files, config) {
    const schemaMap = (config && config.seedSchemas) || {};
    const names = Object.keys(schemaMap);
    if (names.length === 0) return [];
    const schemas = {};
    for (const n of names) {
      schemas[n] = JSON.parse(fs.readFileSync(schemaMap[n], 'utf8'));
    }

    const findings = [];
    for (const f of files) {
      for (const p of f.props) {
        if (p.kind !== 'inline' && p.kind !== 'block') continue;
        for (const call of findSeedCalls(p.text, names)) {
          const schema = schemas[call.collection];
          for (const rec of call.records) {
            const recLine =
              p.line + (p.kind === 'block' ? 1 : 0) +
              p.text.slice(0, rec.offset).split('\n').length - 1;
            for (const field of rec.fields) {
              const declared = schema.fields[field.name];
              if (declared === undefined) {
                findings.push({
                  check: 'L4',
                  severity: 'error',
                  file: f.file,
                  line: recLine,
                  message:
                    `${call.collection} seed field "${field.name}" is not in the schema ` +
                    `snapshot (${Object.keys(schema.fields).join(', ')}). Seeds must mirror ` +
                    `the live schema exactly.`,
                });
                continue;
              }
              if (field.classified.kind === 'expression') continue;
              if (!literalMatches(field.classified, declared)) {
                findings.push({
                  check: 'L4',
                  severity: 'error',
                  file: f.file,
                  line: recLine,
                  message:
                    `${call.collection} seed field "${field.name}": literal is ` +
                    `${describe(field.classified)} but the live schema says ${declared}. ` +
                    `Type-unfaithful seeds mask production bugs.`,
                });
              }
            }
          }
        }
      }
    }
    return findings;
  },
};

function describe(classified) {
  if (classified.kind === 'record') {
    const value = (classified.fields || []).find((f) => f.name === 'Value');
    return value ? `a lookup with a ${value.classified.kind} Value` : 'a record';
  }
  return classified.kind;
}
