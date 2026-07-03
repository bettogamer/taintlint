# taintlint rules

One page per rule, titled with the in-game error it prevents. If you just got an error out of
BugSack, paste it into the CLI and it will point you here:

```
npx taintlint explain "attempt to perform arithmetic on a secret value"
```

| Rule | In-game error / problem | Severity |
|------|--------------------------|----------|
| [SV001](SV001.md) | "attempt to perform arithmetic on a secret value" | error / warning |
| [SV002](SV002.md) | "attempt to compare a secret number value" | error / warning |
| [SV003](SV003.md) | "attempt to concatenate a secret number value" (also `tostring`) | error / warning |
| [SV004](SV004.md) | "attempt to get length of a secret value" | error / warning |
| [SV005](SV005.md) | "attempt to store a secret value as a table key" | error / warning |
| [SV006](SV006.md) | "attempt to index local '…' (a secret value)" | error / warning |
| [SV007](SV007.md) | "attempt to call a secret value" | error / warning |
| [SV008](SV008.md) | secret args in BigWigs/DBM callbacks (throws mid-encounter) | warning |
| [SV009](SV009.md) | "execution tainted by '\*\*\* ForceTaint_Strong \*\*\*'" (loadstring/RunScript) | warning |
| [SV010](SV010.md) | helper returns a raw secret value (hazard propagates to callers) | info |
| [SV011](SV011.md) | "attempt to call a nil value (global 'issecretvalue')" on pre-12.0 clients | info |
| [SV012](SV012.md) | `COMBAT_LOG_EVENT[_UNFILTERED]` registration errors on 12.0+ | error |

## Severity model

- **error** — the API is documented `SecretReturns = true`: the value IS secret on tainted
  paths; the operation will throw.
- **warning** — conditionally secret (`SecretWhen*` flags), or the value traveled through a
  local variable (L1 data-flow reports one step below L0).
- **info** — propagation and portability hygiene; never breaks a CI gate.

Reference semantics: [Secret Values — Warcraft Wiki](https://warcraft.wiki.gg/wiki/Secret_Values).
The list of secretable APIs is generated per game build from Blizzard's own
`Blizzard_APIDocumentationGenerated` (see [`db/`](../../db/)).
