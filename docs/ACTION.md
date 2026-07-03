# taintlint GitHub Action

Run taintlint in CI with one step. Findings are annotated inline on the PR diff (via a problem
matcher), and the job fails when non-baselined `error`-severity findings exist.

## Usage

```yaml
name: taintlint
on: [push, pull_request]

jobs:
  taintlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bettogamer/taintlint@v0
```

That's it — the action runs `npx taintlint` against the repository root, which is where WoW
addon repos keep their `.toc`.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `path` | `.` | Addon directory, `.toc` or `.lua` file to lint |
| `min-severity` | `warning` | Minimum severity to report: `error` \| `warning` \| `info` |
| `baseline` | `<path>/taintlint-baseline.json` | Baseline file location |
| `version` | `latest` | taintlint version to run (npm semver or dist-tag) |

Example with everything pinned:

```yaml
- uses: bettogamer/taintlint@v0
  with:
    path: MyAddon
    min-severity: error
    version: 0.1.1
```

## Adopting on an existing addon

A pre-12.0 codebase will light up on day one. Freeze the existing findings once, locally:

```
npx taintlint . --update-baseline
```

Commit `taintlint-baseline.json`; from then on CI fails only on **new** findings while the
existing debt stays visible and countable.

## Badge

The workflow gives you the standard Actions badge — the "secret-safe" seal for your README and
CurseForge description:

```markdown
[![taintlint](https://github.com/<you>/<addon>/actions/workflows/taintlint.yml/badge.svg)](https://github.com/<you>/<addon>/actions/workflows/taintlint.yml)
```

See [BADGES.md](BADGES.md) for the shields.io variants (`secret-safe | 12.0.7`).

## Notes

- Runs on the runner's preinstalled Node (requires ≥ 20 — all current GitHub-hosted runners
  qualify). No `setup-node` step needed.
- Inline PR annotations anchor correctly when the linted paths are relative to the repository
  root (the default `path: .`). With a subdirectory `path`, findings still appear in the log
  and fail the job, but annotations may not attach to the diff.
- `@v0` is the moving major tag; pin `@v0.x.y` if you prefer exact versions.
