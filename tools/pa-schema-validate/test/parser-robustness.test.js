'use strict';
// Robustness tests for the hand-rolled YAML subset parser.
//
// The parser is the risky part of this tool: a hand-rolled parser's failure
// mode is not a crash, it is silently mis-parsing and then validating a tree
// that is not what the file says. These tests exist to pin the behaviour that
// matters - that nothing is dropped without a finding.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseYaml, YamlParseError } = require('../lib/yaml-parse');
const { validateFile } = require('../lib/validate-file');

const CLI = path.join(__dirname, '..', 'validate.js');

function withFile(name, body, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psv-'));
  const f = path.join(dir, name);
  fs.writeFileSync(f, body, 'utf8');
  try {
    return fn(f, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function cli(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('misindented content is reported, never silently dropped', () => {
  // Regression: a sequence loop used to break on the unexpected indent, every
  // enclosing loop broke too, and the rest of the file was abandoned - so this
  // validated "clean" with control "b" missing from the tree entirely.
  const src =
    'Screens:\n  Home:\n    Children:\n      - a:\n          Control: Label\n     - b:\n          Control: Label\n';
  assert.throws(() => parseYaml(src), YamlParseError);
  withFile('C.pa.yaml', src, (f) => {
    const findings = validateFile(f);
    assert.strictEqual(findings.length, 1, JSON.stringify(findings));
    assert.strictEqual(findings[0].check, 'PARSE');
    assert.strictEqual(findings[0].line, 6);
  });
});

test('trailing garbage after a valid document is reported', () => {
  const src = 'Screens:\n  Home:\n    Properties:\n      Fill: =RGBA(1,1,1,1)\n\n   stray: value\n';
  withFile('D.pa.yaml', src, (f) => {
    const findings = validateFile(f);
    assert.ok(findings.some((x) => x.check === 'PARSE'), JSON.stringify(findings));
  });
});

test('every control in a well-formed Children sequence survives parsing', () => {
  const src =
    'Screens:\n  Home:\n    Children:\n' +
    ['a', 'b', 'c', 'd'].map((n) => `      - ${n}:\n          Control: Label\n`).join('');
  const root = parseYaml(src);
  const children = root.entries[0].value.entries[0].value.entries[0].value;
  assert.strictEqual(children.kind, 'seq');
  assert.strictEqual(children.items.length, 4);
  assert.deepStrictEqual(
    children.items.map((i) => i.entries[0].key),
    ['a', 'b', 'c', 'd']
  );
});

test('a block scalar containing ": " and quoted colon-keys stays opaque', () => {
  // The real corpus embeds Power Fx like 'RoomID: Title': {Id: x} inside
  // block scalars. Those must be scalar CONTENT, never parsed as structure -
  // if they leak into the tree they become bogus schema violations.
  const src =
    'Screens:\n  Home:\n    Properties:\n      OnVisible: |-\n' +
    "        =Patch(Book_Bookings, Defaults(Book_Bookings), {\n" +
    "            'RoomID: Title': {Id: 1, Value: \"Room A\"},\n" +
    "            '@odata.type': \"#Microsoft.Azure\"\n" +
    '        })\n';
  const root = parseYaml(src);
  const props = root.entries[0].value.entries[0].value.entries[0].value;
  const onVisible = props.entries.find((e) => e.key === 'OnVisible').value;
  assert.strictEqual(onVisible.kind, 'scalar');
  assert.ok(onVisible.value.includes("'RoomID: Title'"), onVisible.value);
  assert.ok(onVisible.value.startsWith('='), onVisible.value);
  withFile('E.pa.yaml', src, (f) => {
    assert.deepStrictEqual(validateFile(f), []);
  });
});

test('a large block scalar is captured whole, not truncated', () => {
  const big = 'x'.repeat(40000);
  const src = `Screens:\n  Home:\n    Properties:\n      OnVisible: |-\n        =${big}\n`;
  const root = parseYaml(src);
  const props = root.entries[0].value.entries[0].value.entries[0].value;
  const v = props.entries.find((e) => e.key === 'OnVisible').value.value;
  assert.strictEqual(v.length, big.length + 1);
});

test('an empty file parses to an empty document and is clean', () => {
  withFile('F.pa.yaml', '', (f) => {
    assert.deepStrictEqual(validateFile(f), []);
  });
});

test('CLI exits 0 clean, 1 on findings, 2 on a missing --src', () => {
  const good = 'Screens:\n  Home:\n    Properties:\n      Fill: =RGBA(1,1,1,1)\n';
  withFile('G.pa.yaml', good, (f, dir) => {
    assert.strictEqual(cli(['--src', dir]).code, 0);
  });
  const bad = 'Screens:\n  Home:\n    Propertiess:\n      Fill: =RGBA(1,1,1,1)\n';
  withFile('H.pa.yaml', bad, (f, dir) => {
    assert.strictEqual(cli(['--src', dir]).code, 1);
  });
  assert.strictEqual(cli(['--src', path.join(os.tmpdir(), 'psv-does-not-exist-xyz')]).code, 2);
});

test('--json emits parseable findings', () => {
  const bad = 'Screens:\n  Home:\n    Propertiess:\n      Fill: =RGBA(1,1,1,1)\n';
  withFile('I.pa.yaml', bad, (f, dir) => {
    const r = cli(['--src', dir, '--json']);
    const parsed = JSON.parse(r.out);
    const list = Array.isArray(parsed) ? parsed : parsed.findings;
    assert.ok(Array.isArray(list) && list.length >= 1, r.out);
    assert.ok(list[0].file && list[0].line && list[0].message, r.out);
  });
});
