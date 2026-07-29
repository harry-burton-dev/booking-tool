#!/usr/bin/env node
'use strict';

// revert-check: verify that PROD-REVERT marker sites in .pa.yaml sources
// match the dev/prod patterns declared in a contract markdown file.
// Zero dependencies; Node built-ins only.

const fs = require('node:fs');
const path = require('node:path');

const WINDOW_LINES = 30;
const MARKER_RE = /\/\/\s*PROD-REVERT\[([^\]]+)\]|\/\*\s*PROD-REVERT\[([^\]]+)\]\s*\*\//g;

const EXIT_OK = 0;
const EXIT_CHECK_FAILED = 1;
const EXIT_ERROR = 2;

const USAGE =
  'Usage: node revert-check.js --src <dir> --contract <file> [--json] [--require-prod]';

class ToolError extends Error {}

function parseArgs(argv) {
  const opts = { src: null, contract: null, json: false, requireProd: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--src') {
      opts.src = argv[i + 1];
      i += 1;
    } else if (arg === '--contract') {
      opts.contract = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--require-prod') {
      opts.requireProd = true;
    } else {
      throw new ToolError(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  if (!opts.src || !opts.contract) {
    throw new ToolError(`Missing required arguments.\n${USAGE}`);
  }
  return opts;
}

function findPaYamlFiles(dir) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findPaYamlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.pa.yaml')) {
      found.push(full);
    }
  }
  return found.sort();
}

// Returns [{ file, relFile, line (1-based), id, windowLines }]
function scanSources(srcDir) {
  let stat;
  try {
    stat = fs.statSync(srcDir);
  } catch {
    throw new ToolError(`Source directory not found: ${srcDir}`);
  }
  if (!stat.isDirectory()) {
    throw new ToolError(`--src is not a directory: ${srcDir}`);
  }

  const sites = [];
  for (const file of findPaYamlFiles(srcDir)) {
    const relFile = path.relative(srcDir, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((lineText, index) => {
      MARKER_RE.lastIndex = 0;
      let match;
      while ((match = MARKER_RE.exec(lineText)) !== null) {
        const id = (match[1] ?? match[2]).trim();
        sites.push({
          file: relFile,
          line: index + 1,
          id,
          windowLines: lines.slice(index + 1, index + 1 + WINDOW_LINES),
        });
      }
    });
  }
  return sites;
}

// Contract format: `### <id>` headings; each entry needs a ```dev and a
// ```prod fenced block. Returns Map<id, { dev, prod }>.
function parseContract(contractPath) {
  let text;
  try {
    text = fs.readFileSync(contractPath, 'utf8');
  } catch {
    throw new ToolError(`Cannot read contract file: ${contractPath}`);
  }

  const lines = text.split(/\r?\n/);
  const entries = new Map();
  let currentId = null;
  let currentEntry = null;
  let fenceLabel = null;
  let fenceLines = null;

  const finishEntry = () => {
    if (currentId === null) return;
    if (!currentEntry.dev || !currentEntry.prod) {
      const missing = !currentEntry.dev ? 'dev' : 'prod';
      throw new ToolError(
        `Malformed contract entry "${currentId}" in ${contractPath}: missing \`\`\`${missing} block`,
      );
    }
    entries.set(currentId, currentEntry);
  };

  for (const line of lines) {
    if (fenceLabel !== null) {
      if (line.trim() === '```') {
        const pattern = fenceLines.join('\n').trim();
        if ((fenceLabel === 'dev' || fenceLabel === 'prod') && currentId !== null) {
          currentEntry[fenceLabel] = pattern;
        }
        fenceLabel = null;
        fenceLines = null;
      } else {
        fenceLines.push(line);
      }
      continue;
    }
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      finishEntry();
      currentId = heading[1];
      currentEntry = { dev: null, prod: null };
      continue;
    }
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence && fence[1] !== '') {
      fenceLabel = fence[1];
      fenceLines = [];
    }
  }
  finishEntry();

  if (entries.size === 0) {
    throw new ToolError(`No contract entries (### headings) found in ${contractPath}`);
  }
  return entries;
}

