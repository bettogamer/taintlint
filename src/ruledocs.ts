/**
 * Rule metadata for `taintlint explain`: maps an in-game error message (or a
 * rule id) to the rule, its cause and its fix. The markdown pages under
 * docs/rules/ are the long-form version; a test keeps both in sync.
 */

export interface RuleDoc {
  id: string;
  name: string;
  /** The literal in-game error (or problem statement) — H1 of the doc page. */
  error: string;
  /** Substrings/regexes matched (case-insensitively) against a pasted error. */
  matches: RegExp[];
  cause: string;
  fix: string;
}

const DOCS_BASE = 'https://github.com/bettogamer/taintlint/blob/main/docs/rules';

export function docUrl(id: string): string {
  return `${DOCS_BASE}/${id}.md`;
}

export const RULE_DOCS: RuleDoc[] = [
  {
    id: 'SV001',
    name: 'arithmetic on a secretable value',
    error: 'attempt to perform arithmetic on a secret value',
    matches: [/perform arithmetic on .*secret/i],
    cause:
      'On tainted paths (addon code), secretable APIs return values that cannot be inspected; any arithmetic on one throws, typically only in combat.',
    fix: 'Store the value, guard with issecretvalue(v) and use a fallback — or pass it to a secret-accepting API (StatusBar:SetValue, string.format, ColorCurve, Duration).',
  },
  {
    id: 'SV002',
    name: 'comparison of a secretable value',
    error: 'attempt to compare a secret number value',
    matches: [/attempt to compare .*secret/i],
    cause:
      'Comparing a secret value (== ~= < > <= >=) is forbidden in tainted code; the API returns a plain number out of combat and a secret in combat.',
    fix: 'Guard with issecretvalue(v) and degrade (hide/skip). type(v) and boolean tests of non-boolean secrets remain allowed; thresholds can use ColorCurve/StatusBar instead.',
  },
  {
    id: 'SV003',
    name: 'concatenation / tostring of a secretable value',
    error: 'attempt to concatenate a secret number value',
    matches: [/attempt to concatenate .*secret/i, /tostring.*secret/i],
    cause: 'Concatenation (..) and tostring() would reveal a secret value, so both throw in tainted code.',
    fix: 'Use string.format / FontString:SetFormattedText — they accept secret values. If you need a plain string, guard with issecretvalue(v) first.',
  },
  {
    id: 'SV004',
    name: 'length of a secretable value',
    error: 'attempt to get length of a secret value',
    matches: [/get length of .*secret/i],
    cause: 'The # operator inspects the value (string length leaks content), so it throws on secrets in tainted code.',
    fix: 'Guard with issecretvalue(v) before measuring. Literal player/party/raid unit tokens are never identity-restricted and are not flagged.',
  },
  {
    id: 'SV005',
    name: 'secretable value as a table key',
    error: 'attempt to store a secret value as a table key',
    matches: [/secret value as a table key/i, /table index is .*secret/i],
    cause:
      'Storing a secret as a table VALUE is allowed; using it as a KEY is not (key lookup reveals equality). Classic case: seen[UnitGUID(unit)] = true.',
    fix: 'Guard with issecretvalue(v); if secret, re-key with non-secret data (spellId, counter) or skip the cache for that unit.',
  },
  {
    id: 'SV006',
    name: 'indexing a secret table/value',
    error: "attempt to index local '…' (a secret value)",
    matches: [/attempt to index .*secret/i],
    cause:
      'Some APIs (C_UnitAuras.GetAuraDataBy*) return whole secret TABLES; indexing one — or calling methods on a secret string — throws.',
    fix: 'Store first, guard with issecrettable(t) (table variant of issecretvalue), then read fields.',
  },
  {
    id: 'SV007',
    name: 'calling a secretable value',
    error: 'attempt to call a secret value',
    matches: [/attempt to call a secret/i, /attempt to call .*\(a secret/i],
    cause: 'Calling a secret value as a function is forbidden in tainted code.',
    fix: 'Guard with issecretvalue(v) before calling; type(v) == "function" is safe on secrets.',
  },
  {
    id: 'SV008',
    name: 'boss-mod callback args operated unguarded',
    error: 'secret values in BigWigs / DBM callback arguments',
    matches: [/tainted by 'BigWigs/i, /tainted by 'DBM/i, /bigwigs_|dbm_/i],
    cause:
      'Handlers for BigWigs_*/DBM_* messages run as the boss mod’s callback; on 12.0.x their args (duration, text, spellId…) can arrive secret and throw mid-encounter.',
    fix: 'Guard SURGICALLY: issecretvalue only on the args you actually operate on, degrading that one action (skip that bar / fall back to a default). A broad all-args guard kills timers that would work.',
  },
  {
    id: 'SV009',
    name: 'secretable APIs in loadstring/RunScript code',
    error: "execution tainted by '*** ForceTaint_Strong ***'",
    matches: [/forcetaint_strong/i, /forcetaint/i],
    cause:
      'Runtime-compiled code (loadstring/RunScript/custom trigger snippets) runs under ForceTaint_Strong: every secretable API returns a secret ALWAYS, even out of combat.',
    fix: 'Move the logic out of the compiled chunk, use secret-accepting APIs (StatusBar, string.format, ColorCurve, Duration), or pcall + issecretvalue and degrade.',
  },
  {
    id: 'SV010',
    name: 'helper returning a raw secretable value',
    error: 'returning a raw secret value propagates the hazard',
    matches: [],
    cause:
      'No error fires at the return itself — every CALLER inherits an uninspectable value and explodes far from the cause.',
    fix: 'Return a non-secret answer (e.g. true/false for existence) or guard once inside the helper instead of in N call sites.',
  },
  {
    id: 'SV011',
    name: 'issecretvalue localized without a pre-12.0 fallback',
    error: "attempt to call a nil value (global 'issecretvalue')",
    matches: [/nil value.*issecret/i, /issecret.*nil value/i, /nil value.*canaccess/i],
    cause:
      'issecretvalue/issecrettable only exist on 12.0+ clients; `local issecretvalue = issecretvalue` caches nil on older clients and the guard itself crashes.',
    fix: 'Use the shim: local issecretvalue = issecretvalue or function() return false end (on pre-12.0 clients nothing is secret, so constant false is correct).',
  },
  {
    id: 'SV012',
    name: 'direct COMBAT_LOG_EVENT registration',
    error: 'COMBAT_LOG_EVENT can no longer be registered (12.0+)',
    matches: [/combat_log_event/i],
    cause:
      'RegisterEvent("COMBAT_LOG_EVENT[_UNFILTERED]") errors on 12.0+: raw CLEU access was removed in the secret-values overhaul.',
    fix: 'Migrate to the C_CombatLog namespace and treat payload fields as potentially secret. Gate multi-flavor code by API presence (if C_CombatLog then …).',
  },
];

/** Rules matching a pasted error message (or a rule id), best matches only. */
export function matchRules(query: string): RuleDoc[] {
  const q = query.trim();
  const byId = RULE_DOCS.find((r) => r.id.toLowerCase() === q.toLowerCase());
  if (byId) return [byId];
  const hits = RULE_DOCS.filter((r) => r.matches.some((m) => m.test(q)));
  // A ForceTaint_Strong error is usually ALSO an arithmetic/compare error;
  // keep both, but put the context rule (SV009) first — it changes the fix.
  if (hits.some((r) => r.id === 'SV009')) {
    hits.sort((a, b) => (a.id === 'SV009' ? -1 : b.id === 'SV009' ? 1 : 0));
  }
  return hits;
}

export function formatExplanation(rules: RuleDoc[], query: string): string {
  if (rules.length === 0) {
    return (
      `no rule matches "${query}"\n\n` +
      'If this is a secret-value error not covered yet, please open an issue:\n' +
      '  https://github.com/bettogamer/taintlint/issues\n' +
      `All rules: ${DOCS_BASE}/README.md`
    );
  }
  return rules
    .map(
      (r) =>
        `${r.id} — ${r.name}\n` +
        `  error: ${r.error}\n` +
        `  cause: ${r.cause}\n` +
        `  fix:   ${r.fix}\n` +
        `  docs:  ${docUrl(r.id)}`
    )
    .join('\n\n');
}
