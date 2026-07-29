#!/usr/bin/env node
'use strict';
// session-close: end-of-session drift check. Mechanizes P4/P5.
//
// WHY THIS EXISTS
//   compile_canvas publishes to the LIVE APP. git does not know that happened.
//   So a session can end with the live app ahead of the repo - the source of
//   truth silently split - and nothing says a word. V1 left this to the
//   worker's memory and it drifted repeatedly.
//
//   The worst case this catches: a publish was recorded THIS session and the
//   source that produced it was never committed. The live app is then running
//   formulas that exist nowhere in version control.
//
// Wire as a Stop hook. Advisory by default; --block makes it exit 2.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(args, cwd) {
  // Trailing whitespace only. `status --porcelain` encodes state in the first
  // two columns, so a leading space is DATA (" M a.txt") - trimming it shifts
  // every filename left by one character.
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\s+$/, '');
}

// Returns trimmed stdout, or null if the command fails for any reason.
function gitOrNull(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const block = argv.includes('--block');
  const cwd = process.cwd();

  const root = gitOrNull(['rev-parse', '--show-toplevel'], cwd);
  if (root === null) {
    process.stdout.write('session-close: not a git repo - nothing to check.\n');
    process.exit(0);
  }

  const findings = [];

  // 1. Uncommitted work (tracked modifications AND untracked files).
  const status = gitOrNull(['status', '--porcelain'], root) || '';
  const dirty = status.split('\n').filter((l) => l.trim() !== '');
  if (dirty.length) {
    // "XY <path>", or "R  <old> -> <new>" for renames.
    const names = dirty
      .map((l) => {
        const m = /^..\s(.*)$/.exec(l);
        return (m ? m[1] : l).replace(/^.* -> /, '');
      })
      .slice(0, 10);
    findings.push(
      `uncommitted changes in ${dirty.length} file(s):\n` +
        names.map((n) => `    ${n}`).join('\n') +
        (dirty.length > names.length ? `\n    ... and ${dirty.length - names.length} more` : '')
    );
  }

  // 2. Commits that exist only locally.
  const upstream = gitOrNull(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root);
  if (upstream === null) {
    const branch = gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD'], root) || '(detached)';
    findings.push(
      `branch "${branch}" has no upstream - nothing is backed up off this machine.\n` +
        `    git push -u origin ${branch}`
    );
  } else {
    const ahead = gitOrNull(['rev-list', '--count', '@{u}..HEAD'], root);
    if (ahead && ahead !== '0') {
      findings.push(`${ahead} commit(s) not pushed to ${upstream}.\n    git push`);
    }
  }

  // 3. The P5 case: a publish recorded THIS session, with source not committed.
  const meta = path.join(root, '.claude', 'canvas-guard', 'state', 'baseline.meta');
  let publishedThisSession = false;
  try {
    const body = fs.readFileSync(meta, 'utf8');
    const m = /^session=(.*)$/m.exec(body);
    const session = process.env.CLAUDE_SESSION_ID || 'unknown';
    publishedThisSession = !!m && m[1].trim() === session && session !== 'unknown';
  } catch {
    /* no guard state - not an app repo, or nothing published */
  }

  if (publishedThisSession && dirty.length) {
    findings.unshift(
      'the live app was published from this session, but the source is NOT committed.\n' +
        '    The live app is running formulas that exist nowhere in version control.\n' +
        '    Commit before the session ends, or the next sync will look like someone\n' +
        '    else published and the guard will (correctly) refuse to push.'
    );
  }

  if (!findings.length) {
    process.stdout.write('session-close: clean - everything committed and pushed.\n');
    process.exit(0);
  }

  process.stdout.write(
    'session-close: end-of-session drift check found ' + findings.length + ' issue(s):\n' +
      findings.map((f, i) => `  ${i + 1}. ${f}`).join('\n') +
      '\n'
  );
  process.exit(block ? 2 : 0);
}

main();
