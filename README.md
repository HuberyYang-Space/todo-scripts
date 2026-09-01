<h1 align="center">🔥 todo-scripts</h1>

<div align="center">
  <b>中文</b> | <a href="./README.en.md">English</a>
</div>

<br/>

<div align="center">
  <a href="https://github.com/HuberyYang-Space/todo-scripts"><img src="https://img.shields.io/github/package-json/v/HuberyYang-Space/todo-scripts?style=flat-square&label=%20&color=%23000" alt="github version"></a>
  <a href="https://github.com/HuberyYang-Space/todo-scripts"><img src="https://img.shields.io/static/v1?label=%F0%9F%8C%9F&message=If%20Useful&style=flat-square&color=BC4E99" alt="star badge"/></a>
  <a href="https://opensource.org/license/MIT"><img src="https://img.shields.io/npm/l/express?style=flat-square" alt="license"/></a>
</div>

### 💡 说明

一些帮助简化前端配置工程的通用脚本

### ✨ 为什么选择 todo-scripts

每次新建前端项目，都要重复一遍：

- 装 commitlint、husky、lint-staged
- 手写配置文件
- 踩一遍 husky 初始化的坑

todo-scripts 把这些打包成一条命令，`commitlint-init` 执行完就全搞定，
支持 `--czgit` 快速集成 cz-git，支持 `--clear` 用完即走不留依赖

### 🎬 演示

<div align="center">
  <img src="https://raw.githubusercontent.com/HuberyYang-Space/todo-scripts/dev/src/assets/demo.gif" alt="commitlint-init demo" width="700" />
</div>

### 📦 安装

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

如果你的项目是 **monorepo**，使用以下命令安装到工作区根目录：

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

### 🔌 当前可用指令

- `commitlint-init`

### 🟢 commitlint-init

