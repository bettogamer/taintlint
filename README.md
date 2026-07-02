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

## What it checks (v0.1 — L0 rules)

| Rule | Detects |
|------|---------|
| SV001 | arithmetic on a secretable API result |
| SV002 | comparison of a secretable API result |
| SV003 | concatenation / `tostring()` of a secretable API result |
| SV004 | `#` length of a secretable API result |
| SV005 | secretable API result used as a table key |
| SV006 | indexing a possibly-secret table (aura data etc.) |
| SV007 | calling a possibly-secret value |
| SV008 | boss-mod callback args (`BigWigs_*`/`DBM_*` inline handlers) operated without a surgical `issecretvalue` guard |
| SV009 | secretable APIs inside `loadstring`/`RunScript` string literals (ForceTaint_Strong: ALWAYS secret there) |
| SV010 | helper returning a raw secretable value (propagation) |
| SV011 | `local issecretvalue = issecretvalue` without a pre-12.0 fallback |
| SV012 | direct `COMBAT_LOG_EVENT[_UNFILTERED]` registration |

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

- npm package (`npx taintlint`), GitHub Action + badge (`secret-safe | 12.0.7`)
- `taintlint explain "<BugSack error>"` — from error message to rule and fix
- `taintlint --target <build>` — see what breaks in the next patch before it ships

## License

MIT
