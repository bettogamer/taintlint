import luaparse from 'luaparse';
import type { LuaNode } from './types.ts';

export interface ParseResult {
  ast: LuaNode;
  comments: LuaNode[];
}

/**
 * Parse WoW addon Lua (5.1). luaparse's 5.1 grammar misses the optional ';'
 * after a laststat (`break;`), which real Lua 5.1 — and therefore WoW — accepts.
 * The shim blanks that ';' with a space so byte offsets and locations survive.
 * 5.2 mode is NOT an option: it rejects unknown string escapes ("\|") that 5.1
 * treats as literal characters and WoW addons rely on.
 */
export function parseLua(source: string): ParseResult {
  const prepared = source
    .replace(/^﻿/, ' ')
    .replace(/\bbreak\s*;/g, (m) => m.replace(';', ' '));
  const ast = luaparse.parse(prepared, {
    luaVersion: '5.1',
    locations: true,
    comments: true,
    scope: false,
  }) as unknown as LuaNode;
  const comments = (ast.comments as LuaNode[] | undefined) ?? [];
  return { ast, comments };
}
