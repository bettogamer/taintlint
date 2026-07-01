export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  api: string | null;
  message: string;
}

/** Confidence tier of a secretable API, derived from its documentation flags. */
export type Tier = 'unconditional' | 'conditional';

export interface ApiEntry {
  tier: Tier;
  flags: Record<string, unknown>;
}

// luaparse AST nodes, loosely typed: we only rely on `type`, `loc` and a handful
// of shape-specific fields, and the walker treats everything else generically.
export interface LuaNode {
  type: string;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
}
