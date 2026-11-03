import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { dbForVersion, flavorOf, latestDbPath, loadApiDb, shippedDbs, versionKey } from '../src/apidb.ts';
import { lintSource } from '../src/engine.ts';

test('versionKey accepts toc interface numbers and dotted versions', () => {
  assert.equal(versionKey('120100'), 120100);
  assert.equal(versionKey('12.1.0'), 120100);
  assert.equal(versionKey('12.1'), 120100);
  assert.equal(versionKey('12.0.7'), 120007);
  assert.equal(versionKey('110105'), 110105);
  assert.equal(versionKey(null), null);
  assert.equal(versionKey('midnight'), null);
});

test('dbForVersion picks the newest db not newer than the target', () => {
  const dbs = shippedDbs().filter((d) => d.flavor === 'mainline');
  const newest = dbs[dbs.length - 1]!;
  const oldest = dbs[0]!;

  // Exact match, and a build between two dbs resolves down, never up.
  assert.equal(dbForVersion(newest.key)!.path, newest.path);
  assert.equal(dbForVersion(oldest.key)!.path, oldest.path);
  assert.equal(dbForVersion(oldest.key + 1)!.path, oldest.path);

  // Unknown version → newest; older than everything we ship → oldest available.
  assert.equal(dbForVersion(null)!.path, latestDbPath());
  assert.equal(dbForVersion(110000)!.path, oldest.path);
});

test('a 12.0.7 addon is not analysed against the 12.1 surface', () => {
  // Regression for the multi-version contract: shipping a newer db must not
  // silently re-target addons that declare an older interface.
  const chosen = dbForVersion(versionKey('120007'))!;
  assert.equal(basename(chosen.path), 'apidb-12.0.7-68275.json');
});

test('a conditional finding quotes the documented secrecy condition', () => {
  const db = loadApiDb(dbForVersion(versionKey('12.1.0'))!.path);
  const [finding, ...rest] = lintSource('if UnitClass("target") == "PALADIN" then end', 't.lua', db);
  assert.equal(rest.length, 0);
  assert.match(finding!.message, /secret when the unit isn't player-controlled or in the party\/raid/);
});

test('builds without a predicate table fall back to the generic note', () => {
  // 12.0.7 predates SecretPredicatesDocumentation.lua; the wording degrades, the
  // finding does not disappear.
  const db = loadApiDb(dbForVersion(versionKey('12.0.7'))!.path);
  assert.equal(db.predicates.size, 0);
  const [finding] = lintSource('if UnitName("target") == "Bob" then end', 't.lua', db);
  assert.match(finding!.message, /\(conditionally secret\)$/);
});

test('flavorOf tells mainline, WoW Forever and Classic apart', () => {
  assert.equal(flavorOf(120105), 'mainline');
  assert.equal(flavorOf(110207), 'mainline');
  assert.equal(flavorOf(16001), 'forever'); // Forever ships as 1.60.x
  assert.equal(flavorOf(versionKey('1.60.1')!), 'forever');
  assert.equal(flavorOf(11508), null); // Classic Era 1.15.x — same major as Forever
  assert.equal(flavorOf(20505), null); // TBC Anniversary
  assert.equal(flavorOf(50503), null); // Mists
});

test('dbForVersion never substitutes a db from another flavor', () => {
  // Before flavors, a Classic or Forever interface fell back to the oldest retail
  // db and was linted against an API surface it does not run on.
  for (const key of [11508, 20505, 40402, 50503]) assert.equal(dbForVersion(key), null);
  const forever = dbForVersion(16001);
  if (forever !== null) assert.equal(forever.flavor, 'forever');
  for (const key of [120007, 120105, 999999]) assert.equal(dbForVersion(key)!.flavor, 'mainline');
});
