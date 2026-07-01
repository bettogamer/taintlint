# Badges

Three canonical variants (design approved 2026-07-01), all with the taintlint logo — Lucide
`eye-off` ([ISC](https://lucide.dev/license)) embedded as a base64 data-URI so no external logo
hosting is needed. Regenerate the URLs for any game version with:

```
node scripts/badge-urls.mjs 12.0.7
```

| Variant | Audience | Style |
|---|---|---|
| `taintlint \| secret-safe <version>` | devs, GitHub README | flat (default) |
| `Secret-Safe \| <version>` | players, CurseForge/WoWInterface description | `for-the-badge` |
| `taintlint \| N issues` | CI counter (via the future Action + gist endpoint) | flat |

Colors: `2ea44f` green = passing · `orange` = has issues · `red` = failing.

Honesty rule: a pasted badge is self-attestation. Public wording is "scanned"/"secret-safe",
never "certified", until the verifiable tier exists (badge links to a public Actions run).
