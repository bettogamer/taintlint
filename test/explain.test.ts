import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_DOCS, matchRules, formatExplanation } from '../src/ruledocs.ts';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rules');

test('explain: rule id lookup, case-insensitive', () => {
  assert.equal(matchRules('SV001')[0]?.id, 'SV001');
  assert.equal(matchRules('sv012')[0]?.id, 'SV012');
  assert.equal(matchRules('SV001').length, 1);
});

test('explain: real BugSack messages resolve to the right rule', () => {
  const cases: [string, string][] = [
    // Observed in the wild (ATT #2265 / Blizzard MoneyFrame):
    ['attempt to perform arithmetic on a secret value', 'SV001'],
    // Observed first-hand (Beacon, 12.0.7), full variant with locals and taint suffix:
    ["attempt to perform arithmetic on local 'hp' (a secret number value, while execution tainted by 'MyAddon')", 'SV001'],
    ['attempt to compare a secret number value', 'SV002'],
    ['attempt to concatenate a secret number value', 'SV003'],
    ['attempt to get length of a secret value', 'SV004'],
    ['attempt to store a secret value as a table key', 'SV005'],
    // Observed in the wild (Altoholic #96):
    ["attempt to index local 'line' (a secret value)", 'SV006'],
    ['attempt to call a secret value', 'SV007'],
    ["attempt to call a nil value (global 'issecretvalue')", 'SV011'],
  ];
  for (const [message, rule] of cases) {
    const hits = matchRules(message);
    assert.ok(hits.some((r) => r.id === rule), `"${message}" should match ${rule}, got ${hits.map((r) => r.id)}`);
  }
});

test('explain: ForceTaint_Strong context rule is listed first', () => {
  const hits = matchRules("attempt to compare a secret number value (execution tainted by '*** ForceTaint_Strong ***')");
  assert.equal(hits[0]?.id, 'SV009', 'the context rule changes the fix, it must lead');
  assert.ok(hits.some((r) => r.id === 'SV002'), 'the operation rule is still reported');
});

test('explain: boss-mod taint suffix surfaces SV008', () => {
  const hits = matchRules("attempt to perform arithmetic on a secret value (while execution tainted by 'BigWigs')");
  const ids = hits.map((r) => r.id);
  assert.ok(ids.includes('SV008'), `expected SV008 in ${ids}`);
  assert.ok(ids.includes('SV001'), `expected SV001 in ${ids}`);
});

test('explain: no match is honest and non-zero-ish', () => {
  assert.equal(matchRules('attempt to index a nil value').length, 0);
  assert.match(formatExplanation([], 'whatever'), /no rule matches/);
});

test('explain output carries error, cause, fix and doc link', () => {
  const out = formatExplanation(matchRules('SV005'), 'SV005');
  assert.match(out, /SV005 — /);
  assert.match(out, /error: /);
  assert.match(out, /cause: /);
  assert.match(out, /fix: {3}/);
  assert.match(out, /docs\/rules\/SV005\.md/);
});

test('every rule has a doc page and the index links it', () => {
  const index = readFileSync(join(DOCS, 'README.md'), 'utf8');
  assert.equal(RULE_DOCS.length, 12);
  for (const rule of RULE_DOCS) {
    const page = join(DOCS, `${rule.id}.md`);
    assert.ok(existsSync(page), `missing ${page}`);
    const body = readFileSync(page, 'utf8');
    assert.ok(body.startsWith('# '), `${rule.id}.md must open with the error-message H1`);
    assert.ok(body.includes(rule.id), `${rule.id}.md must name its rule id`);
    assert.ok(index.includes(`(${rule.id}.md)`), `docs/rules/README.md must link ${rule.id}.md`);
  }
});
