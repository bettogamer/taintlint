# taintlint

> Static analysis for World of Warcraft addon Lua — catch **secret value** errors before they
> hit the raid.

WoW 12.0 ("Midnight") introduced [secret values](https://warcraft.wiki.gg/wiki/Secret_Values):
on tainted execution paths, many APIs return values that cannot be used in arithmetic,
comparisons, concatenation, or as table keys without throwing a Lua error — often only in
combat, where you can't debug. taintlint finds those usages **statically**, in your editor or CI.

**Status: pre-alpha / technical spike.** Nothing to install yet.

## Planned

- `npx taintlint <addon-dir>` — lint an addon (parses the `.toc`, checks every file)
- Per-build database of secretable APIs, auto-generated from `Blizzard_APIDocumentationGenerated`
- Baseline file so existing addons can adopt without turning CI red
- GitHub Action + badge (`secret-safe | 12.0.7`)
- `taintlint explain "<BugSack error>"` — from error message to rule and fix
- `taintlint --target <build>` — see what breaks in the next patch before it ships

## License

MIT
