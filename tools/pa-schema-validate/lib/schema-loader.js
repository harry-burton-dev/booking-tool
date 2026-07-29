'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseYaml, toPlain } = require('./yaml-parse');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'pa.schema.yaml');

let cached = null;

// Loads and parses the vendored pa.schema.yaml into a plain JS object
// (definitions, properties, etc.), caching across calls in one process.
function loadSchema() {
  if (!cached) {
    const text = fs.readFileSync(SCHEMA_PATH, 'utf8');
    cached = toPlain(parseYaml(text, SCHEMA_PATH));
  }
  return cached;
}

module.exports = { loadSchema, SCHEMA_PATH };
