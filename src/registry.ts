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
}

export interface Script {
  /** Subcommand name, exactly what the user types on the command line */
  name: string
  /** One-line description shown in help text */
  summary: string
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
  },
  {
    name: 'version',
    type: 'boolean',
    alias: 'v',
    summary: '查看版本号',
  },
  {
    name: 'clear',
    type: 'boolean',
    summary: '清洁执行 - 执行完脚本后卸载模块',
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
    flags: [
      {
        name: 'czgit',
        type: 'boolean',
        summary: '配置 cz-git',
      },
      {
        name: 'linter',
        type: 'string',
        placeholder: '<eslint|biome|oxlint|none>',
        summary: '指定 lint-staged 检查工具，跳过自动探测和交互询问',
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
      return `  ${`${short}--${flag.name}${value}`.padEnd(38)}${flag.summary}`
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
    .map(({ name, summary }) => `  ${green(name)}\n      ${summary}`)
    .join('\n')

  return `\
一些帮助简化前端配置工程的通用脚本

用法：hubery <script> [参数]...

可用指令：
${commands}

全局参数：
${renderFlagLines(GLOBAL_FLAGS)}

查看某个指令自己的参数：
  hubery <script> --help
`
}

/** Renders the help text for one subcommand, including the global flags */
export function renderScriptHelp(script: Script): string {
  const own = script.flags?.length
    ? `参数：\n${renderFlagLines(script.flags)}\n\n`
    : ''

  return `\
${green(script.name)}
  ${script.summary}

用法：hubery ${script.name} [参数]...

${own}全局参数：
${renderFlagLines(GLOBAL_FLAGS)}
`
}
