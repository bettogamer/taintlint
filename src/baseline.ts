import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Finding } from './types.ts';

// Naive v0.1 fingerprint: line-based, so unrelated edits above a finding will
// invalidate it. Documented trade-off; a context-hash fingerprint can come later.
export function fingerprint(f: Finding): string {
  return `${f.rule}:${f.file.replaceAll('\\', '/')}:${f.line}:${f.api ?? '-'}`;
}

export function loadBaseline(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { findings: string[] };
  return new Set(raw.findings);
}

export function writeBaseline(path: string, findings: Finding[]): void {
  const payload = {
    comment: 'taintlint baseline — existing findings tolerated in CI; only NEW findings fail.',
    findings: findings.map(fingerprint).sort(),
  };
  writeFileSync(path, JSON.stringify(payload, null, 1) + '\n');
}
