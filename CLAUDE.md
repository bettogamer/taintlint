# taintlint — agent context

Static analysis for World of Warcraft addon Lua. It detects usages of **secret values**
(WoW 12.0+ "Midnight") that will throw Lua errors at runtime — before the addon ships.
North star: *no addon should ever discover a secret-value error in a raid.*

## Non-negotiable principles

1. **Precision > coverage.** A finding we are not sure about is a finding we do not report at
   `error` severity. Release gate: **0 false positives running against MRT** (Method Raid Tools,
   a correctly-ported 12.0.7 addon). False negatives are accepted and documented.
2. **Fixtures before rule code.** Every rule gets a failing fixture (code that breaks in-game)
   and a guarded fixture (code that must NOT be flagged) before the rule is implemented.
   Fixtures are the rule's contract.
3. **Never invent secret-value semantics.** The source of truth is the per-build API database
   extracted from `Blizzard_APIDocumentationGenerated` (via Gethe/wow-ui-source), plus
   https://warcraft.wiki.gg/wiki/Secret_Values. If the DB and an assumption disagree, the DB wins.
4. The core is **offline static analysis**. No runtime/in-game component in this repo (a
   separate minimal companion may exist post-v1). No general Lua linting — luacheck's job.

## Architecture facts

- WoW is **Lua 5.1**. Parser: luaparse in `luaVersion: '5.1'` mode **plus the `break;` shim**
  (luaparse's 5.1 grammar misses the optional `;` after laststat; the shim blanks that `;`
  preserving offsets). Do not switch to 5.2 mode: it rejects unknown string escapes (`"\|"`)
  that real 5.1/WoW accepts.
- **api-db**: JSON generated per game build from `Blizzard_APIDocumentationGenerated`
  (sparse-cloned from `Gethe/wow-ui-source`, branch `live`). Flags observed in the wild:
  `SecretReturns`, `ReturnsNeverSecret`, `ConditionalSecret`, `SecretArguments`,
  `SecretWhen*` family, `SecretIn*` family, `SecretPayloads` (events).
- **Two confidence tiers**, empirically validated in the spike: unconditional
  (`SecretReturns = true`) → `error`; conditional (`SecretWhen*`/`SecretIn*`) → lower tier and
  requires predicate-aware logic (e.g. `SecretWhenUnitIdentityRestricted` does NOT apply to
  player units — flagging `t[UnitName("raid1")]` is a false positive).
- Analysis levels: L0 (call directly inside a forbidden operation), L1 (intra-function
  data-flow through locals, guard-aware: `issecretvalue`/`issecrettable`/pcall probes).
  No whole-program analysis, ever.
- Rule IDs: `SV001`–`SV012` (arithmetic, comparison, concat, `#`, table key, secret table
  indexing, call, boss-mod callback args, loadstring/ForceTaint_Strong context, secret-returning
  helper, missing `issecretvalue` shim, direct CLEU registration).
- Spike evidence and detailed lessons: `spike/RESULTS.md`.

## When a new WoW build ships

Follow **`docs/UPDATING-DB.md`** verbatim: `node scripts/update-db.mjs [--ref ptr]` →
review the printed diff (STOP on `⚠ NEW FLAG NAMES`: update `tierOf()`/heuristics first,
never guess flag semantics) → tests + MRT benchmark (0 new errors) → atomic `db: <version>
(<build>)` commit, engine changes in a separate commit before it.

## Workflow

- **Trunk-based**: `main` is the only permanent branch and stays green. Short-lived
  `feat/*`/`fix/*` branches only for reviewable or throwaway work. Releases are semver tags.
- **api-db updates are atomic commits** (`db: 12.1.0 (68xxx)`), never mixed with rule changes —
  the DB diff history is itself a product artifact.
- Public-facing language (README, rule docs, messages, commits) is **English**. Each rule doc
  page is titled with the literal in-game error message it prevents (that's the SEO channel).
- Commit messages: plain descriptive messages, **no AI co-author trailers or tool attributions**.

## Running the spike scripts

```
node spike/s1-parse-corpus.mjs      # parser over real addon corpora
node spike/s2-extract-apidb.mjs     # build api-db from wow-ui-source (needs spike/.cache clone)
node spike/s3-proto-rules.mjs       # prototype rules; STRICT=1 = unconditional-only tier
```

Machine-specific paths (corpora locations, local Node) live in `CLAUDE.local.md` (gitignored).
