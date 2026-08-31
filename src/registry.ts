import type { ArgvOptions } from '@/utils'
import { green } from 'picocolors'

export interface Script {
  /** Subcommand name, exactly what the user types on the command line */
  name: string
  /** One-line description shown in help text */
  summary: string
  summaryEn: string
  /** Lazily loads the script implementation */
  load: () => Promise<{ init: (options: ArgvOptions) => Promise<void> }>
}

/**
 * The single source of truth for all available subcommands
 *
 * Adding a new script only requires appending an entry here — help text
 * renders from it and dispatch looks it up too, so there's no second
 * list to keep in sync by hand
 */
export const SCRIPTS: Script[] = [
  {
    name: 'commitlint-init',
    summary: '一键生成 commitlint + husky + lint-staged 配置',
    summaryEn: 'Scaffold commitlint + husky + lint-staged config in one command',
    load: () => import('./scripts/commitlint-init'),
  },
]

export function findScript(name: string | undefined): Script | undefined {
  return SCRIPTS.find(script => script.name === name)
}

/**
 * Renders the help text
 *
 * The available-commands section derives from SCRIPTS, so it can't drift from what's actually supported
 */
export function renderHelp(): string {
  const commands = SCRIPTS
    .map(({ name, summary, summaryEn }) => `  ${green(name)}\n      ${summary}\n      ${summaryEn}`)
    .join('\n')

  return `\
一些帮助简化前端配置工程的通用脚本
Utility scripts to simplify frontend project configuration

用法 / Usage: hubery <script> [参数/options]...

可用指令 / Available commands:
${commands}

参数 / Options:
  -h, --help                            查看帮助 / show help
  --clear                               清洁执行 - 执行完脚本后卸载模块 / uninstall the module after running
  --czgit                               配置 cz-git / enable cz-git
  --linter=<eslint|biome|oxlint|none>   指定 lint-staged 检查工具，跳过自动探测和交互询问 / specify the linter for lint-staged, skipping auto-detect and the prompt
`
}
