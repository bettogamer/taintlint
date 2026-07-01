import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiEntry, Tier } from './types.ts';

export interface ApiDb {
  build: string;
  /** function name (global or "C_Namespace.Fn") → entry, return-side hazards only */
  functions: Map<string, ApiEntry>;
  /** event literal name → raw flags (SecretPayloads etc.) */
  events: Map<string, Record<string, unknown>>;
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

/** Latest db shipped with the package (sorted by filename = by build). */
export function latestDbPath(): string {
  const files = readdirSync(DB_DIR).filter((f) => /^apidb-.*\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no api-db found in ${DB_DIR}`);
  return join(DB_DIR, files[files.length - 1]!);
}

export function loadApiDb(path: string = latestDbPath()): ApiDb {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    build: string;
    functions: Record<string, Record<string, unknown>>;
    events: Record<string, Record<string, unknown>>;
  };
  const functions = new Map<string, ApiEntry>();
  for (const [name, flags] of Object.entries(raw.functions)) {
    const tier = tierOf(flags);
    if (tier) functions.set(name, { tier, flags });
  }
  return { build: raw.build, functions, events: new Map(Object.entries(raw.events)) };
}
