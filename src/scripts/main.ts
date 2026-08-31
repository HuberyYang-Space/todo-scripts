import type { ArgvOptions } from '@/utils'
import process from 'node:process'
import mri from 'mri'
import colors from 'picocolors'
import spinner from 'yocto-spinner'
import { DEFAULT_PKG_NAME } from '@/constants'
import { findScript, renderHelp } from '@/registry'
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

export async function main() {
  banner()
  // Parses starting from argv[2], so both `hubery --help` and `hubery <script> --help` work
  const options = mri<ArgvOptions>(process.argv.slice(2), {
    boolean: ['clear', 'czgit', 'help'],
    string: ['linter'],
    alias: { h: 'help' },
  })

  if (options.help) {
    console.log(renderHelp())
    return false
  }

  const script = findScript(options._[0])
  if (!script)
    throw new ScriptError('Please use a script.')

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
