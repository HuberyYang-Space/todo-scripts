# Testing

Two suites with separate configs and separate lifecycles. This file is **descriptive** — the
rules you must follow when adding a test live in [CLAUDE.md](../CLAUDE.md).

## Unit tests

[`vitest.config.ts`](../vitest.config.ts), files directly under [`tests/`](../tests), run by
`pnpm test`. Everything is mocked: `node:fs`, `execa`, `@/utils`, `yocto-spinner`. Nothing
touches the real filesystem or forks a process.

- `constants.test.ts` / `utils.test.ts` / `linter.test.ts` / `package-manager.test.ts` cover the
  shared primitives.
- `main.test.ts` / `commitlint-init.test.ts` / `commitlint-init-plan.test.ts` cover CLI dispatch
  and `init()` orchestration.
- `prompt.test.ts` covers the interactive prompt with `@clack/prompts` mocked.

This config **excludes `tests/e2e/**`**, which is what keeps the pre-commit hook fast.

## E2E tests

[`vitest.e2e.config.ts`](../vitest.e2e.config.ts), files matching `tests/e2e/**/*.e2e.test.ts`,
run by `pnpm test:e2e`. These really build `dist/` (via `globalSetup`), really fork
`node bin/index.js`, and assert on files written into a real temp project. Kept out of
`pnpm test` on purpose and wired into `build:prod` instead, so they gate releases without
slowing commits.

### How the fixtures work

`hasDependency()` only needs `node_modules/<pkg>/` to exist plus a declaration in
`package.json`, so `useFixture({ linters: ['biome'] })` fakes the "installed" state in
milliseconds instead of installing anything. If any of the four base packages is missing from a
fixture, the CLI runs a real networked `npm install` — `createFixture` refuses that unless
`E2E_ALLOW_INSTALL=1`. `--czgit` needs `czgit: true` for the same reason (it pulls in
`commitizen` + `cz-git`).

husky is the exception: it is copied for real, because `init()` runs `husky init` without
`allowFailure` and a stub would fail the run.

The child's environment is an allowlist (`tests/e2e/helpers/cli.ts`), not the ambient one.
`npm_config_local_prefix`, `GIT_DIR`, `HUSKY=0`, or a global linter on `PATH` would each
silently invalidate the assertions rather than failing loudly.

### The message table

`tests/e2e/helpers/constants.ts` holds the expected output as literals: `MESSAGES` for fixed
lines, `MESSAGE_FOR.*(arg)` builders for the ones embedding a filename or value, `PKG_FIELD` for
how a config living in a `package.json` field gets named.

The reason this table exists, from HB-31: `already exists` on its own appears both when a config
file is kept *and* when a hook is appended to, and on a re-run the hooks say
`already runs our command` instead — so the single assertion that was supposed to pin idempotency
covered neither hook. A fragment match is not an assertion about a branch.

### Environment switches

| Variable | Effect |
|:--|:--|
| `E2E_ALLOW_INSTALL=1` | permit a fixture that would trigger a real `npm install` |
| `E2E_SKIP_PTY=1` | force the interactive-prompt cases to skip |
| `E2E_KEEP=1` | always keep the fixture directory (on failure it is kept anyway, and its path printed) |
| `E2E_SKIP_BUILD=1` | reuse the existing `dist/` for faster iteration |

Interactive prompt cases need a pty, provided by `tests/e2e/helpers/pty-driver.py` (stdlib
python3, no dependency). They skip with a printed reason where python3 is unavailable or on
Windows. macOS's `script(1)` is not usable here — it fails when its own stdin is a pipe.

### Deliberately not covered by E2E

`--clear` (really uninstalls, network-dependent) and the missing-`package.json` error path
(unreachable — without a manifest the install step runs first and npm creates one). Both are
covered by unit tests.
