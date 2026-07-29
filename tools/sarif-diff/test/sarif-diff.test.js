'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'sarif-diff.js');
const FIX = path.join(__dirname, 'fixtures');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function runJson(args) {
  const result = run([...args, '--json']);
  let data = null;
  try {
    data = JSON.parse(result.stdout);
  } catch (err) {
    assert.fail(
      `--json output is not valid JSON: ${err.message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  return { result, data };
}

function fixture(name, file) {
  return path.join(FIX, name, file);
}

function diffArgs(name, extra = []) {
  return ['--baseline', fixture(name, 'baseline.sarif'), '--current', fixture(name, 'current.sarif'), ...extra];
}

// --- identical files: no diff, exit 0 ---

test('identical baseline and current produce no new/fixed issues and exit 0', () => {
  const { result, data } = runJson(diffArgs('identical'));
  assert.strictEqual(result.status, 0);
  assert.deepStrictEqual(data.new, []);
  assert.deepStrictEqual(data.fixed, []);
  assert.strictEqual(data.summary.unchanged.total, 1);
  assert.strictEqual(data.ok, true);
});

// --- new error: reported NEW, exit 1 ---

test('a new error not present in baseline is reported as NEW and exits 1', () => {
  const { result, data } = runJson(diffArgs('new-error'));
  assert.strictEqual(result.status, 1);
  assert.strictEqual(data.new.length, 1);
  assert.strictEqual(data.new[0].ruleId, 'app-checker-undefined-var');
  assert.strictEqual(data.new[0].level, 'error');
  assert.strictEqual(data.new[0].file, 'Screen2.fx.yaml');
  assert.deepStrictEqual(data.fixed, []);
  assert.strictEqual(data.ok, false);
});

// --- removed error: reported FIXED, exit 0 ---

test('an error present in baseline but not current is reported as FIXED and exits 0', () => {
  const { result, data } = runJson(diffArgs('fixed-error'));
  assert.strictEqual(result.status, 0);
  assert.strictEqual(data.fixed.length, 1);
  assert.strictEqual(data.fixed[0].ruleId, 'app-checker-undefined-var');
  assert.deepStrictEqual(data.new, []);
  assert.strictEqual(data.ok, true);
});

// --- line drift: same issue at a different line is NOT new ---

test('same ruleId+file+message at a different line is not reported as new (line-drift)', () => {
  const { result, data } = runJson(diffArgs('line-drift'));
  assert.strictEqual(result.status, 0);
  assert.deepStrictEqual(data.new, []);
  assert.deepStrictEqual(data.fixed, []);
  assert.strictEqual(data.summary.unchanged.total, 1);
  assert.strictEqual(data.ok, true);
});

// --- malformed / non-SARIF JSON: exit 2 ---

test('malformed JSON in baseline exits 2 with a clear message', () => {
  const result = run([
    '--baseline',
    path.join(FIX, 'malformed.json'),
    '--current',
    fixture('identical', 'current.sarif'),
  ]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /malformed\.json/);
});

test('valid JSON that is not SARIF (no runs array) exits 2 with a clear message', () => {
  const result = run([
    '--baseline',
    path.join(FIX, 'not-sarif.json'),
    '--current',
    fixture('identical', 'current.sarif'),
  ]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /not-sarif\.json/);
});

test('unreadable file exits 2 with a clear message', () => {
  const result = run([
    '--baseline',
    path.join(FIX, 'does-not-exist.sarif'),
    '--current',
    fixture('identical', 'current.sarif'),
  ]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /does-not-exist\.sarif/);
});

// --- empty results arrays: exit 0 ---

test('empty results arrays in both files produce no diff and exit 0', () => {
  const { result, data } = runJson(diffArgs('empty-results'));
  assert.strictEqual(result.status, 0);
  assert.deepStrictEqual(data.new, []);
  assert.deepStrictEqual(data.fixed, []);
  assert.strictEqual(data.ok, true);
});

// --- --fail-on threshold ---

test('default --fail-on error does not block on a new warning-only current', () => {
  const { result, data } = runJson(diffArgs('fail-on'));
  assert.strictEqual(data.new.length, 2);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(data.ok, true);
});

test('--fail-on warning blocks when a new warning is introduced', () => {
  const { result, data } = runJson(diffArgs('fail-on', ['--fail-on', 'warning']));
  assert.strictEqual(result.status, 1);
  assert.strictEqual(data.ok, false);
});

test('--fail-on note blocks on a new note-level issue', () => {
  const { result, data } = runJson(diffArgs('fail-on', ['--fail-on', 'note']));
  assert.strictEqual(result.status, 1);
  assert.strictEqual(data.ok, false);
});

test('invalid --fail-on value exits 2 with a clear message', () => {
  const result = run([...diffArgs('identical'), '--fail-on', 'bogus']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /--fail-on/);
});

// --- optional/missing SARIF fields handled gracefully ---

test('results missing ruleId, locations, or level do not crash and identical files still match', () => {
  const { result, data } = runJson(diffArgs('optional-fields'));
  assert.strictEqual(result.status, 0);
  assert.deepStrictEqual(data.new, []);
  assert.deepStrictEqual(data.fixed, []);
  assert.strictEqual(data.ok, true);
});

// --- comprehensive fixture: mix of unchanged, new, fixed, line-drift ---

test('main fixture: unchanged/new/fixed counts are correct', () => {
  const { data } = runJson(diffArgs('main'));
  assert.strictEqual(data.summary.unchanged.total, 3);
  assert.strictEqual(data.summary.fixed.total, 1);
  assert.strictEqual(data.summary.new.total, 2);
  assert.strictEqual(data.fixed[0].ruleId, 'app-checker-unused-var');
  const newRuleIds = data.new.map((issue) => issue.ruleId).sort();
  assert.deepStrictEqual(newRuleIds, ['app-checker-new-issue', 'app-checker-new-warning']);
});

test('main fixture exits 1 (a new error was introduced)', () => {
  const result = run(diffArgs('main'));
  assert.strictEqual(result.status, 1);
});

test('--json output has the expected shape', () => {
  const { data } = runJson(diffArgs('main'));
  assert.deepStrictEqual(Object.keys(data).sort(), ['failOn', 'fixed', 'new', 'ok', 'summary']);
  for (const issue of [...data.new, ...data.fixed]) {
    assert.deepStrictEqual(Object.keys(issue).sort(), ['file', 'level', 'line', 'message', 'ruleId']);
  }
});

test('human-readable output includes NEW/FIXED sections and a summary line', () => {
  const result = run(diffArgs('main'));
  assert.match(result.stdout, /NEW/);
  assert.match(result.stdout, /FIXED/);
  assert.match(result.stdout, /app-checker-new-issue/);
  assert.match(result.stdout, /app-checker-unused-var/);
  assert.match(result.stdout, /Summary/i);
});

test('missing required arguments exits 2 with usage', () => {
  const result = run([]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /--baseline/);
});
