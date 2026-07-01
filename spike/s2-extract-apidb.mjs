// S2: extract per-build secretable-API DB from Blizzard_APIDocumentationGenerated.
// (pass: JSON with >=1 SecretReturns API and >=1 conditional-secret API)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import luaparse from 'luaparse';

const DOCS = 'c:/Users/Usuario/Documents/Workspace/taintlint/spike/.cache/wow-ui-source/Interface/AddOns/Blizzard_APIDocumentationGenerated';
const OUT = 'c:/Users/Usuario/Documents/Workspace/taintlint/spike/.cache/apidb-12.0.7-68275.json';

// Flatten a TableConstructorExpression's string-keyed literal fields.
function fields(tableNode) {
  const out = {};
  for (const f of tableNode.fields) {
    if (f.type !== 'TableKeyString') continue;
    const k = f.key.name;
    const v = f.value;
    if (v.type === 'BooleanLiteral') out[k] = v.value;
    else if (v.type === 'StringLiteral') out[k] = v.raw.slice(1, -1);
    else if (v.type === 'NumericLiteral') out[k] = v.value;
    else out[k] = v; // nested table etc. — keep node
  }
  return out;
}

const db = { build: '12.0.7 (68275)', source: 'Gethe/wow-ui-source@live dc16328', functions: {}, events: {} };
let parseFailures = 0;

for (const name of readdirSync(DOCS).filter((n) => n.endsWith('.lua'))) {
  const src = readFileSync(join(DOCS, name), 'utf8');
  let ast;
  try {
    ast = luaparse.parse(src, { luaVersion: '5.1', scope: false });
  } catch {
    parseFailures++;
    continue;
  }
  // File shape: local T = { Name=..., Namespace?, Functions={...}, Events={...} }
  let namespace = null;
  const entries = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TableConstructorExpression') {
      const f = fields(node);
      if (typeof f.Namespace === 'string' && !namespace) namespace = f.Namespace;
      if (f.Name && (f.Type === 'Function' || f.Type === 'Event')) entries.push(f);
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && v.type) walk(v);
    }
  })(ast);

  for (const e of entries) {
    const secretKeys = Object.keys(e).filter((k) => /Secret/.test(k));
    // SecretArguments="NotAllowed" is the safe default, not a hazard — skip pure-defaults
    const hazard = secretKeys.filter((k) => !(k === 'SecretArguments' && e[k] === 'NotAllowed'));
    if (hazard.length === 0) continue;
    const flags = {};
    for (const k of hazard) flags[k] = typeof e[k] === 'object' ? true : e[k];
    if (e.Type === 'Function') {
      db.functions[namespace ? `${namespace}.${e.Name}` : e.Name] = flags;
    } else {
      db.events[e.LiteralName ?? e.Name] = flags;
    }
  }
}

mkdirSync(join(DOCS, '..', '..', '..', '..', '..'), { recursive: true });
writeFileSync(OUT, JSON.stringify(db, null, 1));

const fns = Object.entries(db.functions);
const evs = Object.entries(db.events);
console.log(`functions with secret flags: ${fns.length}`);
console.log(`events with secret flags:    ${evs.length}`);
console.log(`doc files that failed to parse: ${parseFailures}`);
console.log(`unconditional SecretReturns: ${fns.filter(([, f]) => f.SecretReturns === true).length}`);
const conditional = fns.filter(([, f]) => Object.keys(f).some((k) => k.startsWith('SecretWhen') || k === 'ConditionalSecret'));
console.log(`conditional secrets:         ${conditional.length}`);
console.log('\nspot checks:');
for (const probe of ['UnitHealth', 'UnitHealthMax', 'UnitPower', 'UnitGUID', 'UnitName']) {
  const hit = fns.filter(([n]) => n === probe || n.endsWith(`.${probe}`));
  console.log(' ', probe, '→', hit.length ? JSON.stringify(hit[0][1]) : 'NOT IN DB');
}
console.log('\nsample flag vocabulary:', [...new Set(fns.flatMap(([, f]) => Object.keys(f)))].join(', '));
