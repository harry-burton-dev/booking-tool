'use strict';
// Tests for guard.sh's verification-decay (TTL) commands.
// Shells out to the real script - the point of these commands is their
// fail-closed exit codes, which only the script itself can demonstrate.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const GUARD = path.join(__dirname, '..', 'guard.sh');

function withState(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-ttl-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function guard(state, args, env) {
  try {
    const out = execFileSync('bash', [GUARD].concat(args), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { CANVAS_GUARD_STATE: state }, env || {}),
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// Rewrite a stamp's recorded epoch so staleness can be tested without waiting.
function backdate(state, slug, secondsAgo) {
  const f = path.join(state, 'verified', slug);
  const body = fs.readFileSync(f, 'utf8');
  const older = Math.floor(Date.now() / 1000) - secondsAgo;
  fs.writeFileSync(f, body.replace(/^epoch=\d+$/m, `epoch=${older}`), 'utf8');
}

test('a fresh verification stamp passes verified-at', () => {
  withState((state) => {
    const rec = guard(state, ['verified', 'pa-lint clean']);
    assert.strictEqual(rec.code, 0, rec.out);
    const chk = guard(state, ['verified-at', 'pa-lint clean']);
    assert.strictEqual(chk.code, 0, chk.out);
  });
});

test('a stamp older than the TTL is reported STALE and exits 2', () => {
  withState((state) => {
    guard(state, ['verified', 'pa-lint clean']);
    backdate(state, 'pa-lint-clean', 60 * 60);
    const chk = guard(state, ['verified-at', 'pa-lint clean']);
    assert.strictEqual(chk.code, 2, chk.out);
    assert.ok(/stale/i.test(chk.out), chk.out);
    // Must say how old and what the limit was, or the claim cannot be re-earned.
    assert.ok(/60m|3600/.test(chk.out), chk.out);
  });
});

test('an unknown claim fails closed rather than passing silently', () => {
  withState((state) => {
    const chk = guard(state, ['verified-at', 'never verified this']);
    assert.strictEqual(chk.code, 2, chk.out);
    assert.ok(/no verification/i.test(chk.out), chk.out);
  });
});

test('TTL is configurable', () => {
  withState((state) => {
    guard(state, ['verified', 'pa-lint clean']);
    backdate(state, 'pa-lint-clean', 30 * 60);
    // Default TTL (20m) - stale.
    assert.strictEqual(guard(state, ['verified-at', 'pa-lint clean']).code, 2);
    // Raised TTL - fresh again.
    const chk = guard(state, ['verified-at', 'pa-lint clean'], {
      CANVAS_GUARD_VERIFY_TTL_MIN: '90',
    });
    assert.strictEqual(chk.code, 0, chk.out);
  });
});

test('verified-at with no claim lists every stamp with its age and state', () => {
  withState((state) => {
    guard(state, ['verified', 'pa-lint clean']);
    guard(state, ['verified', 'schema snapshot current']);
    backdate(state, 'schema-snapshot-current', 60 * 60);
    const list = guard(state, ['verified-at']);
    assert.ok(/pa-lint clean/.test(list.out), list.out);
    assert.ok(/schema snapshot current/.test(list.out), list.out);
    assert.ok(/FRESH/.test(list.out) && /STALE/.test(list.out), list.out);
  });
});

test('status surfaces verification stamps', () => {
  withState((state) => {
    guard(state, ['verified', 'pa-lint clean']);
    const st = guard(state, ['status']);
    assert.strictEqual(st.code, 0, st.out);
    assert.ok(/pa-lint clean/.test(st.out), st.out);
  });
});

test('verified with no claim exits 1 with usage', () => {
  withState((state) => {
    const r = guard(state, ['verified']);
    assert.strictEqual(r.code, 1, r.out);
  });
});

test('claims differing only by punctuation or case do not collide', () => {
  withState((state) => {
    guard(state, ['verified', 'L4 schema OK']);
    const chk = guard(state, ['verified-at', 'L6 schema OK']);
    assert.strictEqual(chk.code, 2, chk.out);
  });
});
