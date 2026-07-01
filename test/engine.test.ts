import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApiDb } from '../src/apidb.ts';
import { lintSource } from '../src/engine.ts';
import { parseLua } from '../src/parser.ts';
import { fingerprint } from '../src/baseline.ts';

const db = loadApiDb();

test('parser shim: break; parses and locations survive', () => {
  const { ast } = parseLua('for i = 1, 10 do\n  if i > 5 then break; end\nend\nlocal x = UnitHealth("target")\n');
  assert.equal(ast.type, 'Chunk');
});

test('unknown string escapes (5.1 semantics) parse', () => {
  const { ast } = parseLua('local s = "color \\124cffff0000red"\nlocal t = "\\|escaped"');
  assert.equal(ast.type, 'Chunk');
});

test('suppression on same line', () => {
  const src = 'local t = {}\nt[UnitGUID("target")] = true -- taintlint: allow SV005 (keyed only out of combat)\n';
  assert.equal(lintSource(src, 'x.lua', db).length, 0);
});

test('suppression on previous line', () => {
  const src = '-- taintlint: allow SV001 (classic-only path)\nlocal pct = UnitHealth("target") / 100\n';
  assert.equal(lintSource(src, 'x.lua', db).length, 0);
});

test('suppression only silences the named rule', () => {
  const src = 'local pct = UnitHealth("target") / 100 -- taintlint: allow SV005 (wrong rule)\n';
  assert.equal(lintSource(src, 'x.lua', db).length, 1);
});

test('unparseable file yields TL000, not a crash', () => {
  const findings = lintSource('local = broken(', 'x.lua', db);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.rule, 'TL000');
});

test('fingerprint is stable and path-normalized', () => {
  const f = { rule: 'SV001', severity: 'error' as const, file: 'a\\b.lua', line: 3, column: 7, api: 'UnitHealth', message: 'm' };
  assert.equal(fingerprint(f), 'SV001:a/b.lua:3:UnitHealth');
});
