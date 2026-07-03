#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadApiDb } from './apidb.ts';
import { lintSource } from './engine.ts';
import { resolveTarget } from './toc.ts';
import { fingerprint, loadBaseline, writeBaseline } from './baseline.ts';
import { formatExplanation, matchRules } from './ruledocs.ts';
import type { Finding, Severity } from './types.ts';

interface Options {
  target: string;
  format: 'pretty' | 'json';
  updateBaseline: boolean;
  baselinePath: string | null;
  minSeverity: Severity;
}

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

function parseArgs(argv: string[]): Options {
  const opts: Options = { target: '', format: 'pretty', updateBaseline: false, baselinePath: null, minSeverity: 'info' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--format') opts.format = argv[++i] === 'json' ? 'json' : 'pretty';
    else if (a === '--update-baseline') opts.updateBaseline = true;
    else if (a === '--baseline') opts.baselinePath = argv[++i]!;
    else if (a === '--min-severity') opts.minSeverity = argv[++i] as Severity;
    else if (!a.startsWith('--')) opts.target = a;
  }
  if (!opts.target) {
    console.error(
      'usage: taintlint <addon-dir|file.toc|file.lua> [--format json] [--min-severity error|warning|info] [--update-baseline] [--baseline path]\n' +
        '       taintlint explain "<BugSack error message>" | explain SV001'
    );
    process.exit(2);
  }
  return opts;
}

function runExplain(argv: string[]): number {
  const query = argv.join(' ').trim();
  if (!query) {
    console.error('usage: taintlint explain "<BugSack error message>" | explain SV001');
    return 2;
  }
  const rules = matchRules(query);
  console.log(formatExplanation(rules, query));
  return rules.length > 0 ? 0 : 1;
}

export function run(argv: string[]): number {
  if (argv[0] === 'explain') return runExplain(argv.slice(1));
  const opts = parseArgs(argv);
  const db = loadApiDb();
  const { root, interfaceVersion, luaFiles } = resolveTarget(opts.target);

  let findings: Finding[] = [];
  for (const file of luaFiles) {
    const rel = relative(root, file) || file;
    findings.push(...lintSource(readFileSync(file, 'utf8'), rel, db));
  }
  findings = findings.filter((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[opts.minSeverity]);

  const baselinePath = opts.baselinePath ?? join(root, 'taintlint-baseline.json');
  if (opts.updateBaseline) {
    writeBaseline(baselinePath, findings);
    console.log(`baseline written: ${baselinePath} (${findings.length} findings)`);
    return 0;
  }
  const baseline = loadBaseline(baselinePath);
  const baselined = findings.filter((f) => baseline.has(fingerprint(f)));
  findings = findings.filter((f) => !baseline.has(fingerprint(f)));

  if (opts.format === 'json') {
    console.log(JSON.stringify({ build: db.build, interfaceVersion, findings, baselined: baselined.length }, null, 1));
  } else {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}:${f.column}  ${f.severity.toUpperCase().padEnd(7)} ${f.rule}  ${f.message}`);
    }
    const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
    console.log(
      `\ntaintlint (db ${db.build}) — ${luaFiles.length} files: ` +
        `${count('error')} errors, ${count('warning')} warnings, ${count('info')} info` +
        (baselined.length ? ` (${baselined.length} baselined)` : '')
    );
  }
  return findings.some((f) => f.severity === 'error') ? 1 : 0;
}

process.exit(run(process.argv.slice(2)));
