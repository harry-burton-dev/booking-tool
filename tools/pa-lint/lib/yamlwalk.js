'use strict';
// Line-model parser for Power Apps .pa.yaml source.
// Deliberately NOT a general YAML parser: pa.yaml is machine-generated with a
// stable shape, and every lint check here is line/indent-level. A real YAML
// library would also happily parse the exact defect L1 exists to catch.

const fs = require('node:fs');
const path = require('node:path');

const KEY_RE = /^(\s*)(- )?('([^']+)'|"([^"]+)"|[A-Za-z0-9_.\/]+):(?:\s+(.*))?$/;

// Parse one .pa.yaml file into lines, controls, and property entries.
// Returns { file, lines, controls, props }
//   controls: [{ name, type, line, indent, variant }]
//   props:    [{ prop, line, kind: 'inline'|'block'|'plain', text, control }]
//             kind inline: text is the formula including leading '='
//             kind block:  text is the joined block body (lines trimmed of
//                          common indent), line points at the "Prop: |-" line
function parseFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const controls = [];
  const props = [];
  const stack = []; // innermost-last: { indent, name, ref }

  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const m = KEY_RE.exec(line);
    if (!m) { i++; continue; }

    const listPrefix = m[2] ? m[2].length : 0;
    const indent = m[1].length + listPrefix;
    const key = m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : m[3];
    const value = m[6] !== undefined ? m[6].trimEnd() : '';

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const owner = stack.length ? stack[stack.length - 1].ref : null;

    if (value === '') {
      // Structural key. It is a control declaration iff the next non-blank
      // deeper line is "Control: <type>".
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = j < lines.length ? KEY_RE.exec(lines[j]) : null;
      const nextIndent = next ? next[1].length + (next[2] ? next[2].length : 0) : -1;
      if (next && nextIndent > indent && next[3] === 'Control' && next[6]) {
        const ref = {
          name: key,
          type: next[6].trim().replace(/@[\d.]+$/, ''),
          line: lineNo,
          indent,
          variant: null,
          parent: owner,
        };
        controls.push(ref);
        stack.push({ indent, name: key, ref });
      } else {
        stack.push({ indent, name: key, ref: owner });
      }
      i++;
      continue;
    }

    if (/^\|[+-]?\d*$/.test(value)) {
      // Block scalar: collect body until dedent to <= key indent.
      const body = [];
      let j = i + 1;
      let bodyIndent = -1;
      while (j < lines.length) {
        const b = lines[j];
        if (b.trim() === '') { body.push(''); j++; continue; }
        const bIndent = b.length - b.trimStart().length;
        if (bIndent <= indent) break;
        if (bodyIndent === -1) bodyIndent = bIndent;
        body.push(b.slice(Math.min(bodyIndent, bIndent)));
        j++;
      }
      while (body.length && body[body.length - 1] === '') body.pop();
      props.push({ prop: key, line: lineNo, kind: 'block', text: body.join('\n'), control: owner });
      i = j;
      continue;
    }

    if (value.startsWith('=')) {
      props.push({ prop: key, line: lineNo, kind: 'inline', text: value, control: owner });
    } else {
      props.push({ prop: key, line: lineNo, kind: 'plain', text: value, control: owner });
      if (key === 'Variant' && owner) owner.variant = value.trim();
    }
    i++;
  }

  return { file, lines, controls, props };
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

module.exports = { parseFile, listPaYaml };
