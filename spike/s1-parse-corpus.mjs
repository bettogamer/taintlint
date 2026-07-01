// S1: can luaparse handle real-world addon Lua? (pass: MRT + Beacon parse clean)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import luaparse from 'luaparse';

const corpora = {
  MRT: 'F:/Games/World of Warcraft/_retail_/Interface/AddOns/MRT',
  Beacon: 'c:/Users/Usuario/Documents/Workspace/WA2/src',
  'WeakAuras-5.21.1': 'c:/Users/Usuario/Documents/Workspace/WA2/related-addons/WeakAuras-5.21.1',
};

function* luaFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* luaFiles(p);
    else if (extname(name).toLowerCase() === '.lua') yield p;
  }
}

for (const [label, root] of Object.entries(corpora)) {
  let ok = 0;
  const failures = [];
  let totalMs = 0;
  for (const file of luaFiles(root)) {
    // WoW is Lua 5.1 (unknown string escapes like \| are literal chars — 5.2 rejects
    // them), but luaparse's 5.1 grammar misses the optional ';' after laststat
    // (break;). Shim: blank that ';' (same length, so locations stay valid) and
    // parse as 5.1. Definitive fix: patch upstream luaparse.
    const src = readFileSync(file, 'utf8')
      .replace(/^﻿/, '')
      .replace(/\bbreak\s*;/g, (m) => m.replace(';', ' '));
    const t0 = performance.now();
    try {
      luaparse.parse(src, { luaVersion: '5.1', locations: true, scope: false });
      ok++;
    } catch (e) {
      failures.push(`${file.slice(root.length + 1)} :: ${e.message}`);
    }
    totalMs += performance.now() - t0;
  }
  console.log(`\n== ${label} == ${ok} ok / ${failures.length} failed (${totalMs.toFixed(0)} ms)`);
  for (const f of failures.slice(0, 20)) console.log('  FAIL', f);
  if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
}
