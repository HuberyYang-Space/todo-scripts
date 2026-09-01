<h1 align="center">🔥 todo-scripts</h1>

<div align="center">
  <a href="./README.md">中文</a> | <b>English</b>
</div>

<br/>

<div align="center">
  <a href="https://github.com/HuberyYang-Space/todo-scripts"><img src="https://img.shields.io/github/package-json/v/HuberyYang-Space/todo-scripts?style=flat-square&label=%20&color=%23000" alt="github version"></a>
  <a href="https://github.com/HuberyYang-Space/todo-scripts"><img src="https://img.shields.io/static/v1?label=%F0%9F%8C%9F&message=If%20Useful&style=flat-square&color=BC4E99" alt="star badge"/></a>
  <a href="https://opensource.org/license/MIT"><img src="https://img.shields.io/npm/l/express?style=flat-square" alt="license"/></a>
</div>

### 💡 Overview

A collection of utility scripts to simplify frontend project configuration.

### ✨ Why todo-scripts

Every time you start a new frontend project, you have to repeat the same steps:

- Install commitlint, husky, and lint-staged
- Write config files by hand
- Trip over husky initialization quirks

todo-scripts packs all of this into a single command — run `commitlint-init` and you're done.
Supports `--czgit` for quick cz-git integration and `--clear` to uninstall dependencies after setup.

### 🎬 Demo

<div align="center">
  <img src="https://raw.githubusercontent.com/HuberyYang-Space/todo-scripts/dev/src/assets/demo.gif" alt="commitlint-init demo" width="700" />
</div>

### 📦 Install

```shell
# npm
npm install --save-dev @huberyyang/todo-scripts
# pnpm
pnpm add --save-dev @huberyyang/todo-scripts
# yarn
yarn add --dev @huberyyang/todo-scripts
# bun
bun add --dev @huberyyang/todo-scripts
```

For **monorepo** projects, install to the workspace root:

```shell
# pnpm
pnpm add -wD @huberyyang/todo-scripts
# yarn
yarn add -W --dev @huberyyang/todo-scripts
# npm
npm install --save-dev @huberyyang/todo-scripts
# bun
bun add --dev @huberyyang/todo-scripts
```

### 🔌 Available Scripts

- `commitlint-init`

### 🟢 commitlint-init

🚀 Set up [commitlint](https://github.com/conventional-changelog/commitlint) + [husky](https://github.com/typicode/husky) + [lint-staged](https://github.com/lint-staged/lint-staged) with a single command — no more tedious manual configuration.

#### ⚡️ Usage

```shell
# npm
npx hubery commitlint-init
# pnpm
pnpm exec hubery commitlint-init
# yarn
yarn hubery commitlint-init
# bun
bunx hubery commitlint-init
```

#### ⚙️ Options

Global options (accepted by every command):

- `-h, --help` Show help. `hubery --help` lists the commands; `hubery <command> --help` shows that command's own options
- `-v, --version` Show version
- `--clear` Clean run — uninstall the module after execution

`commitlint-init` options:

- `--czgit` Configure [cz-git](https://github.com/Zhengqbbb/cz-git) support
- `--linter=<eslint|biome|oxlint|none>` Specify which linter drives lint-staged, skipping auto-detection and the prompt
- `--dry-run` Print what would change without writing anything. Worth running first against an existing project
- `--force` Overwrite the config files and hooks this tool generates. Same filename only — if your config lives under a different name (say `.commitlintrc.json`), it will not write a second, competing config beside it

> [!NOTE]
> A mistyped option fails loudly instead of being silently ignored.
>
> Re-running against an already-configured project is safe: existing config files are skipped (and you are told which one got in the way), existing git hooks get our command **appended** rather than replacing your content, and an existing commitizen setup is never deleted. If a run fails partway through, the files already written are rolled back rather than left behind.

#### 🎉 Test

> [!NOTE]
> The detected linter (ESLint / Biome / Oxlint) runs automatically before every commit. To change the pre-commit hook command, edit **lint-staged.config.mjs**.

```shell
git add .
git commit -m "test commitlint"
```

#### ✨ Smart Features

`commitlint-init` has several built-in auto-detection capabilities — just run it without worrying about your environment.

**📦 Auto-detect Package Manager**
Automatically detects the package manager you are using (npm / pnpm / yarn / bun) and calls the corresponding install and exec commands — no manual selection needed.

| Package Manager | Install Example | Exec Example |
| --------------- | --------------- | ------------ |
| npm  | `npm install --save-dev` | `npx` |
| pnpm | `pnpm add -D` | `pnpm exec` |
| yarn | `yarn add --dev` | `yarn` |
| bun  | `bun add --dev` | `bunx` |

**🔷 Auto-detect TypeScript Projects**
Detects whether the project uses TypeScript and generates config files in the matching format — no extra steps required.

**🗂️ Auto-detect Monorepo Projects**
Detects monorepo setups and automatically appends the workspace flag for each package manager, ensuring dependencies are installed in the right place.

| Package Manager | Monorepo Install Flag |
| --------------- | --------------------- |
| pnpm | `-w` |
| yarn | `-W` |
| npm / bun | No extra flag needed |

**🔀 Auto-initialize Git**
If `git init` has not been run in the current directory (no `.git` folder), the script initializes a Git repository automatically so husky hooks can be registered properly.

**🔍 Auto-integrate the project's installed linter**
The script detects whichever of ESLint, Biome, or Oxlint is installed in the project (present in `node_modules` and declared in `package.json`), then runs a lint fix pass with that tool on the generated config files to ensure they match the project's code style — ready to commit immediately.

#### 📁 Generated Files

After running the script, the following files are added or modified in your project:

```
your-project/
├── .husky/
│   ├── pre-commit          # Runs lint-staged before every commit
│   └── commit-msg          # Validates commit message format
├── commitlint.config.ts    # commitlint config (or .js for JS projects)
├── lint-staged.config.mjs  # lint-staged rules (always .mjs, unaffected by the project's type field)
└── package.json            # commitlint script added
```

New additions to `package.json`:

```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  }
}
```

The script auto-detects whether the project has ESLint, Biome, or Oxlint installed and generates the matching `lint-staged.config.mjs` rule. If none is detected, an interactive terminal will prompt you to pick one (or skip and configure it yourself); a non-interactive environment (CI, piped input, etc.) skips the prompt and prints a warning instead. You can also pass `--linter=<eslint|biome|oxlint|none>` to bypass detection and the prompt entirely.

Assuming ESLint is detected, the content of `lint-staged.config.mjs`:

```js
export default {
  '*': 'eslint --fix --no-error-on-unmatched-pattern',
}
```

Extra entries added when using `--czgit`:

```json
{
  "scripts": {
    "cz": "git cz"
  },
  "config": {
    "commitizen": {
      "path": "node_modules/cz-git"
    }
  }
}
```

#### 🔄 Workflow After Setup

```shell
# Normal commit — commitlint validates the message, lint-staged auto-fixes code
git add .
git commit -m "feat: add new feature"

# Interactive commit with cz-git (requires --czgit at init time)
git add .
pnpm cz   # or: npm run cz / yarn cz / bun run cz
```

> [!TIP]
> Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) spec: `type: subject`, e.g. `feat: add login page`, `fix: button style`.

---

### 📜 License

MIT License © 2026 [Hubery Yang](https://github.com/Hub-yang)
