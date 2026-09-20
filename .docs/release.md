# Release & CI

How a version reaches npm and GitHub. This file is **descriptive** — the rules you must not
break live in [CLAUDE.md](../CLAUDE.md).

## The release path

`pnpm release` runs the full local gate (`build:prod`), then `bumpp` (version bump + tag +
push), then `npm publish`.

`npm publish` deliberately still runs **locally**: CI holds no npm credentials, so releases
carry no provenance attestation. Moving publish into the workflow via npm Trusted Publishing was
evaluated and **dropped on 2026-09-07** (HB-30) — see [roadmap.md](./roadmap.md). The missing
provenance is a known, accepted trade-off, not an oversight.

## `release.yml`

[`.github/workflows/release.yml`](../.github/workflows/release.yml) triggers on a pushed `v*`
tag (what `bumpp` pushes) and on `workflow_dispatch` with a `tag` input, which re-runs the same
job against an existing tag to backfill a Release that never got generated.

Both paths funnel through one workflow-level `TAG` env var — read as `$TAG` inside `run` steps
rather than interpolated into the shell — and `checkout` passes `ref: <tag>` so a backfill gates
the tree that was actually released instead of the default branch's current head.
`fetch-depth: 0` is required: `changelogithub` finds the previous tag from full history and a
shallow clone yields an empty changelog.

The job then verifies the tag matches `package.json`'s `version` and aborts on mismatch, runs the
release gate, and finally runs `pnpm dlx changelogithub@15 --to "$TAG"` to create the GitHub
Release with conventional-commit release notes — that Release body *is* the changelog (see
[CHANGELOG.md](../CHANGELOG.md)).

## Quality gating

There are two GitHub Actions workflows plus the local hook.

1. **The local `pre-commit` hook**, on every commit. husky's `pre-commit` runs `lint-staged`,
   whose config is [`lint-staged.config.mjs`](../lint-staged.config.mjs). `commit-msg` runs
   `commitlint --edit`.
2. **`ci.yml`**, on pull requests — the same four checks, so a PR page is never check-free
   (added in HB-35; first real run was PR #4).
3. **The release gate inside `release.yml`**, which repeats the same commands as `build:prod`
   spelled out as `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm test:e2e` rather than
   `pnpm build:prod`, because `build:prod` shells out to `nr` and CI has no global `@antfu/ni`.
   That pass is what stops a tag pushed without the local gate (or from a fork) from reaching a
   Release; `pnpm test:e2e` builds `dist/` itself via `globalSetup`, so the workflow needs no
   separate build step.

## Branch protection

`main` requires a PR. The `required_approving_review_count: 1` rule was a deadlock for a
single-maintainer repo (GitHub does not let an author approve their own PR) and was set to `0`
on 2026-09-07, with `required_pull_request_reviews` itself kept so the PR requirement still
holds. Merges use a **merge commit**: squash/rebase rewrites SHAs, which would leave the release
tag outside `main`'s history.
