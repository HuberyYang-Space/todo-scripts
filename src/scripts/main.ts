import type { Script } from '@/registry'
import type { ArgvOptions } from '@/utils'
import process from 'node:process'
import mri from 'mri'
import colors from 'picocolors'
import spinner from 'yocto-spinner'
import { DEFAULT_PKG_NAME } from '@/constants'
import { MSG, MSG_FOR } from '@/constants/messages'
import { collectFlagNames, findScript, GLOBAL_FLAGS, renderHelp, renderScriptHelp, SCRIPTS } from '@/registry'
import { banner, getCliVersion, ScriptError } from '@/utils'
import { createPackageManager } from '@/utils/package-manager'

export { MSG_FOR } from '@/constants/messages'
/**
 * 转出给 bin/index.js 使用
 *
 * bin 不能直接从 '@/utils' 或 '@/constants/messages' 导入：tsdown 会把共享代码
 * 打进一个带 hash 的 chunk，文件名每次构建都可能变。dist/main.js 是唯一稳定的
 * 入口，所以由它把这些转出去。
 */
export { printErr, ScriptError } from '@/utils'

const { bold, green } = colors

/**
 * 从 registry 构建 mri 的解析配置
 *
 * 每个参数都必须提前声明 —— 漏进 `string` 列表的那个，一旦有人写了个光秃秃的
 * `--flag` 就会被强转成布尔值。从 registry 派生这些列表，意味着在 Script 上声明
 * 一个参数就够了，没有第二份解析器配置要手工同步。这里把所有子命令的参数汇到
 * 一起，是因为解析发生在我们知道用户要跑哪个子命令之前。某个参数对实际调用的
 * 命令合不合法，由 findUnknownFlags 单独检查。
 */
function buildParserConfig() {
  const all = [...GLOBAL_FLAGS, ...SCRIPTS.flatMap(script => script.flags ?? [])]
  const alias: Record<string, string> = {}
  for (const flag of all) {
    if (flag.alias)
      alias[flag.alias] = flag.name
  }

  return {
    boolean: all.filter(flag => flag.type === 'boolean').map(flag => flag.name),
    string: all.filter(flag => flag.type === 'string').map(flag => flag.name),
    alias,
  }
}

/** 用户敲了、但当前这个子命令并不接受的参数 */
function findUnknownFlags(options: object, script: Script): string[] {
  const known = collectFlagNames([...GLOBAL_FLAGS, ...(script.flags ?? [])])
  return Object.keys(options).filter(key => key !== '_' && !known.has(key))
}

export async function main() {
  banner()
  // 从 argv[2] 开始解析，这样 `hubery --help` 和 `hubery <script> --help` 都能用
  const options = mri<ArgvOptions>(process.argv.slice(2), buildParserConfig())

  const script = findScript(options._[0])

  if (options.version) {
    console.log(getCliVersion())
    return false
  }

  // 在「没指定脚本」的报错之前处理，这样 `hubery --help` 仍然可用
  if (options.help) {
    console.log(script ? renderScriptHelp(script) : renderHelp())
    return false
  }

  if (!script)
    throw new ScriptError(MSG.noScript)

  // mri 会静默吞掉任何没告诉过它的参数，所以像 --czgti 这样的拼写错误，
  // 不管的话就会按默认行为把脚本跑完，一句提示都没有
  const unknown = findUnknownFlags(options, script)
  if (unknown.length) {
    const list = unknown.map(flag => `--${flag}`).join(', ')
    throw new ScriptError(MSG_FOR.unknownOption(list, script.name))
  }

  const { init } = await script.load()
  const startTime = Date.now()
  console.log(`⚡️ ${bold(green(MSG.processStart))}\n`)

  await init(options)

  const endTime = Date.now()
  const elapsedTime = ((endTime - startTime) / 1000).toFixed(1)
  console.log(`\n✨ ${green(bold(MSG_FOR.processDone(elapsedTime)))}\n`)
  // 看看要不要卸载自己
  if (options.clear) {
    await createPackageManager().uninstall(DEFAULT_PKG_NAME)
    spinner().success(MSG.clearDone)
  }
}
