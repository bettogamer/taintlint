import type { ApiDb } from './apidb.ts';
import type { Finding, LuaNode, Severity } from './types.ts';

const ARITH_OPS = new Set(['+', '-', '*', '/', '%', '^']);
const COMPARE_OPS = new Set(['==', '~=', '<', '>', '<=', '>=']);
const CLEU_EVENTS = new Set(['COMBAT_LOG_EVENT', 'COMBAT_LOG_EVENT_UNFILTERED']);

// Unit tokens that are always player-controlled units: identity restrictions
// (SecretWhenUnitIdentityRestricted) never apply to them. Deliberately narrow —
// "target"/"focus"/"boss1" can be arbitrary units, so they are NOT here.
const SAFE_UNIT_TOKENS =
  /^(player|pet|vehicle|party[1-4]|partypet[1-4]|raid([1-9]|[1-3][0-9]|40)|raidpet([1-9]|[1-3][0-9]|40))$/i;

interface SecretableHit {
  api: string;
  tier: 'unconditional' | 'conditional';
}

function stringLiteral(node: LuaNode | undefined): string | null {
  if (!node || node.type !== 'StringLiteral') return null;
  const raw = node.raw as string | undefined;
  return raw ? raw.slice(1, -1) : null;
}

function calleeName(node: LuaNode): string | null {
  const base = node.base as LuaNode | undefined;
  if (!base) return null;
  if (base.type === 'Identifier') return base.name as string;
  if (base.type === 'MemberExpression') {
    const b = base.base as LuaNode;
    const id = base.identifier as LuaNode;
    if (b.type === 'Identifier' && id.type === 'Identifier') return `${b.name}.${id.name}`;
  }
  return null;
}

function firstArgument(call: LuaNode): LuaNode | undefined {
  if (call.type === 'StringCallExpression') return call.argument as LuaNode;
  const args = call.arguments as LuaNode[] | LuaNode | undefined;
  return Array.isArray(args) ? args[0] : (args as LuaNode | undefined);
}

function isCall(node: LuaNode | undefined): node is LuaNode {
  return (
    !!node &&
    (node.type === 'CallExpression' ||
      node.type === 'StringCallExpression' ||
      node.type === 'TableCallExpression')
  );
}

export class RuleContext {
  private findings: Finding[] = [];
  private db: ApiDb;
  private file: string;

  constructor(db: ApiDb, file: string) {
    this.db = db;
    this.file = file;
  }

  results(): Finding[] {
    return this.findings;
  }

  /** If `node` is a call to a return-side secretable API (heuristics applied), classify it. */
  private secretableCall(node: LuaNode | undefined): SecretableHit | null {
    if (!isCall(node)) return null;
    const name = calleeName(node);
    if (!name) return null;
    const entry = this.db.functions.get(name);
    if (!entry) return null;
    if (entry.tier === 'conditional') {
      // Unit-token heuristic, identity family only: if the ONLY secrecy condition
      // is unit identity and the unit argument is a literal player-controlled
      // token, the value can never be secret. Validated against MRT (spike S3).
      const conditions = Object.keys(entry.flags).filter(
        (k) => k === 'ConditionalSecret' || k.startsWith('SecretWhen') || k.startsWith('SecretIn')
      );
      const identityOnly = conditions.every((k) => k === 'SecretWhenUnitIdentityRestricted');
      if (identityOnly) {
        const unit = stringLiteral(firstArgument(node));
        if (unit && SAFE_UNIT_TOKENS.test(unit)) return null;
      }
    }
    return { api: name, tier: entry.tier };
  }

  private report(rule: string, node: LuaNode, api: string | null, message: string, severity: Severity): void {
    const loc = node.loc?.start ?? { line: 0, column: 0 };
    this.findings.push({ rule, severity, file: this.file, line: loc.line, column: loc.column + 1, api, message });
  }

  private reportHit(rule: string, node: LuaNode, hit: SecretableHit, message: string, severity?: Severity): void {
    const sev = severity ?? (hit.tier === 'unconditional' ? 'error' : 'warning');
    const tierNote = hit.tier === 'conditional' ? ' (conditionally secret)' : '';
    this.report(rule, node, hit.api, `${message}${tierNote}`, sev);
  }

