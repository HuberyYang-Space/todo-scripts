import process from 'node:process'
import yoctoSpinner from 'yocto-spinner'
import { MSG, MSG_FOR } from '@/constants/messages'
import { execCommand, hasDependency, isMonorepo, ScriptError } from '@/utils'

export interface PkgInfo {
  name: string
  version: string
}

export interface PackageManager {
  /** 包管理器名字，例如 pnpm */
  readonly name: string
  /** 安装这些包里尚未安装的那些；全都装好了就什么也不做 */
  ensureInstalled: (pkgs: string[], options?: { dev?: boolean }) => Promise<void>
  /** 卸载一个包 */
  uninstall: (pkg: string) => Promise<void>
  /**
   * 执行项目本地的 bin，例如 exec('husky init')
   *
   * allowFailure 表示调用方并不在乎这条命令成不成功（比如收尾的代码格式化）——
   * 失败时既不抛错，也不打断后续流程
   */
  exec: (command: string, options?: { allowFailure?: boolean }) => Promise<void>
  /** 把本地 bin 命令渲染成字符串，供写进 husky 钩子这类 shell 脚本 */
  formatExec: (command: string) => string
}

interface PkgManagerSpec {
  /** 安装子命令 */
  add: string
  /** 装成开发依赖用的参数 */
  devFlag: string
  /** 卸载子命令 */
  remove: string
  /** 在 monorepo 根目录安装/移除用的参数；不支持的包管理器留空 */
  rootFlag?: string
  /** 各家执行本地 bin 的写法 —— 差异大到不如直接写成函数 */
  exec: (command: string) => string
}

/**
 * 各个包管理器的差异全收在这一张表里 —— 调用方一个都不需要知道
 *
 * npm / pnpm / yarn 三项已经手工验证过；bun / deno 是照各自官方文档写的，
 * 但没有在本地验证（受限网络下 bun 的 install 会卡住）。
 */
const SPECS: Record<string, PkgManagerSpec> = {
  npm: {
    add: 'install',
    devFlag: '--save-dev',
    remove: 'uninstall',
    // --no 让 npx 在本地找不到命令时不要联网安装；跑到这一步时，涉及的包
    // （husky/eslint/commitlint）已经被 ensureInstalled/hasDependency 确认在本地了，
    // 所以它不改变正常路径的行为 —— 只是去掉 npx 那条兜底联网安装带来的不确定性
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
    // yarn v1 明确拒绝 `yarn install <pkg>`，而且它的开发依赖参数是 --dev 而不是 --save-dev
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
    // npm: 前缀直接贴着 bin 名字，中间不能有空格
    exec: command => `deno run -A npm:${command}`,
  },
}

/**
 * 从 user agent 里取出当前使用的包管理器
 * @returns {PkgInfo} 包管理器信息，含名字与版本
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
 * 为当前项目创建包管理器
 *
 * 包管理器种类和 monorepo 判定都只在这里解析一次；后续每次调用复用结果，
 * 不会再去碰一遍文件系统
 */
export function createPackageManager(): PackageManager {
  const detected = getPkgManager()?.name ?? 'npm'
  // 认不出来的包管理器一律回退到 npm
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
        // 调用方已经声明不在乎结果；吞掉错误继续往下走
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
      const s = yoctoSpinner({ text: MSG.spinnerUninstallStart }).start()
      try {
        await execCommand(`${name} ${spec.remove}${rootFlag} ${pkg}`)
        s.success(MSG_FOR.uninstallDone(pkg))
      }
      catch (e) {
        // 抛错前先停掉 spinner，否则报错信息会和转圈那行抢地方
        s.stop()
        throw new ScriptError(MSG_FOR.uninstallFailed(pkg), { cause: e })
      }
    },
  }
}
