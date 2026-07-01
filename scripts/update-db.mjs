// Regenerate the secretable-API database from Blizzard_APIDocumentationGenerated.
// Usage: node scripts/update-db.mjs [--ref live|ptr|beta] [--source <wow-ui-source dir>]
// Writes db/apidb-<version>-<build>.json and prints a diff vs the previous db.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'wow-ui-source');
const DB_DIR = join(ROOT, 'db');
const REPO = 'https://github.com/Gethe/wow-ui-source';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const ref = argValue('--ref', 'live');
let source = argValue('--source', null);

if (!source) {
  if (!existsSync(CACHE)) {
    console.log(`cloning ${REPO} (${ref}, sparse)…`);
    mkdirSync(dirname(CACHE), { recursive: true });
    execSync(`git clone --depth 1 --filter=blob:none --sparse --branch ${ref} ${REPO} "${CACHE}"`, { stdio: 'inherit' });
    execSync('git sparse-checkout set Interface/AddOns/Blizzard_APIDocumentationGenerated', { cwd: CACHE, stdio: 'inherit' });
  } else {
    console.log(`updating ${ref}…`);
    execSync(`git fetch --depth 1 origin ${ref}`, { cwd: CACHE, stdio: 'inherit' });
    execSync('git checkout FETCH_HEAD', { cwd: CACHE, stdio: 'inherit' });
  }
  source = CACHE;
}

const head = execSync('git log -1 --format=%s', { cwd: source }).toString().trim();
const m = /^([\d.]+)\s*\((\d+)\)/.exec(head);
if (!m) throw new Error(`cannot parse version/build from commit subject: "${head}"`);
const [, version, build] = m;
const DOCS = join(source, 'Interface', 'AddOns', 'Blizzard_APIDocumentationGenerated');

// ---- extraction (same semantics as the shipped db) --------------------------

function fields(tableNode) {
  const out = {};
  for (const f of tableNode.fields) {
    if (f.type !== 'TableKeyString') continue;
    const v = f.value;
    if (v.type === 'BooleanLiteral') out[f.key.name] = v.value;
    else if (v.type === 'StringLiteral') out[f.key.name] = v.raw.slice(1, -1);
    else if (v.type === 'NumericLiteral') out[f.key.name] = v.value;
    else out[f.key.name] = v;
  }
  return out;
}

const db = { build: `${version} (${build})`, source: `Gethe/wow-ui-source@${ref}`, functions: {}, events: {} };
let parseFailures = 0;

for (const name of readdirSync(DOCS).filter((n) => n.endsWith('.lua'))) {
  let ast;
  try {
    ast = luaparse.parse(readFileSync(join(DOCS, name), 'utf8'), { luaVersion: '5.1', scope: false });
  } catch {
    parseFailures++;
    continue;
  }
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
    const hazard = secretKeys.filter((k) => !(k === 'SecretArguments' && e[k] === 'NotAllowed'));
    if (hazard.length === 0) continue;
    const flags = {};
    for (const k of hazard) flags[k] = typeof e[k] === 'object' ? true : e[k];
    if (e.Type === 'Function') db.functions[namespace ? `${namespace}.${e.Name}` : e.Name] = flags;
    else db.events[e.LiteralName ?? e.Name] = flags;
  }
}

// ---- diff against the previous shipped db -----------------------------------

const previousFile = readdirSync(DB_DIR).filter((f) => /^apidb-.*\.json$/.test(f)).sort().pop();
const outFile = join(DB_DIR, `apidb-${version}-${build}.json`);
writeFileSync(outFile, JSON.stringify(db, null, 1));
console.log(`\nwrote ${outFile}`);
console.log(`functions: ${Object.keys(db.functions).length}, events: ${Object.keys(db.events).length}, parse failures: ${parseFailures}`);

if (previousFile && join(DB_DIR, previousFile) !== outFile) {
  const prev = JSON.parse(readFileSync(join(DB_DIR, previousFile), 'utf8'));
  const before = new Set(Object.keys(prev.functions));
  const after = new Set(Object.keys(db.functions));
  const added = [...after].filter((k) => !before.has(k));
  const removed = [...before].filter((k) => !after.has(k));
  const changed = [...after].filter(
    (k) => before.has(k) && JSON.stringify(prev.functions[k]) !== JSON.stringify(db.functions[k])
  );
  console.log(`\ndiff vs ${prev.build} (${previousFile}):`);
  console.log(`  + ${added.length} newly secretable APIs${added.length ? ':\n      ' + added.slice(0, 30).join('\n      ') : ''}`);
  console.log(`  - ${removed.length} no longer flagged${removed.length ? ':\n      ' + removed.slice(0, 30).join('\n      ') : ''}`);
  console.log(`  ~ ${changed.length} with changed flags${changed.length ? ':\n      ' + changed.slice(0, 30).join('\n      ') : ''}`);

  // New flag names the rules engine has never seen — these may need new logic.
  const vocab = (fns) => new Set(Object.values(fns).flatMap((f) => Object.keys(f)));
  const newFlags = [...vocab(db.functions)].filter((f) => !vocab(prev.functions).has(f));
  if (newFlags.length) {
    console.log(`\n  ⚠ NEW FLAG NAMES (review src/rules.ts + src/apidb.ts tier logic!): ${newFlags.join(', ')}`);
  }
}
console.log(`\nnext: review the diff, run tests + benchmark, then commit atomically:\n  git add db/ && git commit -m "db: ${version} (${build})"`);
