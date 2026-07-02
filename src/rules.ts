import type { ApiDb } from './apidb.ts';
import type { Finding, LuaNode, Severity } from './types.ts';

const ARITH_OPS = new Set(['+', '-', '*', '/', '%', '^']);
const COMPARE_OPS = new Set(['==', '~=', '<', '>', '<=', '>=']);
const CLEU_EVENTS = new Set(['COMBAT_LOG_EVENT', 'COMBAT_LOG_EVENT_UNFILTERED']);
const GUARD_FNS = new Set(['issecretvalue', 'issecrettable', 'canaccessvalue', 'canaccesstable']);

// Unit tokens that are always player-controlled units: identity restrictions
// (SecretWhenUnitIdentityRestricted) never apply to them. Deliberately narrow â€”
// "target"/"focus"/"boss1" can be arbitrary units, so they are NOT here.
const SAFE_UNIT_TOKENS =
  /^(player|pet|vehicle|party[1-4]|partypet[1-4]|raid([1-9]|[1-3][0-9]|40)|raidpet([1-9]|[1-3][0-9]|40))$/i;

// Nodes that open a lexical scope for local declarations.
const SCOPE_NODES = new Set([
  'Chunk',
  'FunctionDeclaration',
  'IfClause',
  'ElseifClause',
  'ElseClause',
  'WhileStatement',
  'DoStatement',
  'RepeatStatement',
  'ForNumericStatement',
  'ForGenericStatement',
]);

interface SecretableHit {
  api: string;
  tier: 'unconditional' | 'conditional';
  /** How to name the value in messages; defaults to "<api>() result". */
  label?: string;
}

const BOSSMOD_REGISTRARS = new Set(['RegisterMessage', 'RegisterCallback']);
const DYNAMIC_COMPILERS = new Set(['loadstring', 'load', 'RunScript']);

/**
 * One tracked secret-holding value. Shared by reference across aliases
 * (`local b = a`), so guarding either name clears both. Findings against it are
 * held as candidates and only emitted if the value is never guarded (coarse,
 * whole-function guard recognition: precision over coverage).
 */
interface TaintInfo {
  hit: SecretableHit;
  guarded: boolean;
  candidates: Finding[];
  /** Findings from this taint report as this rule instead of the operation's. */
  ruleOverride?: string;
  /** Fixed severity for findings from this taint (e.g. SV008 → warning). */
  severityOverride?: Severity;
}

interface VarEntry {
  taint: TaintInfo | null;
}

