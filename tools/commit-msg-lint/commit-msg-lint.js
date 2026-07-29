#!/usr/bin/env node
'use strict';
// commit-msg-lint: enforce "type(scope): summary (IDs)" on the commit subject.
//
// Why this is a blocking hook and not a style note: the V1 process was mined
// for defect classes entirely from commit history. That was only possible
// because the convention held. A convention that holds "most of the time" is
// not a dataset - it is a guess. This is the cheapest rule in the toolkit to
// mechanize, so it graduates from prose to a gate (see docs/RULES.md).
//
// Usage (as a git commit-msg hook, which passes the message file as $1):
//   node tools/commit-msg-lint/commit-msg-lint.js .git/COMMIT_EDITMSG
//
// Exit: 0 valid or skipped, 1 convention violation, 2 usage/IO error.

const fs = require('node:fs');

const TYPES = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci'];
const DEFAULT_MAX_SUBJECT = 72;

// Machine-generated or in-flight subjects git creates itself. Linting these
// would block ordinary git operations (merge, revert, rebase --autosquash)
// for no benefit - the eventual squashed commit is what gets linted.
const SKIP_RE = /^(Merge |Revert |fixup! |squash! |amend! )/;

const SUBJECT_RE = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:[ \t]*(.*)$/;

function usage(msg) {
  if (msg) process.stderr.write(`commit-msg-lint: ${msg}\n`);
  process.stderr.write(
    'usage: commit-msg-lint <message-file> [--max-subject N] [--require-ids]\n'
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { file: null, maxSubject: DEFAULT_MAX_SUBJECT, requireIds: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--require-ids') opts.requireIds = true;
    else if (a === '--max-subject') {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v <= 0) usage('--max-subject needs a positive integer');
      opts.maxSubject = v;
    } else if (a.startsWith('-')) usage(`unknown option ${a}`);
    else if (opts.file === null) opts.file = a;
    else usage('more than one message file given');
  }
  if (opts.file === null) usage();
  return opts;
}

function fail(lines) {
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(1);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = fs.readFileSync(opts.file, 'utf8');
  } catch (e) {
    usage(`cannot read message file ${opts.file}: ${e.message}`);
  }

  // git's own comment lines are not part of the message.
  const lines = raw.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  const subjectIdx = lines.findIndex((l) => l.trim() !== '');
  if (subjectIdx === -1) {
    // An emptied buffer is how git aborts a commit. That is a usage
    // condition, not a convention violation - do not report it as one.
    usage('empty commit message (nothing to lint)');
  }

  const subject = lines[subjectIdx].trimEnd();
  if (SKIP_RE.test(subject)) process.exit(0);

  const m = SUBJECT_RE.exec(subject);
  if (!m) {
    fail([
      `commit-msg-lint: subject does not match "type(scope): summary (IDs)"`,
      `  subject: ${subject}`,
      `  types:   ${TYPES.join(', ')}`,
      `  example: feat(pa-lint): add L4 seed-schema check (WS4)`,
    ]);
  }

  const [, type, scope, , summary] = m;
  if (!TYPES.includes(type)) {
    fail([
      `commit-msg-lint: unknown type "${type}"`,
      `  types:   ${TYPES.join(', ')}`,
      `  example: feat(pa-lint): add L4 seed-schema check (WS4)`,
    ]);
  }
  if (scope !== undefined && scope.trim() === '') {
    fail([`commit-msg-lint: empty scope - write "${type}: ..." or "${type}(scope): ..."`]);
  }
  if (summary.trim() === '') {
    fail([`commit-msg-lint: summary is empty after "${type}${scope ? `(${scope})` : ''}:"`]);
  }
  if (subject.length > opts.maxSubject) {
    fail([
      `commit-msg-lint: subject is ${subject.length} chars, limit is ${opts.maxSubject}`,
      `  move the detail into the body - the subject is an index, not the story`,
    ]);
  }
  if (opts.requireIds && !/\([^)]+\)\s*$/.test(summary)) {
    fail([
      `commit-msg-lint: --require-ids is on but the summary has no trailing "(IDs)"`,
      `  example: fix(guard): fail closed on stale snapshot (P8, DA-3)`,
    ]);
  }

  // A body must be separated from the subject by a blank line, or git tooling
  // (and `git log --oneline`) folds the first body line into the subject.
  const next = lines[subjectIdx + 1];
  if (next !== undefined && next.trim() !== '') {
    fail([
      `commit-msg-lint: put a blank line between the subject and the body`,
      `  subject: ${subject}`,
      `  body:    ${next.trim()}`,
    ]);
  }

  process.exit(0);
}

main();
