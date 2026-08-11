import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesFromToc } from '../src/toc.ts';

function toc(contents: string): ReturnType<typeof filesFromToc> {
  const dir = mkdtempSync(join(tmpdir(), 'taintlint-toc-'));
  writeFileSync(join(dir, 'Addon.lua'), '-- empty\n');
  writeFileSync(join(dir, 'Addon.toc'), contents);
  return filesFromToc(join(dir, 'Addon.toc'));
}

test('a multi-flavor Interface line resolves to the retail build', () => {
  // MRT ships exactly this shape; taking the first number picked Classic (11508)
  // and would have linted a retail addon against the wrong API surface.
  const { interfaceVersion, luaFiles } = toc(
    '## Interface: 11508, 40402, 120007, 50503, 20505\n## Title: Addon\nAddon.lua\n'
  );
  assert.equal(interfaceVersion, '120007');
  assert.equal(luaFiles.length, 1);
});

test('repeated Interface lines keep the highest', () => {
  assert.equal(toc('## Interface: 120100\n## Interface: 11508\nAddon.lua\n').interfaceVersion, '120100');
});

test('a toc without an Interface line reports none', () => {
  assert.equal(toc('## Title: Addon\nAddon.lua\n').interfaceVersion, null);
});
