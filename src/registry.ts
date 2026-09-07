import type { ArgvOptions } from '@/utils'
import { green } from 'picocolors'

export interface FlagSpec {
  /** 长写法，就是敲进去的样子去掉开头的 `--` */
  name: string
  type: 'boolean' | 'string'
  /** 单字母写法，去掉开头的 `-` */
  alias?: string
  /** 帮助文本里渲染的取值占位符，例如 `<eslint|biome>` */
  placeholder?: string
  /** 帮助文本里显示的一行说明 */
  summary: string
}

export interface Script {
  /** 子命令名，就是用户在命令行敲的那个词 */
  name: string
  /** 帮助文本里显示的一行说明 */
  summary: string
  /** 这个子命令在 GLOBAL_FLAGS 之外还接受的参数 */
  flags?: FlagSpec[]
  /** 惰性加载脚本实现 */
  load: () => Promise<{ init: (options: ArgvOptions) => Promise<void> }>
}

/**
 * 不管跑哪个子命令都接受的参数
 *
 * 它们在 main.ts 里处理，不在任何脚本内部。
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
 * 所有可用子命令的唯一事实来源
 *
 * 加一个新脚本只需要在这里追加一项 —— 帮助文本由它渲染、分发靠它查找、
 * argv 解析器从 `flags` 派生出 boolean/string 列表，没有第二份清单要手工同步
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

/** 一组参数所有能被敲出来的写法 —— 长写法加别名 */
export function collectFlagNames(flags: FlagSpec[]): Set<string> {
  const names = new Set<string>()
  for (const flag of flags) {
    names.add(flag.name)
    if (flag.alias)
      names.add(flag.alias)
  }
  return names
}

/** `-h, --linter=<...>` 这种标签，右侧补空格让描述对齐 */
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
 * 渲染顶层帮助文本
 *
 * 可用指令一节由 SCRIPTS 派生，不会和实际支持的指令走散。各指令自己的参数
 * 刻意放在 `renderScriptHelp` 里 —— 一旦指令多于一个，把所有子命令的参数
 * 都堆在这里会让它没法读。
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

/** 渲染单个子命令的帮助文本，含全局参数 */
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
