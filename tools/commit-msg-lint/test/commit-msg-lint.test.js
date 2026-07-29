'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'commit-msg-lint.js');

// Run the CLI over a message written to a temp file, as git does.
// Returns { code, out }.
function lint(message, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-'));
  const file = path.join(dir, 'COMMIT_EDITMSG');
  fs.writeFileSync(file, message, 'utf8');
  try {
    const out = execFileSync(process.execPath, [CLI, file].concat(args || []), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts a conventional subject with a scope', () => {
  const r = lint('feat(pa-lint): add L4 seed-schema check\n');
  assert.strictEqual(r.code, 0, r.out);
});

test('accepts a conventional subject without a scope', () => {
  const r = lint('docs: record Q8 research findings\n');
  assert.strictEqual(r.code, 0, r.out);
});

test('accepts a trailing ID list', () => {
  const r = lint('fix(guard): fail closed on stale snapshot (P8, DA-3)\n');
  assert.strictEqual(r.code, 0, r.out);
});

test('rejects an unknown type', () => {
  const r = lint('update(pa-lint): tweak things\n');
  assert.strictEqual(r.code, 1);
  assert.ok(/unknown type "update"/i.test(r.out), r.out);
  // The message must list the valid types - a gate that does not say how to
  // pass it is a gate people disable.
  assert.ok(/feat/.test(r.out) && /refactor/.test(r.out), r.out);
});

test('rejects a missing type prefix entirely', () => {
  const r = lint('made the linter better\n');
  assert.strictEqual(r.code, 1);
  assert.ok(/type\(scope\): summary/.test(r.out), r.out);
});

test('rejects an empty summary', () => {
  const r = lint('feat(pa-lint):\n');
  assert.strictEqual(r.code, 1);
});

test('rejects a subject over the length limit and names the limit', () => {
  const r = lint('feat(x): ' + 'y'.repeat(100) + '\n');
  assert.strictEqual(r.code, 1);
  assert.ok(/72/.test(r.out), r.out);
});

test('subject length limit is configurable', () => {
  const r = lint('feat(x): ' + 'y'.repeat(100) + '\n', ['--max-subject', '200']);
  assert.strictEqual(r.code, 0, r.out);
});

test('requires a blank line between subject and body', () => {
  const r = lint('feat(x): a summary\nbody starts immediately\n');
  assert.strictEqual(r.code, 1);
  assert.ok(/blank line/i.test(r.out), r.out);
});

test('accepts a properly separated body', () => {
  const r = lint('feat(x): a summary\n\nA body paragraph explaining why.\n');
  assert.strictEqual(r.code, 0, r.out);
});

test('ignores comment lines when locating the subject', () => {
  const r = lint('# Please enter the commit message\nfeat(x): a summary\n');
  assert.strictEqual(r.code, 0, r.out);
});

test('skips merge commits', () => {
  const r = lint("Merge branch 'main' into feature\n");
  assert.strictEqual(r.code, 0, r.out);
});

test('skips revert and fixup/squash commits', () => {
  assert.strictEqual(lint('Revert "feat(x): a summary"\n').code, 0);
  assert.strictEqual(lint('fixup! feat(x): a summary\n').code, 0);
  assert.strictEqual(lint('squash! feat(x): a summary\n').code, 0);
});

test('--require-ids enforces a trailing ID list', () => {
  assert.strictEqual(lint('feat(x): no ids here\n', ['--require-ids']).code, 1);
  assert.strictEqual(lint('feat(x): has ids (WS4)\n', ['--require-ids']).code, 0);
});

test('an empty or comment-only message exits 2, not 1', () => {
  // Aborting a commit by emptying the buffer is git's own flow - that is a
  // usage condition, not a convention violation.
  const r = lint('# only a comment\n');
  assert.strictEqual(r.code, 2, r.out);
});

test('a missing message file exits 2 with a clear message', () => {
  let code = 0;
  let out = '';
  try {
    execFileSync(process.execPath, [CLI, path.join(__dirname, 'nope.txt')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  assert.strictEqual(code, 2);
  assert.ok(/cannot read/i.test(out), out);
});

test('no arguments exits 2 with usage', () => {
  let code = 0;
  let out = '';
  try {
    execFileSync(process.execPath, [CLI], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  assert.strictEqual(code, 2);
  assert.ok(/usage/i.test(out), out);
});
