'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'revert-check.js');
const FIX = path.join(__dirname, 'fixtures');

const MAIN_SRC = path.join(FIX, 'main', 'src');
const MAIN_CONTRACT = path.join(FIX, 'main', 'REVERT-CONTRACT.md');
const CLEAN_CONTRACT = path.join(FIX, 'clean', 'contract.md');
const CLEAN_DEV_SRC = path.join(FIX, 'clean', 'dev-src');
const CLEAN_PROD_SRC = path.join(FIX, 'clean', 'prod-src');
const MALFORMED_CONTRACT = path.join(FIX, 'contract-malformed.md');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function runJson(args) {
  const result = run([...args, '--json']);
  let data = null;
  try {
    data = JSON.parse(result.stdout);
  } catch (err) {
    assert.fail(`--json output is not valid JSON: ${err.message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
  return { result, data };
}

function mainRun() {
  return runJson(['--src', MAIN_SRC, '--contract', MAIN_CONTRACT]);
}

function sitesFor(data, id) {
  return data.sites.filter((site) => site.id === id);
}

test('marker with dev pattern in window gets status DEV (multi-line pattern, // style)', () => {
  const { data } = mainRun();
  const sites = sitesFor(data, 'r-dev');
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].status, 'DEV');
  assert.strictEqual(sites[0].file, 'Screen1.pa.yaml');
  assert.ok(sites[0].line > 0);
});

test('marker with prod pattern in window gets status PROD (block comment style)', () => {
  const { data } = mainRun();
  const sites = sitesFor(data, 'r-prod');
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].status, 'PROD');
  assert.strictEqual(sites[0].file, 'Screen1.pa.yaml');
});

test('marker with neither pattern gets status UNKNOWN', () => {
  const { data } = mainRun();
  const sites = sitesFor(data, 'r-unknown');
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].status, 'UNKNOWN');
});

test('marker with both patterns gets status AMBIGUOUS', () => {
  const { data } = mainRun();
  const sites = sitesFor(data, 'r-ambig');
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].status, 'AMBIGUOUS');
});

test('same id at two marker sites yields two site rows (recursive scan into subdir)', () => {
  const { data } = mainRun();
  const sites = sitesFor(data, 'r-two-sites');
  assert.strictEqual(sites.length, 2);
  for (const site of sites) {
    assert.strictEqual(site.status, 'PROD');
    assert.strictEqual(site.file, 'Sub/Screen3.pa.yaml');
  }
});

test('marker id not in contract is reported as orphan marker', () => {
  const { data } = mainRun();
  assert.deepStrictEqual(data.orphanMarkers, ['r-orphan']);
  const sites = sitesFor(data, 'r-orphan');
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].status, 'ORPHAN');
});

test('contract entry with no marker anywhere is reported as orphan contract entry', () => {
  const { data } = mainRun();
  assert.deepStrictEqual(data.orphanContractEntries, ['r-nomarker']);
});

test('summary counts are correct for the main fixture', () => {
  const { data } = mainRun();
  assert.deepStrictEqual(data.summary, {
    sites: 7,
    dev: 1,
    prod: 3,
    unknown: 1,
    ambiguous: 1,
    orphanMarkerSites: 1,
    orphanContractEntries: 1,
  });
});

test('--json output has the expected shape', () => {
  const { data } = mainRun();
  assert.deepStrictEqual(
    Object.keys(data).sort(),
    ['ok', 'orphanContractEntries', 'orphanMarkers', 'requireProd', 'sites', 'summary'],
  );
  for (const site of data.sites) {
    assert.deepStrictEqual(Object.keys(site).sort(), ['file', 'id', 'line', 'status']);
    assert.strictEqual(typeof site.line, 'number');
  }
  assert.strictEqual(data.ok, false);
});

test('exit 1 when orphans or UNKNOWN/AMBIGUOUS sites exist', () => {
  const { result } = mainRun();
  assert.strictEqual(result.status, 1);
});

test('exit 0 for clean tree with DEV and PROD sites (no --require-prod)', () => {
  const result = run(['--src', CLEAN_DEV_SRC, '--contract', CLEAN_CONTRACT]);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
});

test('exit 1 with --require-prod when a DEV site remains', () => {
  const result = run(['--src', CLEAN_DEV_SRC, '--contract', CLEAN_CONTRACT, '--require-prod']);
  assert.strictEqual(result.status, 1);
});

test('exit 0 with --require-prod when every site is PROD', () => {
  const result = run(['--src', CLEAN_PROD_SRC, '--contract', CLEAN_CONTRACT, '--require-prod']);
  assert.strictEqual(result.status, 0);
});

test('human-readable output includes per-site table, orphans, and summary', () => {
  const result = run(['--src', MAIN_SRC, '--contract', MAIN_CONTRACT]);
  assert.match(result.stdout, /Screen1\.pa\.yaml:\d+/);
  assert.match(result.stdout, /r-dev/);
  assert.match(result.stdout, /AMBIGUOUS/);
  assert.match(result.stdout, /r-orphan/);
  assert.match(result.stdout, /r-nomarker/);
  assert.match(result.stdout, /Summary/i);
});

test('missing --src directory exits 2 with a clear message', () => {
  const result = run(['--src', path.join(FIX, 'does-not-exist'), '--contract', MAIN_CONTRACT]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /does-not-exist/);
});

test('unreadable contract file exits 2 with a clear message', () => {
  const result = run(['--src', MAIN_SRC, '--contract', path.join(FIX, 'no-such-contract.md')]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /no-such-contract\.md/);
});

test('malformed contract entry exits 2 and names the entry', () => {
  const result = run(['--src', MAIN_SRC, '--contract', MALFORMED_CONTRACT]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /bad-entry/);
});

test('missing required arguments exits 2 with usage', () => {
  const result = run([]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /--src/);
});