🚀 一条命令搞定 [commitlint](https://github.com/conventional-changelog/commitlint) + [husky](https://github.com/typicode/husky) + [lint-staged](https://github.com/lint-staged/lint-staged) 配置，告别繁琐的手动配置

#### ⚡️ 执行

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

#### ⚙️ 参数说明

全局参数（任何指令都可用）：

- `-h, --help` 查看帮助。`hubery --help` 列出所有指令，`hubery <指令> --help` 查看该指令自己的参数
- `-v, --version` 查看版本号
- `--clear` 清洁执行 - 执行完脚本后卸载模块

`commitlint-init` 的参数：

- `--czgit` 配置[cz-git](https://github.com/Zhengqbbb/cz-git)支持
- `--linter=<eslint|biome|oxlint|none>` 指定 lint-staged 使用的检查工具，跳过自动探测和交互询问

> [!NOTE]
> 拼错的参数会直接报错退出，不会被静默忽略。

#### 🛡️ 在已有项目上运行

**重复运行是安全的，你不需要为此传任何参数。** 工具的行为如下：

- **已有的配置会被沿用。** 会扫描 commitlint 与 lint-staged 的全部配置文件名（`.commitlintrc*`、`commitlint.config.*`、`.lintstagedrc*`、`lint-staged.config.*`，以及 `package.json` 里的对应字段），只要发现任意一份就跳过生成，并在终端告诉你是哪一份——不会写出第二份互相打架的配置。
- **已有的 git 钩子会被追加，而不是覆盖。** 如果 `.husky/pre-commit` 里已经有你自己的命令，工具会在末尾追加一行，你原有的内容原样保留。已经包含该命令时不会重复追加。
- **已有的 commitizen 配置不会被删除。** 不传 `--czgit` 只表示「这次不配置 cz-git」，不会动你已有的设置。
- **中途失败会回滚。** 任何一步出错时，本次已写入的文件会被撤销，不会留下「装了依赖却没有配置」的半成品。依赖安装与 `git init` 不回滚。
- **发现 husky v4 残留会提示。** `.huskyrc*` 这类旧配置 husky 9 已不再读取，工具会告诉你哪些钩子其实没在跑。

需要重新生成某份配置时，删掉对应文件再运行一次即可。

#### 🎉 测试

> [!NOTE]
> 已探测到的 linter（ESLint / Biome / Oxlint）会在每次执行 commit 前自动执行，如需更改 commit 钩子执行前的命令，可自行修改 **lint-staged.config.mjs**

```shell
git add .
git commit -m "test commitlint"
```

#### ✨ 智能特性

`commitlint-init` 内置多项自动检测能力，无需关心环境差异，直接运行即可

**📦 自动识别包管理器**
自动识别当前使用的包管理器（npm / pnpm / yarn / bun），并调用对应的安装、执行指令，无需手动指定

| 包管理器 | 安装指令示例 | 执行指令示例 |
| -------- | ------------ | ------------ |
| npm      | `npm install --save-dev` | `npx` |
| pnpm     | `pnpm add -D` | `pnpm exec` |
| yarn     | `yarn add --dev` | `yarn` |
| bun      | `bun add --dev` | `bunx` |

**🔷 自动识别 TypeScript 项目**
自动检测是否为 ts 项目，生成的配置文件格式与项目保持一致，无需额外处理

**🗂️ 自动识别 Monorepo 项目**
自动检测是否为 monorepo 项目，安装依赖时自动追加对应包管理器的工作区 flag，确保依赖安装到正确位置

| 包管理器 | Monorepo 安装 flag |
| -------- | ------------------ |
| pnpm     | `-w` |
| yarn     | `-W` |
| npm / bun | 无需额外 flag |

**🔀 自动初始化 Git**
若当前目录尚未执行过 `git init`（不存在 `.git` 目录），脚本会自动初始化 git 仓库，确保 husky hooks 能正常注册

**🔍 自动集成项目已安装的 linter**
脚本会探测项目已安装的 ESLint / Biome / Oxlint（`node_modules` 存在且 `package.json` 中声明了依赖），在生成配置文件后自动用探测到的工具对其执行 lint fix，确保生成的配置文件符合项目代码风格，直接提交即可

#### 📁 执行后生成的内容

脚本执行完成后，你的项目中会新增/修改以下内容：

```
your-project/
├── .husky/
│   ├── pre-commit          # 每次 commit 前自动运行 lint-staged
│   └── commit-msg          # 自动校验 commit message 格式
├── commitlint.config.ts    # commitlint 配置（JS 项目则为 .js）
├── lint-staged.config.mjs  # lint-staged 规则（固定 .mjs，不受项目 type 字段影响）
└── package.json            # 自动写入 commitlint 脚本
```

`package.json` 中新增的内容：

```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  }
}
```

脚本会自动探测项目已安装的 ESLint / Biome / Oxlint，生成对应的 `lint-staged.config.mjs` 规则；什么都探测不到时，交互式终端里会询问你想用哪一个（或者跳过自己配置），非交互环境（CI、管道输入等）下会直接跳过并给出提示。也可以用 `--linter=<eslint|biome|oxlint|none>` 显式指定，绕开探测和询问。

以探测到 ESLint 为例，`lint-staged.config.mjs` 的内容：

```js
export default {
  '*': 'eslint --fix --no-error-on-unmatched-pattern',
}
```

启用 `--czgit` 时额外写入：

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

#### 🔄 配置完成后的工作流

```shell
# 正常提交 - commitlint 自动校验 message 格式，lint-staged 自动 fix 代码
git add .
git commit -m "feat: add new feature"

# 使用 cz-git 交互式提交（需在初始化时传入 --czgit）
git add .
pnpm cz   # 或 npm run cz / yarn cz / bun run cz
```

> [!TIP]
> commit message 须符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范，格式为 `type: subject`，例如 `feat: 新增登录功能`、`fix: 修复按钮样式`

---

### 📜 许可证

MIT License © 2026 [Hubery Yang](https://github.com/Hub-yang)
