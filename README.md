# taintlint

[![ci](https://github.com/bettogamer/taintlint/actions/workflows/ci.yml/badge.svg)](https://github.com/bettogamer/taintlint/actions/workflows/ci.yml)

> Static analysis for World of Warcraft addon Lua — catch **secret value** errors before they
> hit the raid.

WoW 12.0 ("Midnight") introduced [secret values](https://warcraft.wiki.gg/wiki/Secret_Values):
on tainted execution paths, many APIs return values that cannot be used in arithmetic,
comparisons, concatenation, or as table keys without throwing a Lua error — often only in
combat, where you can't debug. taintlint finds those usages **statically**, in your editor or CI.

**[On npm](https://www.npmjs.com/package/taintlint)** — requires Node ≥ 20.

## Usage

```
npx taintlint <addon-dir|file.toc|file.lua> [options]

--format json          machine-readable output
--min-severity <s>     error | warning | info (default: info)
--update-baseline      freeze current findings; CI then fails only on NEW ones
--baseline <path>      baseline location (default: <root>/taintlint-baseline.json)
```

Exit code 1 when non-baselined `error`-severity findings exist.

Example, against a real addon:

```
core.lua:303:4   ERROR   SV012  registering COMBAT_LOG_EVENT_UNFILTERED directly errors on 12.0+ — use C_CombatLog
ExCD2.lua:5931:16 ERROR  SV001  arithmetic on UnitHealth() result throws when the value is secret
Reminder.lua:2528:86 WARNING SV005  UnitName() result used as a table key throws when the value is secret (conditionally secret)
```

Suppress a finding you have judged safe (reason required by convention):

```lua
local hp = UnitHealth(u) / m  -- taintlint: allow SV001 (classic-only path)
```

### From a BugSack error to the fix

Paste the error you just saw in raid:

```
$ npx taintlint explain "attempt to perform arithmetic on a secret value"

SV001 — arithmetic on a secretable value
  error: attempt to perform arithmetic on a secret value
  cause: On tainted paths (addon code), secretable APIs return values that cannot be
         inspected; any arithmetic on one throws, typically only in combat.
  fix:   Store the value, guard with issecretvalue(v) and use a fallback — or pass it to a
         secret-accepting API (StatusBar:SetValue, string.format, ColorCurve, Duration).
  docs:  https://github.com/bettogamer/taintlint/blob/main/docs/rules/SV001.md
```

Also accepts rule ids: `npx taintlint explain SV005`.

## GitHub Action

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: bettogamer/taintlint@v0
```

Findings become inline PR annotations; the job fails on new `error`-severity findings
(baseline-aware). Inputs and the badge recipe: [docs/ACTION.md](docs/ACTION.md).

## What it checks

Every rule has a doc page titled with the in-game error it prevents — the
[rules index](docs/rules/README.md) maps error message → rule → fix.

| Rule | Detects |
|------|---------|
| [SV001](docs/rules/SV001.md) | arithmetic on a secretable API result |
| [SV002](docs/rules/SV002.md) | comparison of a secretable API result |
| [SV003](docs/rules/SV003.md) | concatenation / `tostring()` of a secretable API result |
| [SV004](docs/rules/SV004.md) | `#` length of a secretable API result |
| [SV005](docs/rules/SV005.md) | secretable API result used as a table key |
| [SV006](docs/rules/SV006.md) | indexing a possibly-secret table (aura data etc.) |
| [SV007](docs/rules/SV007.md) | calling a possibly-secret value |
| [SV008](docs/rules/SV008.md) | boss-mod callback args (`BigWigs_*`/`DBM_*` inline handlers) operated without a surgical `issecretvalue` guard |
| [SV009](docs/rules/SV009.md) | secretable APIs inside `loadstring`/`RunScript` string literals (ForceTaint_Strong: ALWAYS secret there) |
| [SV010](docs/rules/SV010.md) | helper returning a raw secretable value (propagation) |
| [SV011](docs/rules/SV011.md) | `local issecretvalue = issecretvalue` without a pre-12.0 fallback |
| [SV012](docs/rules/SV012.md) | direct `COMBAT_LOG_EVENT[_UNFILTERED]` registration |

Two confidence tiers: APIs documented `SecretReturns = true` report as **error**; conditionally
secret APIs (`SecretWhen*`) report as **warning**, with a unit-token heuristic (identity
restrictions never apply to `player`/`party`/`raid` literals, so those are not flagged).

**L1 data-flow** (v0.2): secrets are tracked through local variables inside a function —
`local hp = UnitHealth(u); ... hp / max` is caught even though the call and the arithmetic are
apart. Guard-aware: values checked with `issecretvalue`/`issecrettable`/`canaccess*` anywhere in
scope are not reported, reassignment kills the track, aliases share it, shadowing is respected.
L1 findings report one severity step below L0 (warning/info), so they never break a CI gate on
their own.

The secretable-API database (`db/`) is generated per game build from Blizzard's own
`Blizzard_APIDocumentationGenerated`. Current: 12.0.7 (68275).

## Planned

- `taintlint --target <build>` — see what breaks in the next patch before it ships
- Publishing the per-build secretable-API database as a standalone artifact

## License

MIT
