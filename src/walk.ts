import type { LuaNode } from './types.ts';

const SKIP_KEYS = new Set(['loc', 'range', 'comments']);

/** Depth-first walk over every AST node (anything object-shaped with a `type`). */
export function walk(root: LuaNode, visit: (node: LuaNode) => void): void {
  visit(root);
  for (const key of Object.keys(root)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = root[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && 'type' in item) walk(item as LuaNode, visit);
      }
    } else if (value && typeof value === 'object' && 'type' in (value as object)) {
      walk(value as LuaNode, visit);
    }
  }
}
