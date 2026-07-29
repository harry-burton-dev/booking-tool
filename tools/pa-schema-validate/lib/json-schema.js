'use strict';
// Minimal JSON Schema (draft-07 subset) evaluator, scoped to exactly the
// keywords Microsoft's pa.schema.yaml uses: type, properties,
// additionalProperties, propertyNames, required, enum, const, pattern,
// minLength, minProperties, maxProperties, items, allOf, anyOf, oneOf, not,
// if/then/else, $ref (local "#/definitions/..." only). No format, no
// numeric range keywords, no patternProperties, no external $ref, no
// $recursiveRef - none of those are used by the vendored schema.
//
// Operates on yaml-parse.js Node trees (map/seq/scalar, each carrying a
// source `line`) so every finding points at a real line in the source file,
// not a JSON path alone.

function nodeType(node) {
  if (node.kind === 'map') return 'object';
  if (node.kind === 'seq') return 'array';
  const v = node.value;
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return 'string';
}

function resolveRef(ref, root) {
  const parts = ref.replace(/^#\/?/, '').split('/').filter(Boolean);
  let cur = root;
  for (const p of parts) {
    if (cur == null || !(p in cur)) throw new Error(`pa-schema-validate: cannot resolve $ref ${ref}`);
    cur = cur[p];
  }
  return cur;
}

class Validator {
  constructor(rootSchema, file) {
    this.root = rootSchema;
    this.file = file;
  }

  report(findings, node, path, message) {
    findings.push({ check: 'SCHEMA', severity: 'error', file: this.file, line: node.line, message: `${path}: ${message}` });
  }

  // Silent probe: does `node` satisfy `schema`? Used by anyOf/oneOf/not/if.
  matches(node, schema) {
    const probe = [];
    this.validate(node, schema, probe, '$');
    return probe.length === 0;
  }

  validate(node, schema, findings, path) {
    if (schema === true || schema === undefined) return;
    if (schema === false) { this.report(findings, node, path, 'not allowed here'); return; }

    if (schema.$ref) {
      this.validate(node, resolveRef(schema.$ref, this.root), findings, path);
      return;
    }

    const t = nodeType(node);

    if (schema.type !== undefined && t !== schema.type) {
      this.report(findings, node, path, `expected type ${schema.type}, got ${t}`);
    }

    if (schema.enum !== undefined) {
      const val = node.kind === 'scalar' ? node.value : undefined;
      if (!schema.enum.includes(val)) {
        this.report(findings, node, path, `value must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(val)}`);
      }
    }

    if (schema.const !== undefined) {
      const val = node.kind === 'scalar' ? node.value : undefined;
      if (val !== schema.const) {
        this.report(findings, node, path, `value must equal ${JSON.stringify(schema.const)}, got ${JSON.stringify(val)}`);
      }
    }

    if (node.kind === 'scalar' && typeof node.value === 'string') {
      if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(node.value)) {
        this.report(findings, node, path, `value ${JSON.stringify(node.value)} does not match pattern ${schema.pattern}`);
      }
      if (schema.minLength !== undefined && node.value.length < schema.minLength) {
        this.report(findings, node, path, `string shorter than minLength ${schema.minLength}`);
      }
    }

    if (node.kind === 'map') this.validateObject(node, schema, findings, path);
    if (node.kind === 'seq') this.validateArray(node, schema, findings, path);

    if (schema.allOf) for (const s of schema.allOf) this.validate(node, s, findings, path);

    if (schema.anyOf) {
      if (!schema.anyOf.some((s) => this.matches(node, s))) {
        this.report(findings, node, path, 'value does not match any of the allowed alternatives (anyOf)');
      }
    }

    if (schema.oneOf) {
      const matchCount = schema.oneOf.filter((s) => this.matches(node, s)).length;
      if (matchCount !== 1) {
        this.report(findings, node, path, `value must match exactly one of ${schema.oneOf.length} alternatives (oneOf), matched ${matchCount}`);
      }
    }

    if (schema.not && this.matches(node, schema.not)) {
      this.report(findings, node, path, 'value matches a disallowed schema (not)');
    }

    if (schema.if) {
      const branch = this.matches(node, schema.if) ? schema.then : schema.else;
      if (branch !== undefined) this.validate(node, branch, findings, path);
    }
  }

  validateObject(node, schema, findings, path) {
    const keys = node.entries.map((e) => e.key);

    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      this.report(findings, node, path, `object has ${keys.length} propert${keys.length === 1 ? 'y' : 'ies'}, fewer than the minimum of ${schema.minProperties}`);
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      const limit = schema.maxProperties === 1 ? 'exactly 1 property (one control per Children item)' : `at most ${schema.maxProperties} properties`;
      this.report(findings, node, path, `object must have ${limit} - found ${keys.length}: ${keys.join(', ')}`);
    }
    if (schema.required) {
      const missing = schema.required.filter((k) => !keys.includes(k));
      if (missing.length) this.report(findings, node, path, `missing required propert${missing.length === 1 ? 'y' : 'ies'}: ${missing.join(', ')}`);
    }
    if (schema.propertyNames) {
      for (const e of node.entries) {
        const keyNode = { kind: 'scalar', line: e.keyLine, value: e.key };
        this.validate(keyNode, schema.propertyNames, findings, `${path}.${e.key}`);
      }
    }

    const declared = schema.properties || {};
    for (const e of node.entries) {
      if (e.key in declared) {
        this.validate(e.value, declared[e.key], findings, `${path}.${e.key}`);
      } else if (schema.additionalProperties === false) {
        this.report(findings, { line: e.keyLine }, path, `unknown property "${e.key}"`);
      } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
        this.validate(e.value, schema.additionalProperties, findings, `${path}.${e.key}`);
      }
    }
  }

  validateArray(node, schema, findings, path) {
    if (schema.items !== undefined) {
      node.items.forEach((item, i) => this.validate(item, schema.items, findings, `${path}[${i}]`));
    }
  }
}

// rootSchema: plain JS object (the parsed pa.schema.yaml, via yaml-parse's
// toPlain). node: a yaml-parse.js Node tree (the parsed .pa.yaml instance
// being checked). Returns findings: [{check, severity, file, line, message}]
function validate(rootSchema, node, opts) {
  const v = new Validator(rootSchema, opts.file);
  const findings = [];
  v.validate(node, rootSchema, findings, '$');
  findings.sort((a, b) => a.line - b.line);
  return findings;
}

module.exports = { validate, nodeType, resolveRef };
