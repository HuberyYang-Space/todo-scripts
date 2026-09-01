import type { Script } from '@/registry'
import type { ArgvOptions } from '@/utils'
import process from 'node:process'
import mri from 'mri'
import colors from 'picocolors'
import spinner from 'yocto-spinner'
import { DEFAULT_PKG_NAME } from '@/constants'
import { collectFlagNames, findScript, GLOBAL_FLAGS, renderHelp, renderScriptHelp, SCRIPTS } from '@/registry'
import { banner, ScriptError } from '@/utils'
import { createPackageManager } from '@/utils/package-manager'

/**
 * Re-exported for bin/index.js to consume
 *
 * The bin can't import from '@/utils' directly: tsdown bundles shared code into
 * a hashed chunk (e.g. dist/constants-CaIpLqQE.js) whose filename can change on
 * every build. dist/main.js is the only stable entry point, so it re-exports these.
 */
export { printErr, ScriptError } from '@/utils'

const { bold, green } = colors

/**
 * Builds mri's config from the registry
 *
 * Every flag has to be declared up front — one left out of `string` gets coerced
 * to a boolean the moment someone writes a bare `--flag`. Deriving the lists from
 * the registry means declaring a flag on a Script is enough, with no parser config
 * to keep in sync by hand. All subcommands' flags are pooled here because parsing
 * happens before we know which subcommand was asked for. Whether a flag is valid
 * for the command actually invoked is checked separately, in findUnknownFlags.
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

/** Flags the user typed that this particular subcommand does not accept */
function findUnknownFlags(options: object, script: Script): string[] {
  const known = collectFlagNames([...GLOBAL_FLAGS, ...(script.flags ?? [])])
  return Object.keys(options).filter(key => key !== '_' && !known.has(key))
}

export async function main() {
  banner()
  // Parses starting from argv[2], so both `hubery --help` and `hubery <script> --help` work
  const options = mri<ArgvOptions>(process.argv.slice(2), buildParserConfig())

  const script = findScript(options._[0])

  // Resolved before the missing-script error, so `hubery --help` still works
  if (options.help) {
    console.log(script ? renderScriptHelp(script) : renderHelp())
    return false
  }

  if (!script)
    throw new ScriptError('Please use a script.')

  // mri silently swallows anything it wasn't told about, so a typo like --czgti
  // would otherwise run the script with default behaviour and no warning
  const unknown = findUnknownFlags(options, script)
  if (unknown.length) {
    const list = unknown.map(flag => `--${flag}`).join(', ')
    throw new ScriptError(`Unknown option${unknown.length > 1 ? 's' : ''}: ${list}. Run \`hubery ${script.name} --help\` to see what is supported.`)
  }

  const { init } = await script.load()
  const startTime = Date.now()
  console.log(`⚡️ ${bold(green('Process Start'))}\n`)

  await init(options)

  const endTime = Date.now()
  const elapsedTime = ((endTime - startTime) / 1000).toFixed(1)
  console.log(`\n✨ ${green(bold('Process Down')) + bold(` in ${elapsedTime}s`)}\n`)
  // Check whether to uninstall
  if (options.clear) {
    await createPackageManager().uninstall(DEFAULT_PKG_NAME)
    spinner().success(`clear down!`)
  }
}
