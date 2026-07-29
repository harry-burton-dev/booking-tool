'use strict';
// Tiny Power Fx literal helpers for L4: find Collect/ClearCollect calls and
// extract top-level record literals with quote-aware brace matching.
// Deliberately literal-only: computed expressions are classified 'expression'
// and skipped by the check (documented limitation).

// Scan text from `start` (index of an opening delimiter) to its matching
// close, respecting double-quoted strings ("" escapes) and single-quoted
// identifiers.
function matchDelim(text, start) {
  const open = text[start];
  const close = open === '(' ? ')' : open === '{' ? '}' : null;
  if (!close) throw new Error(`matchDelim: not a delimiter at ${start}`);
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          break;
        }
        i++;
      }
    } else if (ch === "'") {
      i++;
      while (i < text.length && text[i] !== "'") i++;
    } else if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

// Split a delimiter-body on top-level commas (quote/paren/brace aware).
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"') {
      const end = (() => {
        let j = i + 1;
        while (j < body.length) {
          if (body[j] === '"') {
            if (body[j + 1] === '"') { j += 2; continue; }
            return j;
          }
          j++;
        }
        return body.length - 1;
      })();
      cur += body.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < body.length && body[j] !== "'") j++;
      cur += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '(' || ch === '{') depth++;
    if (ch === ')' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

// Classify a Power Fx literal string.
// -> { kind: 'text'|'number'|'boolean'|'record'|'expression', fields? }
function classifyLiteral(raw) {
  const v = raw.trim();
  if (/^"/.test(v) && /"$/.test(v)) return { kind: 'text' };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { kind: 'number' };
  if (v === 'true' || v === 'false') return { kind: 'boolean' };
  if (v.startsWith('{')) {
    const end = matchDelim(v, 0);
    if (end === -1) return { kind: 'expression' };
    return { kind: 'record', fields: parseRecord(v.slice(0, end + 1)) };
  }
  return { kind: 'expression' };
}

// Parse "{Name: value, 'Quoted Name': value}" into [{name, value, classified}]
function parseRecord(recordText) {
  const body = recordText.slice(1, -1);
  const fields = [];
  for (const part of splitTopLevel(body)) {
    const m = /^\s*('([^']+)'|[A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/.exec(part);
    if (!m) continue;
    const name = m[2] !== undefined ? m[2] : m[1];
    fields.push({ name, raw: m[3].trim(), classified: classifyLiteral(m[3]) });
  }
  return fields;
}

// Blank out Power Fx comments (quote-aware) so an apostrophe in "// don't"
// is not mistaken for an identifier quote - that silently disabled the whole
// check for the call (fail-open, the wrong failure mode for L4).
// Comment bytes are replaced with spaces so offsets/line numbers survive.
function stripComments(text) {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
    } else if (ch === "'") {
      i++;
      while (i < text.length && text[i] !== "'") i++;
      i++;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out[i] = ' '; i++; }
    } else if (ch === '/' && text[i + 1] === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < text.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
    } else i++;
  }
  return out.join('');
}

// Find every Collect/ClearCollect call for the named collections.
// -> [{ collection, offset, records: [{ offset, fields }] }]
function findSeedCalls(rawText, collectionNames) {
  const text = stripComments(rawText);
  const out = [];
  const callRe = /\b(?:Clear)?Collect\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/g;
  let m;
  while ((m = callRe.exec(text)) !== null) {
    if (!collectionNames.includes(m[1])) continue;
    const openParen = text.indexOf('(', m.index);
    const closeParen = matchDelim(text, openParen);
    if (closeParen === -1) continue;
    const args = text.slice(openParen + 1, closeParen);
    const records = [];
    // args after the collection name: walk top-level parts, keep records
    const parts = splitTopLevel(args);
    let cursor = openParen + 1;
    for (let pi = 0; pi < parts.length; pi++) {
      const trimmed = parts[pi].trim();
      if (pi > 0 && trimmed.startsWith('{')) {
        const offsetInText = text.indexOf(trimmed.slice(0, 20), cursor);
        records.push({
          offset: offsetInText === -1 ? m.index : offsetInText,
          fields: parseRecord(trimmed.slice(0, matchDelim(trimmed, 0) + 1)),
        });
      }
      cursor += parts[pi].length + 1;
    }
    out.push({ collection: m[1], offset: m.index, records });
  }
  return out;
}

module.exports = { matchDelim, splitTopLevel, classifyLiteral, parseRecord, findSeedCalls, stripComments };
