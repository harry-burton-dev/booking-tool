'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'session-close.js');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@e',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@e',
    }),
  });
}

// A repo with an "origin" it can actually push to, so ahead/behind is real.
function makeRepo(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  fs.mkdirSync(remote);
  git(remote, ['init', '--bare', '-q']);
  fs.mkdirSync(work);
  git(work, ['init', '-q', '-b', 'main']);
  git(work, ['remote', 'add', 'origin', remote]);
  fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'chore: init']);
  git(work, ['push', '-q', '-u', 'origin', 'main']);
  try {
    return fn(work);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function run(cwd, args, env) {
  try {
    const out = execFileSync(process.execPath, [CLI].concat(args || []), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, env || {}),
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('a clean, fully pushed repo reports nothing to do', () => {
  makeRepo((work) => {
    const r = run(work);
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(/clean/i.test(r.out), r.out);
  });
});

test('an uncommitted change is reported and the file named', () => {
  makeRepo((work) => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'changed\n');
    const r = run(work);
    assert.ok(/uncommitted/i.test(r.out), r.out);
    assert.ok(/a\.txt/.test(r.out), r.out);
  });
});

test('untracked files are reported too', () => {
  makeRepo((work) => {
    fs.writeFileSync(path.join(work, 'new.pa.yaml'), 'x\n');
    const r = run(work);
    assert.ok(/new\.pa\.yaml/.test(r.out), r.out);
  });
});

test('unpushed commits are reported with a count', () => {
  makeRepo((work) => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'two\n');
    git(work, ['add', '-A']);
    git(work, ['commit', '-q', '-m', 'fix: two']);
    const r = run(work);
    assert.ok(/unpushed|not pushed/i.test(r.out), r.out);
    assert.ok(/\b1\b/.test(r.out), r.out);
  });
});

test('a branch with no upstream is reported, not crashed on', () => {
  makeRepo((work) => {
    git(work, ['checkout', '-q', '-b', 'feature']);
    fs.writeFileSync(path.join(work, 'a.txt'), 'three\n');
    git(work, ['add', '-A']);
    git(work, ['commit', '-q', '-m', 'feat: three']);
    const r = run(work);
    assert.ok(/upstream/i.test(r.out), r.out);
    assert.notStrictEqual(r.code, 2);
  });
});

test('a publish recorded this session with uncommitted source escalates', () => {
  makeRepo((work) => {
    const state = path.join(work, '.claude', 'canvas-guard', 'state');
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(
      path.join(state, 'baseline.meta'),
      'recorded=2026-07-29T12:00:00+01:00\nsource=x\nsession=SESSION-A\n'
    );
    fs.writeFileSync(path.join(work, 'a.txt'), 'published but not committed\n');
    const r = run(work, [], { CLAUDE_SESSION_ID: 'SESSION-A' });
    // The whole point of P5: the live app has changes git does not.
    assert.ok(/live app/i.test(r.out), r.out);
    assert.ok(/publish/i.test(r.out), r.out);
  });
});

test('a publish from a different session does not escalate', () => {
  makeRepo((work) => {
    const state = path.join(work, '.claude', 'canvas-guard', 'state');
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, 'baseline.meta'), 'session=SOMEONE-ELSE\n');
    fs.writeFileSync(path.join(work, 'a.txt'), 'changed\n');
    const r = run(work, [], { CLAUDE_SESSION_ID: 'SESSION-A' });
    assert.ok(!/live app/i.test(r.out), r.out);
  });
});

test('--block exits 2 when there are findings, 0 when clean', () => {
  makeRepo((work) => {
    assert.strictEqual(run(work, ['--block']).code, 0);
    fs.writeFileSync(path.join(work, 'a.txt'), 'dirty\n');
    assert.strictEqual(run(work, ['--block']).code, 2);
  });
});

test('without --block it never blocks, even with findings', () => {
  makeRepo((work) => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'dirty\n');
    assert.strictEqual(run(work, []).code, 0);
  });
});

test('outside a git repo it exits 0 and says so rather than crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-nogit-'));
  try {
    const r = run(dir);
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(/not a git repo/i.test(r.out), r.out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
