'use strict';
const fs = require('node:fs');
const { parseYaml, YamlParseError } = require('./yaml-parse');
const { validate } = require('./json-schema');
const { loadSchema } = require('./schema-loader');

// Parses and schema-validates one .pa.yaml file. Returns findings:
// [{check: 'PARSE'|'SCHEMA', severity: 'error', file, line, message}]
// A parse failure is reported as a single PARSE finding rather than thrown,
// so a walk over many files can keep going and report every file's status.
function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  let node;
  try {
    node = parseYaml(text, filePath);
  } catch (e) {
    if (e instanceof YamlParseError) {
      return [{ check: 'PARSE', severity: 'error', file: filePath, line: e.line, message: e.message }];
    }
    throw e;
  }
  return validate(loadSchema(), node, { file: filePath });
}

function validateFiles(filePaths) {
  const findings = [];
  for (const f of filePaths) findings.push(...validateFile(f));
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return findings;
}

module.exports = { validateFile, validateFiles };
