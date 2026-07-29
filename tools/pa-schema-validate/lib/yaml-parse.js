'use strict';
// Minimal block-style YAML subset parser, purpose-built for two documents:
//   1. Machine-generated *.pa.yaml source (Studio round-trip: block maps,
//      block sequences of single-key items, block scalars for formulas).
//   2. The vendored pa.schema.yaml itself (adds simple single-line flow
//      collections `{ ... }` / `[ ... ]`, which the JSON-schema meta-document
//      uses for terse one-liners).
//
// This is NOT a general YAML 1.2 parser. See tools/pa-schema-validate/README.md
// "Known limitations" for exactly what is and isn't supported, and why a real
// tree (not pa-lint's line model) is required for C1 but a hand-rolled subset
// was judged sufficient over pulling in js-yaml.
//
// Node shapes (all carry `line`, the 1-based source line of the node's start):
//   { kind: 'map',    line, entries: [{ key, keyLine, value: Node }] }
//   { kind: 'seq',    line, items: [Node] }
//   { kind: 'scalar', line, value: string|number|boolean|null }

const BLOCK_SCALAR_RE = /^([|>])([+-]?)(\d?)([+-]?)\s*$/;

// Splits a trimmed line into { keyRaw, valueText } if it is a mapping entry,
// or returns null otherwise. Mirrors YAML's own disambiguation rule: a colon
// only separates key from value when followed by whitespace or end-of-line;
// a colon elsewhere is just part of the (possibly unquoted) key or value.
// This is what lets `${1:Screen1}:` (a snippet placeholder key in the
// vendored schema's defaultSnippets, never read by the validator) parse as
// one key instead of breaking on its embedded colon.
function splitKeyValue(trimmed) {
  if (trimmed[0] === "'" || trimmed[0] === '"') {
    const quote = trimmed[0];
    let j = 1;
    while (j < trimmed.length) {
      if (quote === "'" && trimmed[j] === "'" && trimmed[j + 1] === "'") { j += 2; continue; }
      if (quote === '"' && trimmed[j] === '\\') { j += 2; continue; }
      if (trimmed[j] === quote) break;
      j++;
    }
    if (trimmed[j] !== quote) return null; // unterminated quote
    const keyRaw = trimmed.slice(0, j + 1);
    const restStart = j + 1;
    if (trimmed[restStart] !== ':') return null;
    const after = trimmed.slice(restStart + 1);
    if (after !== '' && after[0] !== ' ' && after[0] !== '\t') return null;
    return { keyRaw, valueText: after.replace(/^[ \t]+/, '') };
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === ':' && (i === trimmed.length - 1 || trimmed[i + 1] === ' ' || trimmed[i + 1] === '\t')) {
      if (i === 0) return null; // no key text
      return { keyRaw: trimmed.slice(0, i), valueText: trimmed.slice(i + 1).replace(/^[ \t]+/, '') };
    }
  }
  return null;
}

class YamlParseError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

function leadingSpaces(raw) {
  let i = 0;
  while (i < raw.length && raw[i] === ' ') i++;
  return i;
}

function unquote(text) {
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    return text.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', '\\': '\\', n: '\n', t: '\t' }[c]));
  }
  return null; // not quoted
}

function resolvePlainScalar(text) {
  const t = text.trim();
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return null;
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(t)) return Number(t);
  return t;
}

function parseScalarText(text, line) {
  const q = unquote(text.trim());
  if (q !== null) return { kind: 'scalar', line, value: q };
  return { kind: 'scalar', line, value: resolvePlainScalar(text) };
}

