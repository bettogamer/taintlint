// S3: do L0 rules find real issues? Prototype of SV001 (arithmetic on a secretable
// call) + SV005 (secretable call as table key) over an unported 11.x addon.
// (pass: >=1 true finding on WeakAuras-5.21.1, no obvious false positives)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import luaparse from 'luaparse';

const DB = JSON.parse(readFileSync('c:/Users/Usuario/Documents/Workspace/taintlint/spike/.cache/apidb-12.0.7-68275.json', 'utf8'));

// Only return-side hazards make a call's *result* dangerous. SecretArguments alone
// restricts what may be passed in, not what comes out.
// STRICT=1 → precision-first: only unconditional SecretReturns counts (severity
// "error" tier); conditional SecretWhen*/SecretIn* would be a lower-confidence tier.
const STRICT = process.env.STRICT === '1';
function returnsSecret(flags) {
  if (flags.ReturnsNeverSecret) return false;
  if (STRICT) return flags.SecretReturns === true;
  return Object.keys(flags).some(
    (k) => k === 'SecretReturns' || k === 'ConditionalSecret' || k.startsWith('SecretWhen') || k.startsWith('SecretIn')
  );
}
const secretable = new Set(Object.entries(DB.functions).filter(([, f]) => returnsSecret(f)).map(([n]) => n));

// "UnitHealth(u)" → UnitHealth ; "C_UnitAuras.GetAuraDataByIndex(...)" → C_UnitAuras.GetAuraDataByIndex
function calleeName(node) {
  if (node.type !== 'CallExpression' && node.type !== 'StringCallExpression') return null;
  const base = node.base;
  if (base.type === 'Identifier') return base.name;
  if (base.type === 'MemberExpression' && base.base.type === 'Identifier' && base.identifier.type === 'Identifier')
    return `${base.base.name}.${base.identifier.name}`;
  return null;
}
function secretableCall(node) {
  const name = node && calleeName(node);
  return name && secretable.has(name) ? name : null;
}

const ARITH = new Set(['+', '-', '*', '/', '%', '^']);
const findings = [];

function check(node, file) {
  if (node.type === 'BinaryExpression' && ARITH.has(node.operator)) {
    for (const side of [node.left, node.right]) {
      const api = secretableCall(side);
      if (api) findings.push({ rule: 'SV001', file, loc: side.loc.start, api, ctx: `arithmetic '${node.operator}'` });
    }
  }
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const api = secretableCall(node.argument);
    if (api) findings.push({ rule: 'SV001', file, loc: node.argument.loc.start, api, ctx: 'unary minus' });
  }
  if (node.type === 'IndexExpression') {
    const api = secretableCall(node.index);
    if (api) findings.push({ rule: 'SV005', file, loc: node.index.loc.start, api, ctx: 'table key t[...]' });
  }
  if (node.type === 'TableKey') {
    const api = secretableCall(node.key);
    if (api) findings.push({ rule: 'SV005', file, loc: node.key.loc.start, api, ctx: 'table constructor key [..]=' });
  }
}

function* luaFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* luaFiles(p);
    else if (extname(name).toLowerCase() === '.lua') yield p;
  }
}

const corpora = {
  'WeakAuras-5.21.1 (11.x, sin portar)': 'c:/Users/Usuario/Documents/Workspace/WA2/related-addons/WeakAuras-5.21.1',
  'MRT (portado 12.0.7 — benchmark FP)': 'F:/Games/World of Warcraft/_retail_/Interface/AddOns/MRT',
};

console.log(`secretable APIs in matcher: ${secretable.size}\n`);
for (const [label, root] of Object.entries(corpora)) {
  const before = findings.length;
  for (const file of luaFiles(root)) {
    const src = readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\bbreak\s*;/g, (m) => m.replace(';', ' '));
    let ast;
    try {
      ast = luaparse.parse(src, { luaVersion: '5.1', locations: true, scope: false });
    } catch { continue; }
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type) check(node, file.slice(root.length + 1));
      for (const k of Object.keys(node)) {
        if (k === 'loc') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object' && v.type) walk(v);
      }
    })(ast);
  }
  const got = findings.slice(before);
  console.log(`== ${label}: ${got.length} findings`);
  for (const f of got) console.log(`  ${f.rule} ${f.file}:${f.loc.line}:${f.loc.column} ${f.api} in ${f.ctx}`);
  console.log();
}