// Literal-substring matching, whitespace-insensitive per line. A multi-line
// pattern must match contiguous lines: each trimmed pattern line must be a
// substring of the corresponding trimmed window line.
function patternInWindow(windowLines, pattern) {
  const patternLines = pattern.split('\n').map((line) => line.trim());
  const trimmedWindow = windowLines.map((line) => line.trim());
  const span = patternLines.length;
  for (let i = 0; i + span <= trimmedWindow.length; i += 1) {
    const matches = patternLines.every((patternLine, j) =>
      trimmedWindow[i + j].includes(patternLine),
    );
    if (matches) return true;
  }
  return false;
}

function siteStatus(site, entry) {
  const devFound = patternInWindow(site.windowLines, entry.dev);
  const prodFound = patternInWindow(site.windowLines, entry.prod);
  if (devFound && prodFound) return 'AMBIGUOUS';
  if (devFound) return 'DEV';
  if (prodFound) return 'PROD';
  return 'UNKNOWN';
}

function evaluate(sites, contract, requireProd) {
  const resultSites = sites.map((site) => ({
    file: site.file,
    line: site.line,
    id: site.id,
    status: contract.has(site.id) ? siteStatus(site, contract.get(site.id)) : 'ORPHAN',
  }));

  const markerIds = new Set(sites.map((site) => site.id));
  const orphanMarkers = [...new Set(resultSites.filter((s) => s.status === 'ORPHAN').map((s) => s.id))].sort();
  const orphanContractEntries = [...contract.keys()].filter((id) => !markerIds.has(id)).sort();

  const count = (status) => resultSites.filter((site) => site.status === status).length;
  const summary = {
    sites: resultSites.length,
    dev: count('DEV'),
    prod: count('PROD'),
    unknown: count('UNKNOWN'),
    ambiguous: count('AMBIGUOUS'),
    orphanMarkerSites: count('ORPHAN'),
    orphanContractEntries: orphanContractEntries.length,
  };

  let ok =
    orphanMarkers.length === 0 &&
    orphanContractEntries.length === 0 &&
    summary.unknown === 0 &&
    summary.ambiguous === 0;
  if (requireProd && summary.dev > 0) ok = false;

  return { requireProd, sites: resultSites, orphanMarkers, orphanContractEntries, summary, ok };
}

function printHumanReport(report) {
  const rows = report.sites.map((site) => [`${site.file}:${site.line}`, site.id, site.status]);
  const header = ['Site', 'Id', 'Status'];
  const widths = [header, ...rows].reduce(
    (acc, row) => acc.map((width, i) => Math.max(width, row[i].length)),
    [0, 0, 0],
  );
  const formatRow = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd();

  console.log(formatRow(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(formatRow(row));

  if (report.orphanMarkers.length > 0) {
    console.log(`\nOrphan markers (not in contract): ${report.orphanMarkers.join(', ')}`);
  }
  if (report.orphanContractEntries.length > 0) {
    console.log(`Orphan contract entries (no marker found): ${report.orphanContractEntries.join(', ')}`);
  }

  const s = report.summary;
  console.log(
    `\nSummary: ${s.sites} sites | DEV ${s.dev} | PROD ${s.prod} | UNKNOWN ${s.unknown} | ` +
      `AMBIGUOUS ${s.ambiguous} | orphan markers ${s.orphanMarkerSites} | ` +
      `orphan contract entries ${s.orphanContractEntries}`,
  );
  console.log(report.ok ? 'RESULT: OK' : 'RESULT: FAILED');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    return EXIT_ERROR;
  }

  let report;
  try {
    const contract = parseContract(opts.contract);
    const sites = scanSources(opts.src);
    report = evaluate(sites, contract, opts.requireProd);
  } catch (err) {
    if (err instanceof ToolError) {
      console.error(err.message);
      return EXIT_ERROR;
    }
    throw err;
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }
  return report.ok ? EXIT_OK : EXIT_CHECK_FAILED;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { parseContract, scanSources, evaluate, patternInWindow };
