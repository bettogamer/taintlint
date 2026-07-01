import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiDb } from '../src/apidb.ts';
import { lintSource } from '../src/engine.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const db = loadApiDb();

// Header contract: `-- expect: SV001=3` (comma-separable) or `-- expect: none`.
function expectations(src: string): Map<string, number> {
  const m = /^--\s*expect:\s*(.+)$/m.exec(src);
  assert.ok(m, 'fixture must declare an "-- expect:" header');
  const out = new Map<string, number>();
  if (m[1]!.trim() === 'none') return out;
  for (const part of m[1]!.split(',')) {
    const [rule, n] = part.trim().split('=');
    out.set(rule!.trim(), Number(n ?? 1));
  }
  return out;
}

for (const ruleDir of readdirSync(FIXTURES)) {
  for (const kind of ['fail.lua', 'pass.lua']) {
    test(`${ruleDir}/${kind}`, () => {
      const src = readFileSync(join(FIXTURES, ruleDir, kind), 'utf8');
      const expected = expectations(src);
      const findings = lintSource(src, `${ruleDir}/${kind}`, db);
      const byRule = new Map<string, number>();
      for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
      assert.deepEqual(
        Object.fromEntries([...byRule].sort()),
        Object.fromEntries([...expected].sort()),
        `findings: ${JSON.stringify(findings, null, 1)}`
      );
    });
  }
}