type Scope = Map<string, VarEntry>;

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
  private scopes: Scope[] = [];
  private taints: TaintInfo[] = [];
  private bossmodHandlers = new Set<LuaNode>();
  private compiledCodeRegex: RegExp | undefined;

  constructor(db: ApiDb, file: string) {
    this.db = db;
    this.file = file;
  }

  /** Call after the walk: emits L1 candidates whose value was never guarded. */
  results(): Finding[] {
    for (const t of this.taints) {
      if (!t.guarded) this.findings.push(...t.candidates);
    }
    const out = this.findings;
    this.findings = [];
    this.taints = [];
    return out.sort((a, b) => a.line - b.line || a.column - b.column);
  }

  // ---- scope / data-flow machinery (L1) ------------------------------------

  private currentScope(): Scope {
    return this.scopes[this.scopes.length - 1]!;
  }

  private resolve(name: string): VarEntry | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const entry = this.scopes[i]!.get(name);
      if (entry) return entry;
    }
    return undefined;
  }

  private declareVar(name: string, taint: TaintInfo | null): void {
    this.currentScope().set(name, { taint });
  }

  /** Regex matching any return-side secretable API name followed by a call paren. */
  private compiledRegex(): RegExp {
    if (!this.compiledCodeRegex) {
      const names = [...this.db.functions.keys()].map((n) => n.replace(/\./g, '\\.'));
      this.compiledCodeRegex = new RegExp(`\\b(?:${names.join('|')})\\s*\\(`, 'g');
    }
    return this.compiledCodeRegex;
  }

  private newTaint(hit: SecretableHit): TaintInfo {
    const t: TaintInfo = { hit, guarded: false, candidates: [] };
    this.taints.push(t);
    return t;
  }

  /** Taint carried by an initializer/assignment RHS expression, if any. */
  private taintOfExpr(expr: LuaNode | undefined): TaintInfo | null {
    if (!expr) return null;
    const hit = this.secretableCall(expr);
    if (hit) return this.newTaint(hit);
    if (expr.type === 'Identifier') {
      return this.resolve(expr.name as string)?.taint ?? null;
    }
    return null;
  }

  /**
   * Taints for an aligned var/init list. Lua expands the *last* expression to
   * fill remaining targets (`local name, realm = UnitName(u)`), so trailing
   * variables inherit the last initializer's taint.
   */
  private alignedTaints(count: number, inits: LuaNode[]): (TaintInfo | null)[] {
    const out: (TaintInfo | null)[] = [];
    for (let i = 0; i < count; i++) {
      if (i < inits.length) out.push(this.taintOfExpr(inits[i]));
      else if (inits.length > 0 && isCall(inits[inits.length - 1])) out.push(this.taintOfExpr(inits[inits.length - 1]));
      else out.push(null);
    }
    return out;
  }

  /** If `node` is an Identifier bound to an unguarded tracked secret, return it. */
  private taintedLocal(node: LuaNode | undefined): { name: string; taint: TaintInfo } | null {
    if (!node || node.type !== 'Identifier') return null;
    const taint = this.resolve(node.name as string)?.taint;
    return taint ? { name: node.name as string, taint } : null;
  }

  // ---- classification -------------------------------------------------------

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

  // ---- reporting -------------------------------------------------------------

  private report(rule: string, node: LuaNode, api: string | null, message: string, severity: Severity): void {
    const loc = node.loc?.start ?? { line: 0, column: 0 };
    this.findings.push({ rule, severity, file: this.file, line: loc.line, column: loc.column + 1, api, message });
  }

  private reportHit(rule: string, node: LuaNode, hit: SecretableHit, message: string, severity?: Severity): void {
    const sev = severity ?? (hit.tier === 'unconditional' ? 'error' : 'warning');
    const tierNote = hit.tier === 'conditional' ? ' (conditionally secret)' : '';
    this.report(rule, node, hit.api, `${message}${tierNote}`, sev);
  }

  /**
   * Check one operand: direct secretable call (L0, full severity) or a tracked
   * local (L1, one severity step lower, emission deferred until we know the
   * value is never guarded in its function).
   */
  private checkOperand(rule: string, node: LuaNode | undefined, verb: string, fixedSeverity?: Severity): void {
    if (!node) return;
    const direct = this.secretableCall(node);
    if (direct) {
      this.reportHit(rule, node, direct, `${verb} ${direct.api}() result throws when the value is secret`, fixedSeverity);
      return;
    }
    const local = this.taintedLocal(node);
    if (local) {
      const { hit } = local.taint;
      const sev: Severity =
        local.taint.severityOverride ?? fixedSeverity ?? (hit.tier === 'unconditional' ? 'warning' : 'info');
      const what = hit.label ?? `${hit.api}() result`;
      const tierNote = hit.tier === 'conditional' && !hit.label ? ', conditionally secret' : '';
      const loc = node.loc?.start ?? { line: 0, column: 0 };
      local.taint.candidates.push({
        rule: local.taint.ruleOverride ?? rule,
        severity: sev,
        file: this.file,
        line: loc.line,
        column: loc.column + 1,
        api: hit.api,
        message: `${verb} local '${local.name}' holding ${what} throws when the value is secret (data-flow${tierNote})`,
      });
    }
  }

  // ---- traversal hooks -------------------------------------------------------

  enter(node: LuaNode): void {
    if (SCOPE_NODES.has(node.type)) {
      this.scopes.push(new Map());
      if (node.type === 'FunctionDeclaration') {
        const isBossmod = this.bossmodHandlers.has(node);
        ((node.parameters as LuaNode[] | undefined) ?? []).forEach((p, i) => {
          if (p.type !== 'Identifier') return;
          // Boss-mod callback args (except the event name itself) can arrive as
          // secrets on 12.0.x; operating them unguarded throws mid-encounter.
          if (isBossmod && i > 0) {
            const t = this.newTaint({ api: 'BossModCallback', tier: 'conditional', label: 'a boss-mod callback argument' });
            t.ruleOverride = 'SV008';
            t.severityOverride = 'warning';
            this.declareVar(p.name as string, t);
          } else {
            this.declareVar(p.name as string, null);
          }
        });
      } else if (node.type === 'ForNumericStatement') {
        const v = node.variable as LuaNode;
        if (v?.type === 'Identifier') this.declareVar(v.name as string, null);
      } else if (node.type === 'ForGenericStatement') {
        for (const v of (node.variables as LuaNode[] | undefined) ?? []) {
          if (v.type === 'Identifier') this.declareVar(v.name as string, null);
        }
      }
    }
    this.visit(node);
  }

  exit(node: LuaNode): void {
    if (SCOPE_NODES.has(node.type)) this.scopes.pop();
  }

  private visit(node: LuaNode): void {
    switch (node.type) {
      case 'LocalStatement': {
        const vars = (node.variables as LuaNode[] | undefined) ?? [];
        const inits = (node.init as LuaNode[] | undefined) ?? [];
        // SV011: local issecretvalue = issecretvalue with no pre-12.0 fallback.
        vars.forEach((v, i) => {
          const name = v.name as string;
          const init = inits[i];
          if (GUARD_FNS.has(name) && init && init.type === 'Identifier' && init.name === name) {
            this.report(
              'SV011',
              v,
              name,
              `local ${name} = ${name} without a fallback is nil on pre-12.0 clients â€” add: or function() return false end`,
              'info'
            );
          }
        });
        // Taints are computed against the OUTER bindings (Lua evaluates
        // initializers before the new locals exist), then declared.
        const taints = this.alignedTaints(vars.length, inits);
        vars.forEach((v, i) => {
          if (v.type === 'Identifier') this.declareVar(v.name as string, taints[i] ?? null);
        });
        break;
      }
      case 'AssignmentStatement': {
        const targets = (node.variables as LuaNode[] | undefined) ?? [];
        const values = (node.init as LuaNode[] | undefined) ?? [];
        const taints = this.alignedTaints(targets.length, values);
        targets.forEach((t, i) => {
          if (t.type !== 'Identifier') return;
          const entry = this.resolve(t.name as string);
          // Reassignment replaces the binding: new taint or a kill.
          if (entry) entry.taint = taints[i] ?? null;
        });
        break;
      }
      case 'BinaryExpression': {
        const op = node.operator as string;
        const rule = ARITH_OPS.has(op) ? 'SV001' : COMPARE_OPS.has(op) ? 'SV002' : op === '..' ? 'SV003' : null;
        if (!rule) break;
        const verb = rule === 'SV001' ? 'arithmetic on' : rule === 'SV002' ? 'comparison of' : 'concatenation of';
        this.checkOperand(rule, node.left as LuaNode, verb);
        this.checkOperand(rule, node.right as LuaNode, verb);
        break;
      }
      case 'UnaryExpression': {
        const arg = node.argument as LuaNode;
        if (node.operator === '-') this.checkOperand('SV001', arg, 'arithmetic on');
        else if (node.operator === '#') this.checkOperand('SV004', arg, 'length of');
        break;
      }
      case 'IndexExpression': {
        this.checkOperand('SV005', node.index as LuaNode, 'table key from');
        this.checkOperand('SV006', node.base as LuaNode, 'indexing');
        break;
      }
      case 'TableKey': {
        this.checkOperand('SV005', node.key as LuaNode, 'table key from');
        break;
      }
      case 'MemberExpression': {
        this.checkOperand('SV006', node.base as LuaNode, 'indexing');
        break;
      }
      case 'CallExpression':
      case 'StringCallExpression':
      case 'TableCallExpression': {
        // Guard recognition: issecretvalue(x)/issecrettable(x)/canaccess*(x)
        // anywhere in the file marks x's value as handled (coarse on purpose).
        const name = calleeName(node);
        if (name && GUARD_FNS.has(name)) {
          const local = this.taintedLocal(firstArgument(node));
          if (local) local.taint.guarded = true;
          break; // a guard call is never itself a violation
        }
        // SV007: calling a (possibly) secret value.
        this.checkOperand('SV007', node.base as LuaNode, 'calling');
        // SV003: tostring() of a secretable value.
        if (name === 'tostring') this.checkOperand('SV003', firstArgument(node), 'tostring() of');
        // SV008: boss-mod callback registration — taint the handler's args.
        if (node.type === 'CallExpression') {
          const base = node.base as LuaNode;
          const registrar = base.type === 'MemberExpression' ? ((base.identifier as LuaNode).name as string) : null;
          if (registrar && BOSSMOD_REGISTRARS.has(registrar)) {
            const callArgs = (node.arguments as LuaNode[] | undefined) ?? [];
            const eventArg = callArgs.find((a) => {
              const s = stringLiteral(a);
              return s !== null && (s.startsWith('BigWigs_') || s.startsWith('DBM_'));
            });
            if (eventArg) {
              for (const a of callArgs) if (a.type === 'FunctionDeclaration') this.bossmodHandlers.add(a);
            }
          }
        }
        // SV009: string literals compiled at runtime run under ForceTaint_Strong,
        // where EVERY secretable API returns secrets — always, even out of combat.
        if (name && DYNAMIC_COMPILERS.has(name)) {
          const codeArg = firstArgument(node);
          if (codeArg?.type === 'StringLiteral') {
            const code = (codeArg.raw as string) ?? '';
            for (const api of new Set(code.match(this.compiledRegex()) ?? [])) {
              this.report(
                'SV009',
                codeArg,
                api.replace(/\s*\($/, ''),
                `${api.replace(/\s*\($/, '')}() inside ${name}()'d code runs under ForceTaint_Strong and ALWAYS returns a secret, even out of combat`,
                'warning'
              );
            }
          }
        }
        // SV012: direct CLEU registration errors on 12.0+.
        if (node.type === 'CallExpression') {
          const base = node.base as LuaNode;
          if (base.type === 'MemberExpression' && (base.identifier as LuaNode).name === 'RegisterEvent') {
            const ev = stringLiteral(firstArgument(node));
            if (ev && CLEU_EVENTS.has(ev))
              this.report('SV012', node, null, `registering ${ev} directly errors on 12.0+ â€” use C_CombatLog`, 'error');
          }
        }
        break;
      }
      case 'ReturnStatement': {
        for (const arg of (node.arguments as LuaNode[] | undefined) ?? []) {
          const direct = this.secretableCall(arg);
          if (direct) {
            this.report('SV010', arg, direct.api, `returning the raw ${direct.api}() result propagates the secret to every caller`, 'info');
            continue;
          }
          const local = this.taintedLocal(arg);
          if (local) {
            const loc = arg.loc?.start ?? { line: 0, column: 0 };
            local.taint.candidates.push({
              rule: 'SV010',
              severity: 'info',
              file: this.file,
              line: loc.line,
              column: loc.column + 1,
              api: local.taint.hit.api,
              message: `returning local '${local.name}' holding ${local.taint.hit.api}() result propagates the secret to every caller (data-flow)`,
            });
          }
        }
        break;
      }
    }
  }
}
