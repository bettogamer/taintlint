import { parseLua } from './parser.ts';
import { walk } from './walk.ts';
import { RuleContext } from './rules.ts';
import type { ApiDb } from './apidb.ts';
import type { Finding, LuaNode } from './types.ts';

// -- taintlint: allow SV005 (reason)   — also: allow SV001,SV005 (reason)
// Applies to the comment's own line and the next line.
const SUPPRESS_RE = /taintlint:\s*allow\s+((?:SV\d{3}[,\s]*)+)(?:\((.*?)\))?/i;

function suppressions(comments: LuaNode[]): Map<number, Set<string>> {
  const byLine = new Map<number, Set<string>>();
  for (const c of comments) {
    const m = SUPPRESS_RE.exec(String(c.value));
    if (!m) continue;
    const rules = m[1]!.toUpperCase().match(/SV\d{3}/g) ?? [];
    const line = c.loc?.start.line ?? 0;
    for (const target of [line, line + 1]) {
      const set = byLine.get(target) ?? new Set<string>();
      for (const r of rules) set.add(r);
      byLine.set(target, set);
    }
  }
  return byLine;
}

export function lintSource(source: string, file: string, db: ApiDb): Finding[] {
  let parsed;
  try {
    parsed = parseLua(source);
  } catch (e) {
    return [
      {
        rule: 'TL000',
        severity: 'warning',
        file,
        line: 0,
        column: 0,
        api: null,
        message: `could not parse file: ${(e as Error).message}`,
      },
    ];
  }
  const ctx = new RuleContext(db, file);
  walk(
    parsed.ast,
    (node) => ctx.enter(node),
    (node) => ctx.exit(node)
  );
  const suppressed = suppressions(parsed.comments);
  return ctx.results().filter((f) => !suppressed.get(f.line)?.has(f.rule));
}
