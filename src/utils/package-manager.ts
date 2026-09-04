import process from 'node:process'
import yoctoSpinner from 'yocto-spinner'
import { MSG_FOR } from '@/constants/messages'
import { execCommand, hasDependency, isMonorepo, ScriptError } from '@/utils'

export interface PkgInfo {
  name: string
  version: string
}

export interface PackageManager {
  /** Package manager name, e.g. pnpm */
  readonly name: string
  /** Installs whichever of these packages aren't already installed; a no-op if all are */
  ensureInstalled: (pkgs: string[], options?: { dev?: boolean }) => Promise<void>
  /** Uninstalls a package */
  uninstall: (pkg: string) => Promise<void>
  /**
   * Runs a project-local bin, e.g. exec('husky init')
   *
   * allowFailure means the caller doesn't care whether this command succeeds
   * (e.g. trailing code formatting) — on failure it neither throws nor
   * interrupts the rest of the flow
   */
  exec: (command: string, options?: { allowFailure?: boolean }) => Promise<void>
  /** Renders a local-bin command as a string, for writing into shell scripts like husky hooks */
  formatExec: (command: string) => string
}

interface PkgManagerSpec {
  /** Install subcommand */
  add: string
  /** Flag for installing as a dev dependency */
  devFlag: string
  /** Uninstall subcommand */
  remove: string
  /** Flag for installing/removing at the monorepo root; left empty for unsupported package managers */
  rootFlag?: string
  /** How each manager spells running a local bin — varies enough that this is just a function */
  exec: (command: string) => string
}

/**
 * Every package manager's quirks live in this one table — callers don't need to know any of them
 *
 * The npm / pnpm / yarn entries have been verified by hand; bun / deno follow their
 * respective official docs but haven't been verified locally (bun's install hangs
 * on a restricted network).
 */
const SPECS: Record<string, PkgManagerSpec> = {
  npm: {
    add: 'install',
    devFlag: '--save-dev',
    remove: 'uninstall',
    // --no stops npx from installing over the network when it can't find the command
    // locally; the package involved (husky/eslint/commitlint) has already been confirmed
    // present locally by ensureInstalled/hasDependency by the time this runs, so it
    // doesn't change normal-path behavior — it just removes npx's fallback network-install
    // uncertainty
    exec: command => `npx --no -- ${command}`,
  },
  pnpm: {
    add: 'add',
    devFlag: '--save-dev',
    remove: 'remove',
    rootFlag: '-w',
    exec: command => `pnpm exec ${command}`,
  },
  yarn: {
    // yarn v1 explicitly rejects `yarn install <pkg>`, and its dev-dependency flag is --dev, not --save-dev
    add: 'add',
    devFlag: '--dev',
    remove: 'remove',
    rootFlag: '-W',
    exec: command => `yarn ${command}`,
  },
  bun: {
    add: 'add',
    devFlag: '--dev',
    remove: 'remove',
    exec: command => `bunx ${command}`,
  },
  deno: {
    add: 'add',
    devFlag: '--dev',
    remove: 'remove',
    // The npm: prefix attaches directly to the bin name, with no space in between
    exec: command => `deno run -A npm:${command}`,
  },
}

/**
 * get the current package manager from user agent
 * @returns {PkgInfo} package manager info, include name and version
 */
export function getPkgManager(): PkgInfo | undefined {
  const userAgent = process.env.npm_config_user_agent
  if (!userAgent) {
    return undefined
  }

  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

/**
 * Creates the package manager for the current project
 *
 * Both the package manager kind and the monorepo check resolve just once
 * here; every later call reuses the result instead of hitting the filesystem again
 */
export function createPackageManager(): PackageManager {
  const detected = getPkgManager()?.name ?? 'npm'
  // Any unrecognized package manager falls back to npm
  const name = detected in SPECS ? detected : 'npm'
  const spec = SPECS[name]
  const rootFlag = spec.rootFlag && isMonorepo() ? ` ${spec.rootFlag}` : ''

  return {
    name,

    formatExec(command) {
      return spec.exec(command)
    },

    async exec(command, options = {}) {
      const fullCommand = spec.exec(command)
      if (!options.allowFailure) {
        await execCommand(fullCommand)
        return
      }

      try {
        await execCommand(fullCommand)
      }
      catch {
        // The caller has declared it doesn't care about the outcome; swallow the error and continue
      }
    },

    async ensureInstalled(pkgs, options = {}) {
      const missing = pkgs.filter(pkg => !hasDependency(pkg))
      if (missing.length === 0)
        return

      const devFlag = options.dev ? ` ${spec.devFlag}` : ''
      await execCommand(`${name} ${spec.add}${rootFlag} ${missing.join(' ')}${devFlag}`)
    },

    async uninstall(pkg) {
      const s = yoctoSpinner({ text: 'uninstall running' }).start()
      try {
        await execCommand(`${name} ${spec.remove}${rootFlag} ${pkg}`)
        s.success(`succeed to uninstall ${pkg}!`)
      }
      catch (e) {
        // Stop the spinner before throwing, otherwise the error message competes with the spinning line
        s.stop()
        throw new ScriptError(MSG_FOR.uninstallFailed(pkg), { cause: e })
      }
    },
  }
}
