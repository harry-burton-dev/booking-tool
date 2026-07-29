#!/usr/bin/env node
'use strict';
// pa-schema-validate - validates Power Apps Canvas App .pa.yaml source against
// Microsoft's published JSON Schema (vendored under schema/pa.schema.yaml).
//
// pa-lint's checks are a line model and deliberately do not parse YAML (a
// real parser would happily accept the exact defect L1 exists to catch).
// This tool is the opposite trade: a real tree, to catch what a line model
// structurally cannot see - unknown/typo'd keys, malformed control trees,
// bad z-order sequences (two controls merged into one Children slot), and
// wrong-typed properties.
//
// Usage:
//   node validate.js [--src <dir>] [--json]
//
// Exit codes: 0 clean, 1 findings, 2 usage error.

const fs = require('node:fs');
const path = require('node:path');
const { validateFiles } = require('./lib/validate-file');

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

function fail(msg) {
  process.stderr.write(`pa-schema-validate: ${msg}\n`);
  process.exit(EXIT_USAGE);
}

function parseArgs(argv) {
  const opts = { src: 'Src', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') opts.src = argv[++i];
    else if (a === '--json') opts.json = true;
    else fail(`unknown option ${a}`);
  }
  return opts;
}

function listPaYaml(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.pa.yaml')) out.push(p);
    }
  })(dir);
  return out.sort();
}

const opts = parseArgs(process.argv.slice(2));
if (!fs.existsSync(opts.src)) fail(`source directory not found: ${opts.src}`);

const files = listPaYaml(opts.src);
const findings = validateFiles(files);
const failed = findings.length > 0;

if (opts.json) {
  process.stdout.write(JSON.stringify({
    findings,
    summary: { files: files.length, errors: findings.length, failed },
  }, null, 2) + '\n');
} else {
  for (const f of findings) {
    process.stdout.write(`${path.relative(process.cwd(), f.file)}:${f.line} [${f.check} ${f.severity}] ${f.message}\n`);
  }
  process.stdout.write(
    findings.length === 0
      ? `pa-schema-validate: clean (${files.length} file(s))\n`
      : `pa-schema-validate: ${findings.length} error(s) across ${files.length} file(s)\n`,
  );
}
process.exit(failed ? EXIT_FINDINGS : EXIT_OK);
