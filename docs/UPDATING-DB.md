# Runbook: when a new WoW build ships

Audience: maintainers **and coding agents**. Follow this verbatim whenever a new WoW patch/PTR
build lands (the api-db is per-build; taintlint is only as current as its newest db).

## 1. Regenerate the database

```
node scripts/update-db.mjs              # live branch (default)
node scripts/update-db.mjs --ref ptr    # PTR build
```

The script sparse-clones/updates `Gethe/wow-ui-source`, detects the version/build from the
commit subject, writes `db/apidb-<version>-<build>.json`, and prints a **diff against the
previous db**: newly secretable APIs, APIs no longer flagged, changed flags.

## 2. Review the diff — three things matter

1. **Newly secretable APIs** — these are the headline (they power `--target` and the
   announcement post: "these APIs break in <version>").
2. **`⚠ NEW FLAG NAMES`** — Blizzard added a flag the engine has never seen. STOP and review:
   - `src/apidb.ts` `tierOf()` — does the new flag classify as unconditional/conditional?
   - `src/rules.ts` — does any heuristic (e.g. the unit-token identity whitelist) need to know
     about it?
   Never guess semantics: check the flag's usage in the docs files and the wiki
   ([Secret Values](https://warcraft.wiki.gg/wiki/Secret_Values)) first.
3. **Removed/relaxed APIs** — fine, the diff records it; no action.

## 3. Validate

```
node node_modules/typescript/bin/tsc --noEmit
node --test "test/*.test.ts"
```

Then re-run the benchmark corpora (paths are machine-specific, see `CLAUDE.local.md`):
- **MRT** must still produce **0 new errors** vs its previous run (the 6 known semantic
  findings are expected; anything new needs manual classification before release).
- WeakAuras 5.21.1 / Beacon as regression references.

If a fixture breaks because Blizzard changed an API's flags (e.g. `UnitHealth` stops being
unconditional), the fixture — the contract — is what gets updated, consciously, in the same
commit as the db.

## 4. Commit atomically

```
git add db/
git commit -m "db: <version> (<build>)"
```

**Never mix db updates with rule/code changes** — the db diff history is a product artifact
(it feeds `--target` and the per-patch announcements). If step 2 required engine changes,
they go in a SEPARATE commit before the db commit.

## 5. Housekeeping

- Update the "Current:" build line in `README.md`.
- Keep the previous db files: multi-version support selects by `## Interface:` from the `.toc`.
