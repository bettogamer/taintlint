import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';

export interface AddonFiles {
  root: string;
  interfaceVersion: string | null;
  luaFiles: string[];
}

function fromXml(xmlPath: string, seen: Set<string>, out: string[]): void {
  if (seen.has(xmlPath) || !existsSync(xmlPath)) return;
  seen.add(xmlPath);
  const dir = dirname(xmlPath);
  const xml = readFileSync(xmlPath, 'utf8');
  for (const m of xml.matchAll(/<(?:Script|Include)\s+file\s*=\s*"([^"]+)"/gi)) {
    const ref = join(dir, m[1]!.replaceAll('\\', '/'));
    if (ref.toLowerCase().endsWith('.lua')) {
      if (existsSync(ref)) out.push(ref);
    } else if (ref.toLowerCase().endsWith('.xml')) {
      fromXml(ref, seen, out);
    }
  }
}

export function filesFromToc(tocPath: string): AddonFiles {
  const root = dirname(tocPath);
  const out: string[] = [];
  const seenXml = new Set<string>();
  let interfaceVersion: string | null = null;
  for (let line of readFileSync(tocPath, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    const meta = /^##\s*Interface\s*:\s*(\d+)/.exec(line);
    if (meta) interfaceVersion = meta[1]!;
    if (line.startsWith('#') || line === '') continue;
    const ref = join(root, line.replaceAll('\\', '/'));
    if (line.toLowerCase().endsWith('.lua')) {
      if (existsSync(ref)) out.push(ref);
    } else if (line.toLowerCase().endsWith('.xml')) {
      fromXml(ref, seenXml, out);
    }
  }
  return { root, interfaceVersion, luaFiles: out };
}

function allLuaFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) allLuaFiles(p, out);
    else if (extname(name).toLowerCase() === '.lua') out.push(p);
  }
}

/** Resolve a target (dir, .toc or .lua) into the list of Lua files to lint. */
export function resolveTarget(target: string): AddonFiles {
  const st = statSync(target);
  if (st.isFile()) {
    if (target.toLowerCase().endsWith('.toc')) return filesFromToc(target);
    return { root: dirname(target), interfaceVersion: null, luaFiles: [target] };
  }
  const tocs = readdirSync(target).filter((f) => f.toLowerCase().endsWith('.toc'));
  // Prefer the base toc (shortest name) when multi-flavor tocs exist (_Mainline etc.)
  if (tocs.length > 0) {
    const toc = tocs.sort((a, b) => a.length - b.length)[0]!;
    const resolved = filesFromToc(join(target, toc));
    if (resolved.luaFiles.length > 0) return resolved;
  }
  const out: string[] = [];
  allLuaFiles(target, out);
  return { root: target, interfaceVersion: null, luaFiles: out };
}
