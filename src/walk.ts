import type { LuaNode } from './types.ts';

const SKIP_KEYS = new Set(['loc', 'range', 'comments']);

/** Depth-first walk with enter/exit hooks over every `type`-shaped node. */
export function walk(root: LuaNode, enter: (node: LuaNode) => void, exit?: (node: LuaNode) => void): void {
  enter(root);
  for (const key of Object.keys(root)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = root[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && 'type' in item) walk(item as LuaNode, enter, exit);
      }
    } else if (value && typeof value === 'object' && 'type' in (value as object)) {
      walk(value as LuaNode, enter, exit);
    }
  }
  exit?.(root);
}
