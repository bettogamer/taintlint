import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiEntry, PredicateDoc, Tier } from './types.ts';

export interface ApiDb {
  build: string;
  /** function name (global or "C_Namespace.Fn") → entry, return-side hazards only */
  functions: Map<string, ApiEntry>;
  /** event literal name → raw flags (SecretPayloads etc.) */
  events: Map<string, Record<string, unknown>>;
  /** flag name → Blizzard's own prose (12.1+; empty for older builds) */
  predicates: Map<string, PredicateDoc>;
}

function tierOf(flags: Record<string, unknown>): Tier | null {
  if (flags.ReturnsNeverSecret) return null;
  if (flags.SecretReturns === true) return 'unconditional';
  const conditional = Object.keys(flags).some(
    (k) => k === 'ConditionalSecret' || k.startsWith('SecretWhen') || k.startsWith('SecretIn')
  );
  return conditional ? 'conditional' : null;
}

const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db');
const DB_FILE = /^apidb-(\d+)\.(\d+)\.(\d+)-(\d+)\.json$/;

export interface ShippedDb {
  path: string;
  version: string;
  /** Interface-number form (12.1.0 → 120100), so tocs and dbs compare directly. */
  key: number;
}

/** Databases bundled with the package, oldest first. */
export function shippedDbs(): ShippedDb[] {
  const out: ShippedDb[] = [];
  for (const f of readdirSync(DB_DIR)) {
    const m = DB_FILE.exec(f);
    if (!m) continue;
    const [, major, minor, patch] = m;
    out.push({
      path: join(DB_DIR, f),
      version: `${major}.${minor}.${patch}`,
      key: Number(major) * 10000 + Number(minor) * 100 + Number(patch),
    });
  }
  if (out.length === 0) throw new Error(`no api-db found in ${DB_DIR}`);
  return out.sort((a, b) => a.key - b.key);
}

/** Latest db shipped with the package. */
export function latestDbPath(): string {
  const dbs = shippedDbs();
  return dbs[dbs.length - 1]!.path;
}

/**
 * Interface-number form of a game version: an addon `## Interface: 120100`, a
 * `--target 12.1.0` (or `12.1`), or a bare `120100`. Null when unparseable.
 */
export function versionKey(spec: string | null | undefined): number | null {
  if (!spec) return null;
  const raw = spec.trim();
  if (/^\d{5,6}$/.test(raw)) return Number(raw);
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3] ?? 0);
}

/**
 * The db to analyse a given game version against: the newest one that is not newer
 * than the target, so an addon is checked against the API surface it ships for.
 * Falls back to the oldest db when the target predates every db we carry, and to
 * the newest when the version is unknown.
 */
export function dbForVersion(key: number | null): ShippedDb {
  const dbs = shippedDbs();
  if (key === null) return dbs[dbs.length - 1]!;
  const match = dbs.filter((d) => d.key <= key).pop();
  return match ?? dbs[0]!;
}

export function loadApiDb(path: string = latestDbPath()): ApiDb {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    build: string;
    functions: Record<string, Record<string, unknown>>;
    events: Record<string, Record<string, unknown>>;
    predicates?: Record<string, PredicateDoc>;
  };
  const functions = new Map<string, ApiEntry>();
  for (const [name, flags] of Object.entries(raw.functions)) {
    const tier = tierOf(flags);
    if (tier) functions.set(name, { tier, flags });
  }
  return {
    build: raw.build,
    functions,
    events: new Map(Object.entries(raw.events)),
    predicates: new Map(Object.entries(raw.predicates ?? {})),
  };
}
