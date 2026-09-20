# Architecture

How the pieces fit together. This file is **descriptive** — the rules you must not break
live in [CLAUDE.md](../CLAUDE.md) and are deliberately not duplicated here.

## What this is

`@huberyyang/todo-scripts` is a CLI tool (bin name `hubery`) that scaffolds repetitive
frontend project config into other repos. Published to npm, consumed as a devDependency and
invoked as `npx hubery <script>`. It is bin-only — no library API, no `types`/`exports` field
in [`package.json`](../package.json).

Currently the only implemented subcommand is `commitlint-init`, which wires up commitlint +
husky + lint-staged (optionally commitizen/cz-git) in whatever project it's run from.

## Entry flow

[`bin/index.js`](../bin/index.js) is the real entrypoint — it imports the built `dist/main.js`
and explicitly calls the exported `main()`. [`src/scripts/main.ts`](../src/scripts/main.ts) itself has no
top-level side effects (it only exports `main`); this split exists specifically so `main.ts`
can be imported safely from tests without triggering a real CLI run.

`main()` parses argv with `mri` (from `argv.slice(2)`, so `hubery --help` and
`hubery <script> --help` both work), looks the subcommand up in the `SCRIPTS` registry in
[`src/registry.ts`](../src/registry.ts) via `findScript`, and calls the matching entry's
`load()` — a dynamic `import()` — then its exported `init(options)`.

## Flags are declared as data, not spread across files

Each `Script` carries a `flags: FlagSpec[]`, and `GLOBAL_FLAGS` holds the ones every command
accepts. `buildParserConfig()` derives mri's `boolean`/`string`/`alias` lists from those specs.
`findUnknownFlags()` then rejects anything the invoked command does not declare.

Help is split — `renderHelp()` lists commands plus global flags, `renderScriptHelp(script)`
lists one command's own flags. Keeping per-command flags out of the top-level help is what
stops it becoming unreadable once there are several commands.

## Build layout (tsdown)

[`tsdown.config.ts`](../tsdown.config.ts) builds every file matching `src/scripts/**.ts` as a
separate entry (so `main.ts` → `dist/main.js`, `commitlint-init.ts` → `dist/commitlint-init.js`),
sharing a common chunk for anything imported from `src/constants` and `src/utils`.

One build detail worth knowing before writing any verification script against `dist/`: the
shared chunk's filename carries a hash *and* its prefix follows whichever entry rolldown
attributes it to (currently `package-manager-*.js`, not `constants-*.js`), and template
constants like `CONFIG_COMMITLINT_CZGIT` get **inlined into the consuming entry** rather than
re-exported from that chunk. [`tests/constants.test.ts`](../tests/constants.test.ts) evaluates
templates from the source module through a `data:` URL, which needs no filesystem.

## Shared layers

[`src/utils/index.ts`](../src/utils/index.ts) and
[`src/constants/index.ts`](../src/constants/index.ts) provide the primitives every script
builds on:

- [`src/utils/package-manager.ts`](../src/utils/package-manager.ts) keeps every
  npm/pnpm/yarn/bun/deno difference in one `SPECS` table. `getPkgManager()` reads
  `npm_config_user_agent` (unrecognized → npm), and `createPackageManager()` resolves the
  manager and the monorepo check **once**, returning `ensureInstalled`/`uninstall`/`exec`/
  `formatExec`. `ensureInstalled` is a complete no-op when every requested package already
  satisfies `hasDependency`.
- [`src/utils/linter.ts`](../src/utils/linter.ts) follows the same table-driven shape for
  ESLint/Biome/Oxlint: `detectLinter()` returns the first installed one in priority order
  (eslint > biome > oxlint), and `renderLintStagedConfig()`/`getFixCommand()` render the
  per-linter commands.
- `hasDependency(pkg)` requires **both** that `node_modules/<pkg>` exists and that
  `package.json` declares it — either alone gives false positives (hoisted transitives) or
  false negatives (declared but uninstalled).
- `isMonorepo()` checks package.json's `workspaces` field first, then falls back to actually
  parsing `pnpm-workspace.yaml` (via the `yaml` package) and checking for a non-empty
  `packages` array — merely having a `pnpm-workspace.yaml` file (e.g. one used only for pnpm
  settings, like this repo's own) is not treated as a monorepo.
- `isTsProject()` scans the invoking project's root dir for any `tsconfig*.json`.
  `isInteractive()` is `stdin.isTTY && !process.env.CI` — both halves matter, and it is what
  gates the interactive prompt.
- `getPackageJSON()`/`writePackageJSON()` read/rewrite the invoking project's `package.json`
  wholesale (`JSON.stringify(data, null, 2)`), typed via the `PackageJsonLike` interface (also
  exported from this module).
- [`src/utils/prompt.ts`](../src/utils/prompt.ts) is the only file that imports
  `@clack/prompts`, so the dependency stays swappable and trivially mockable.
- [`src/constants/messages.ts`](../src/constants/messages.ts) is the single source for every
  string a user reads, and imports nothing. `MSG` holds fixed copy, `MSG_FOR` holds functions
  for the ones embedding a filename or value — written as functions so a call site has to hand
  over the variable, which stops a message and its argument from drifting apart. The point is
  that the planned switch back to English costs one file rather than a sweep.
  [`bin/index.js`](../bin/index.js) is plain JS with no `~/` alias, so the copy it needs
  (`MSG_FOR.causedBy`) reaches it through `dist/main.js`'s re-export, the same path
  `printErr`/`ScriptError` already take.

## `commitlint-init.ts`: the reference script

[`src/scripts/commitlint-init.ts`](../src/scripts/commitlint-init.ts) is the reference
implementation for what a script does end-to-end. It splits cleanly into a **pure decision
layer** and a **side-effecting layer**.

- `planSetup`, `patchPackageJSON`, `resolveHookContent`, `findExistingConfig`, `detectHuskyV4`
  and `surveyProject` are all pure — no filesystem, no subprocesses. Everything they need
  arrives through arguments.
- `surveyProject(plan, env)` is where every decision is made: what needs writing, what gets
  skipped and why, what each hook should end up containing, whether leftover husky v4 config is
  lying around. Keeping the decisions here rather than inline among the writes is what makes
  them testable without a filesystem, and gives a future `doctor` one place to reuse.
- `init()` sets up the survey and the rollback journal, then hands off to `runSetup()` for the
  side effects, in order: `git init` if needed, `ensureInstalled`, write the commitlint config,
  write the lint-staged config, `husky init` → write the hooks, rewrite `package.json`, then run
  the resolved linter's fix command with `allowFailure: true`. `resolveLinterChoice()`
  (flag → auto-detect → prompt → non-interactive fallback) resolves **before** `planSetup`, so
  the pure layer stays pure.
- `createFileJournal(io)` is the undo log. Every write is preceded by a `capture()`, and any
  thrown error triggers `rollback()` before rethrowing — a failure partway through used to leave
  the project half-configured. It deliberately does **not** undo the dependency install
  (uninstalling could remove packages the project already wanted) or `git init`. Its IO is
  injected, so it is unit-tested without touching a real filesystem.

Re-running against an already-configured project never clobbers it, but the two halves behave
differently: **config files are skipped**, **hooks are appended to**. The rules that keep both
halves correct are in [CLAUDE.md](../CLAUDE.md).