// Parses a bracketed flow collection starting at `text[0]` ('{' or '[').
// Supports single-line flow scalars, nested flow collections, and simple
// `key: value` / bare-item members separated by commas. Sufficient for the
// vendored schema's one-liners (e.g. `{ $ref: "#/..." }`, `[Control]`) - not
// a full implementation of the YAML flow grammar (no multi-line flow, no
// flow scalars containing unescaped commas/brackets).
function parseFlow(text, line) {
  let i = 0;
  function skipWs() {
    while (i < text.length && /\s/.test(text[i])) i++;
  }
  function parseValue() {
    skipWs();
    if (text[i] === '{') return parseFlowMap();
    if (text[i] === '[') return parseFlowSeq();
    if (text[i] === '"' || text[i] === "'") return parseFlowScalarQuoted();
    return parseFlowScalarBare();
  }
  function parseFlowScalarQuoted() {
    const quote = text[i];
    let j = i + 1;
    while (j < text.length) {
      if (quote === "'" && text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
      if (quote === '"' && text[j] === '\\') { j += 2; continue; }
      if (text[j] === quote) break;
      j++;
    }
    const raw = text.slice(i, j + 1);
    i = j + 1;
    return { kind: 'scalar', line, value: unquote(raw) };
  }
  function parseFlowScalarBare() {
    let j = i;
    while (j < text.length && !',{}[]:'.includes(text[j])) j++;
    const raw = text.slice(i, j);
    i = j;
    return { kind: 'scalar', line, value: resolvePlainScalar(raw) };
  }
  function parseFlowSeq() {
    i++; // consume '['
    const items = [];
    skipWs();
    while (i < text.length && text[i] !== ']') {
      items.push(parseValue());
      skipWs();
      if (text[i] === ',') { i++; skipWs(); }
    }
    i++; // consume ']'
    return { kind: 'seq', line, items };
  }
  function parseFlowMap() {
    i++; // consume '{'
    const entries = [];
    skipWs();
    while (i < text.length && text[i] !== '}') {
      skipWs();
      const keyNode = text[i] === '"' || text[i] === "'" ? parseFlowScalarQuoted() : parseFlowScalarBare();
      skipWs();
      if (text[i] === ':') i++;
      const value = parseValue();
      entries.push({ key: String(keyNode.value), keyLine: line, value });
      skipWs();
      if (text[i] === ',') { i++; skipWs(); }
    }
    i++; // consume '}'
    return { kind: 'map', line, entries };
  }
  const node = parseValue();
  return node;
}

function parseYaml(text, file) {
  const rawLines = text.split(/\r?\n/);
  let pos = 0;

  function isBlank(raw) {
    return raw.trim() === '';
  }

  function skipBlank() {
    while (pos < rawLines.length && isBlank(rawLines[pos])) pos++;
  }

  // Collects a block scalar body (the lines more indented than `keyIndent`
  // immediately following the header line at `pos`). Advances `pos` past it.
  function collectBlockScalar(keyIndent, folded) {
    const body = [];
    let baseIndent = -1;
    while (pos < rawLines.length) {
      const raw = rawLines[pos];
      if (isBlank(raw)) { body.push(''); pos++; continue; }
      const col = leadingSpaces(raw);
      if (col <= keyIndent) break;
      if (baseIndent === -1) baseIndent = col;
      body.push(raw.slice(Math.min(baseIndent, col)));
      pos++;
    }
    while (body.length && body[body.length - 1] === '') body.pop();
    return body.join(folded ? ' ' : '\n');
  }

  // Parses whatever construct (map or sequence) begins at the next
  // non-blank line, provided its indent is >= minIndent. Returns the node,
  // or null if nothing qualifies (used to detect "no nested value").
  function parseNode(minIndent) {
    skipBlank();
    if (pos >= rawLines.length) return null;
    const raw = rawLines[pos];
    const col = leadingSpaces(raw);
    if (col < minIndent) return null;
    const trimmed = raw.slice(col);
    if (trimmed === '-' || trimmed.startsWith('- ')) return parseSequence(col);
    if (splitKeyValue(trimmed)) return parseMapping(col);
    // A lone plain/quoted scalar as a nested value (`key:` then, on the next
    // line, just a bare value with no ':' of its own) - legal YAML, used by
    // the vendored schema (e.g. `ControlTypeId-1P-controls-enum:\n    true`).
    const lineNo = pos + 1;
    pos++;
    if (/^[{[]/.test(trimmed)) return parseFlow(trimmed, lineNo);
    return parseScalarText(trimmed, lineNo);
  }

  function parseSequence(itemIndent) {
    const startLine = pos + 1;
    const items = [];
    for (;;) {
      skipBlank();
      if (pos >= rawLines.length) break;
      const raw = rawLines[pos];
      const col = leadingSpaces(raw);
      if (col !== itemIndent) break;
      const trimmed = raw.slice(col);
      if (!(trimmed === '-' || trimmed.startsWith('- '))) break;
      const itemLine = pos + 1;
      const afterDashCol = col + 2;
      const rest = trimmed === '-' ? '' : trimmed.slice(2);
      pos++;
      if (rest.trim() === '') {
        const child = parseNode(afterDashCol);
        items.push(child || { kind: 'scalar', line: itemLine, value: null });
        continue;
      }
      if (/^[{[]/.test(rest.trim())) {
        items.push(parseFlow(rest.trim(), itemLine));
      } else {
        const m = splitKeyValue(rest);
        if (m) {
          const entries = [buildEntry(m, itemLine, afterDashCol)];
          entries.push(...parseMappingEntriesAt(afterDashCol));
          items.push({ kind: 'map', line: itemLine, entries });
        } else {
          items.push(parseScalarText(rest, itemLine));
        }
      }
    }
    return { kind: 'seq', line: startLine, items };
  }

  function buildEntry(m, keyLine, keyIndent) {
    const key = unquote(m.keyRaw) ?? m.keyRaw;
    const valueText = m.valueText;
    let valueNode;
    if (valueText === undefined || valueText === '') {
      const child = parseNode(keyIndent + 1);
      valueNode = child || { kind: 'scalar', line: keyLine, value: null };
    } else {
      const blockMatch = BLOCK_SCALAR_RE.exec(valueText.trim());
      if (blockMatch) {
        const folded = blockMatch[1] === '>';
        const body = collectBlockScalar(keyIndent, folded);
        valueNode = { kind: 'scalar', line: keyLine, value: body };
      } else if (/^[{[]/.test(valueText.trim())) {
        valueNode = parseFlow(valueText.trim(), keyLine);
      } else {
        valueNode = parseScalarText(valueText, keyLine);
      }
    }
    return { key, keyLine, value: valueNode };
  }

  function parseMappingEntriesAt(indent) {
    const entries = [];
    for (;;) {
      skipBlank();
      if (pos >= rawLines.length) break;
      const raw = rawLines[pos];
      const col = leadingSpaces(raw);
      if (col !== indent) break;
      const trimmed = raw.slice(col);
      if (trimmed === '-' || trimmed.startsWith('- ')) break; // a sequence starts here, not a mapping entry
      const m = splitKeyValue(trimmed);
      if (!m) {
        throw new YamlParseError(`pa-schema-validate: cannot parse line as a mapping entry: ${JSON.stringify(raw)}`, pos + 1);
      }
      const keyLine = pos + 1;
      pos++;
      entries.push(buildEntry(m, keyLine, indent));
    }
    return entries;
  }

  function parseMapping(indent) {
    const startLine = pos + 1;
    const entries = parseMappingEntriesAt(indent);
    return { kind: 'map', line: startLine, entries };
  }

  skipBlank();
  if (pos >= rawLines.length) return { kind: 'map', line: 1, entries: [] };
  const root = parseNode(0);

  // Every non-blank line must have been consumed. Without this, misindented
  // content is silently ABANDONED: a sequence loop breaks on an unexpected
  // indent, every enclosing loop breaks too, and the remaining lines are just
  // dropped - so a screen with a misindented control validated "clean" while
  // that control had vanished from the tree entirely. A validator that
  // silently skips input is worse than no validator, because it reports
  // success. Fail closed instead and name the line.
  skipBlank();
  if (pos < rawLines.length) {
    throw new YamlParseError(
      `unparsed content - line ${pos + 1} could not be attached to the document ` +
        `(usually inconsistent indentation): ${rawLines[pos].trim().slice(0, 60)}`,
      pos + 1
    );
  }

  return root || { kind: 'map', line: 1, entries: [] };
}

function toPlain(node) {
  if (node.kind === 'scalar') return node.value;
  if (node.kind === 'seq') return node.items.map(toPlain);
  const obj = {};
  for (const e of node.entries) obj[e.key] = toPlain(e.value);
  return obj;
}

module.exports = { parseYaml, toPlain, YamlParseError };
