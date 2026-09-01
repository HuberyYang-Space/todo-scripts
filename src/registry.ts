import type { ArgvOptions } from '@/utils'
import { green } from 'picocolors'

export interface FlagSpec {
  /** Long form, exactly as typed minus the leading `--` */
  name: string
  type: 'boolean' | 'string'
  /** Single-letter form, minus the leading `-` */
  alias?: string
  /** Value placeholder rendered in help, e.g. `<eslint|biome>` */
  placeholder?: string
  /** One-line description shown in help text */
  summary: string
  summaryEn: string
}

export interface Script {
  /** Subcommand name, exactly what the user types on the command line */
  name: string
  /** One-line description shown in help text */
  summary: string
  summaryEn: string
  /** Flags this subcommand accepts, on top of GLOBAL_FLAGS */
  flags?: FlagSpec[]
  /** Lazily loads the script implementation */
  load: () => Promise<{ init: (options: ArgvOptions) => Promise<void> }>
}

/**
 * Flags accepted regardless of which subcommand runs
 *
 * These are handled in main.ts, not inside any script.
 */
export const GLOBAL_FLAGS: FlagSpec[] = [
  {
    name: 'help',
    type: 'boolean',
    alias: 'h',
    summary: '查看帮助',
    summaryEn: 'show help',
  },
  {
    name: 'clear',
    type: 'boolean',
    summary: '清洁执行 - 执行完脚本后卸载模块',
    summaryEn: 'uninstall the module after running',
  },
]

/**
 * The single source of truth for all available subcommands
 *
 * Adding a new script only requires appending an entry here — help text renders
 * from it, dispatch looks it up, and the argv parser derives its boolean/string
 * lists from `flags`, so there's no second list to keep in sync by hand
 */
export const SCRIPTS: Script[] = [
  {
    name: 'commitlint-init',
    summary: '一键生成 commitlint + husky + lint-staged 配置',
    summaryEn: 'Scaffold commitlint + husky + lint-staged config in one command',
    flags: [
      {
        name: 'czgit',
        type: 'boolean',
        summary: '配置 cz-git',
        summaryEn: 'enable cz-git',
      },
      {
        name: 'dry-run',
        type: 'boolean',
        summary: '只打印将要做的改动，不实际写入任何文件',
        summaryEn: 'print what would change without writing anything',
      },
      {
        name: 'force',
        type: 'boolean',
        summary: '覆盖重写本工具生成的配置文件与钩子（仅覆盖同名文件）',
        summaryEn: 'overwrite the config files and hooks this tool generates (same filename only)',
      },
      {
        name: 'linter',
        type: 'string',
        placeholder: '<eslint|biome|oxlint|none>',
        summary: '指定 lint-staged 检查工具，跳过自动探测和交互询问',
        summaryEn: 'specify the linter for lint-staged, skipping auto-detect and the prompt',
      },
    ],
    load: () => import('./scripts/commitlint-init'),
  },
]

export function findScript(name: string | undefined): Script | undefined {
  return SCRIPTS.find(script => script.name === name)
}

/** Every spelling a set of flags can be typed as — long forms plus aliases */
export function collectFlagNames(flags: FlagSpec[]): Set<string> {
  const names = new Set<string>()
  for (const flag of flags) {
    names.add(flag.name)
    if (flag.alias)
      names.add(flag.alias)
  }
  return names
}

/** `-h, --linter=<...>` style label, padded so descriptions line up */
function renderFlagLines(flags: FlagSpec[]): string {
  return flags
    .map((flag) => {
      const short = flag.alias ? `-${flag.alias}, ` : ''
      const value = flag.placeholder ? `=${flag.placeholder}` : ''
      return `  ${`${short}--${flag.name}${value}`.padEnd(38)}${flag.summary} / ${flag.summaryEn}`
    })
    .join('\n')
}

/**
 * Renders the top-level help text
 *
 * The available-commands section derives from SCRIPTS, so it can't drift from
 * what's actually supported. Per-command flags deliberately live in
 * `renderScriptHelp` instead — listing every subcommand's flags here would make
 * this unreadable as soon as there is more than one command.
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

全局参数 / Global options:
${renderFlagLines(GLOBAL_FLAGS)}

查看某个指令自己的参数 / See a command's own options:
  hubery <script> --help
`
}

/** Renders the help text for one subcommand, including the global flags */
export function renderScriptHelp(script: Script): string {
  const own = script.flags?.length
    ? `参数 / Options:\n${renderFlagLines(script.flags)}\n\n`
    : ''

  return `\
${green(script.name)}
  ${script.summary}
  ${script.summaryEn}

用法 / Usage: hubery ${script.name} [参数/options]...

${own}全局参数 / Global options:
${renderFlagLines(GLOBAL_FLAGS)}
`
}