  visit(node: LuaNode): void {
    switch (node.type) {
      case 'BinaryExpression': {
        const op = node.operator as string;
        const rule = ARITH_OPS.has(op) ? 'SV001' : COMPARE_OPS.has(op) ? 'SV002' : op === '..' ? 'SV003' : null;
        if (!rule) break;
        const verb = rule === 'SV001' ? 'arithmetic on' : rule === 'SV002' ? 'comparison of' : 'concatenation of';
        for (const side of [node.left as LuaNode, node.right as LuaNode]) {
          const hit = this.secretableCall(side);
          if (hit) this.reportHit(rule, side, hit, `${verb} ${hit.api}() result throws when the value is secret`);
        }
        break;
      }
      case 'UnaryExpression': {
        const arg = node.argument as LuaNode;
        const hit = this.secretableCall(arg);
        if (!hit) break;
        if (node.operator === '-') {
          this.reportHit('SV001', arg, hit, `arithmetic on ${hit.api}() result throws when the value is secret`);
        } else if (node.operator === '#') {
          this.reportHit('SV004', arg, hit, `length of ${hit.api}() result throws when the value is secret`);
        }
        break;
      }
      case 'IndexExpression': {
        const keyHit = this.secretableCall(node.index as LuaNode);
        if (keyHit)
          this.reportHit('SV005', node.index as LuaNode, keyHit, `${keyHit.api}() result used as a table key throws when the value is secret`);
        const baseHit = this.secretableCall(node.base as LuaNode);
        if (baseHit)
          this.reportHit('SV006', node.base as LuaNode, baseHit, `indexing the ${baseHit.api}() result throws when the table is secret`);
        break;
      }
      case 'TableKey': {
        const hit = this.secretableCall(node.key as LuaNode);
        if (hit)
          this.reportHit('SV005', node.key as LuaNode, hit, `${hit.api}() result used as a table key throws when the value is secret`);
        break;
      }
      case 'MemberExpression': {
        const hit = this.secretableCall(node.base as LuaNode);
        if (hit)
          this.reportHit('SV006', node.base as LuaNode, hit, `indexing the ${hit.api}() result throws when the table is secret`);
        break;
      }
      case 'CallExpression':
      case 'StringCallExpression':
      case 'TableCallExpression': {
        // SV007: calling the result of a secretable call.
        const baseHit = this.secretableCall(node.base as LuaNode);
        if (baseHit)
          this.reportHit('SV007', node.base as LuaNode, baseHit, `calling the ${baseHit.api}() result throws when the value is secret`);
        // SV003: tostring() of a secretable call.
        const name = calleeName(node);
        if (name === 'tostring') {
          const hit = this.secretableCall(firstArgument(node));
          if (hit)
            this.reportHit('SV003', firstArgument(node)!, hit, `tostring() of ${hit.api}() result throws when the value is secret`);
        }
        // SV012: direct CLEU registration errors on 12.0+.
        if (node.type === 'CallExpression') {
          const base = node.base as LuaNode;
          if (base.type === 'MemberExpression' && (base.identifier as LuaNode).name === 'RegisterEvent') {
            const ev = stringLiteral(firstArgument(node));
            if (ev && CLEU_EVENTS.has(ev))
              this.report('SV012', node, null, `registering ${ev} directly errors on 12.0+ — use C_CombatLog`, 'error');
          }
        }
        break;
      }
      case 'ReturnStatement': {
        for (const arg of (node.arguments as LuaNode[] | undefined) ?? []) {
          const hit = this.secretableCall(arg);
          if (hit)
            this.reportHit('SV010', arg, hit, `returning the raw ${hit.api}() result propagates the secret to every caller`, 'info');
        }
        break;
      }
      case 'LocalStatement': {
        const vars = (node.variables as LuaNode[] | undefined) ?? [];
        const inits = (node.init as LuaNode[] | undefined) ?? [];
        vars.forEach((v, i) => {
          const name = v.name as string;
          if (name !== 'issecretvalue' && name !== 'issecrettable' && name !== 'canaccessvalue' && name !== 'canaccesstable') return;
          const init = inits[i];
          if (init && init.type === 'Identifier' && init.name === name) {
            this.report(
              'SV011',
              v,
              name,
              `local ${name} = ${name} without a fallback is nil on pre-12.0 clients — add: or function() return false end`,
              'info'
            );
          }
        });
        break;
      }
    }
  }
}
