#!/usr/bin/env node
'use strict';
// pa-lint - pre-publish lint for Power Apps Canvas App YAML.
//
// Because compile IS publish (there is no local runtime), this is the only
// validation workers can run without shipping. Every check exists because its
// defect class actually recurred; see docs/02-PROCESS-V2.md section 3.1.
//
// Usage:
//   node lint.js [--src <dir>] [--config <file>] [--json] [--strict]
//                [--checks L1,L5,...]
//   node lint.js normalize <file...>            # print normalized YAML
//   node lint.js check-markers <marker...>      # rung-3 marker grep (--src)
//
// Exit codes: 0 clean, 1 findings (errors; warnings too with --strict),
//             2 usage/config error.

const fs = require('node:fs');
const path = require('node:path');
const { runChecks } = require('./lib/runner');
const { normalizeText } = require('./lib/normalize');
const { checkMarkers } = require('./lib/markers');

function fail(msg) {
  process.stderr.write(`pa-lint: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { src: 'Src', config: null, json: false, strict: false, checks: null, rest: [] };
  let cmd = 'lint';
  let i = 0;
  if (argv[0] === 'normalize' || argv[0] === 'check-markers') { cmd = argv[0]; i = 1; }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') opts.src = argv[++i];
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--checks') opts.checks = argv[++i].split(',').map((s) => s.trim());
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else opts.rest.push(a);
  }
  return { cmd, opts };
}

function loadConfig(opts) {
  let file = opts.config;
  if (!file && fs.existsSync('palint.config.json')) file = 'palint.config.json';
  let cfg = {};
  if (file) {
    try {
      cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      fail(`could not read config ${file}: ${e.message}`);
    }
    // Schema paths in the config are relative to the config file.
    if (cfg.seedSchemas) {
      const base = path.dirname(path.resolve(file));
      for (const k of Object.keys(cfg.seedSchemas)) {
        cfg.seedSchemas[k] = path.resolve(base, cfg.seedSchemas[k]);
      }
    }
  }
  if (opts.checks) cfg.checks = opts.checks;
  return cfg;
}

const { cmd, opts } = parseArgs(process.argv.slice(2));

if (cmd === 'normalize') {
  if (opts.rest.length === 0) fail('normalize: no files given');
  for (const f of opts.rest) {
    if (!fs.existsSync(f)) fail(`normalize: no such file ${f}`);
    process.stdout.write(normalizeText(fs.readFileSync(f, 'utf8')));
  }
  process.exit(0);
}

if (cmd === 'check-markers') {
  if (opts.rest.length === 0) fail('check-markers: no markers given');
  if (!fs.existsSync(opts.src)) fail(`source directory not found: ${opts.src}`);
  const results = checkMarkers(opts.src, opts.rest);
  const stamp = new Date().toTimeString().slice(0, 5); // local time - all rung stamps share one clock
  let missing = 0;
  for (const r of results) {
    if (r.found) {
      const first = r.sites[0];
      process.stdout.write(
        `FOUND   ${r.marker}  (${path.basename(first.file)}:${first.line}` +
        `${r.sites.length > 1 ? ` +${r.sites.length - 1} more` : ''})\n`,
      );
    } else {
      missing++;
      process.stdout.write(`MISSING ${r.marker}\n`);
    }
  }
  process.stdout.write(`checked at ${stamp} - rung 3 only: proves the text landed, not that it escaped the coauthoring fork\n`);
  process.exit(missing > 0 ? 1 : 0);
}

let findings;
try {
  findings = runChecks(opts.src, loadConfig(opts));
} catch (e) {
  fail(e.message);
}

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');
const failed = errors.length > 0 || (opts.strict && warnings.length > 0);

if (opts.json) {
  process.stdout.write(JSON.stringify({
    findings,
    summary: { errors: errors.length, warnings: warnings.length, failed },
  }, null, 2) + '\n');
} else {
  for (const f of findings) {
    process.stdout.write(
      `${path.relative(process.cwd(), f.file)}:${f.line} [${f.check} ${f.severity}] ${f.message}\n`,
    );
  }
  process.stdout.write(
    findings.length === 0
      ? 'pa-lint: clean\n'
      : `pa-lint: ${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
}
process.exit(failed ? 1 : 0);
