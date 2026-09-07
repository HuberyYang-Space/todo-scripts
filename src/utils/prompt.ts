import type { Option } from '@clack/prompts'
import type { LinterKind } from '@/utils/linter'
import { cancel, isCancel, select } from '@clack/prompts'
import { MSG } from '@/constants/messages'
import { isInteractive } from '@/utils'

interface SelectConfig<T> {
  message: string
  // 直接复用 clack 自己的选项类型：它是个条件类型，自己另写一份在泛型里归约不了
  options: Option<T>[]
}

/**
 * 现在这个环境能不能弹交互提示
 *
 * 守卫放在 prompt 层而不是各个脚本里：调用方只需要问「能不能问用户」，
 * 不必知道判据其实是 TTY 加 CI 环境变量。
 */
export function canPrompt(): boolean {
  return isInteractive()
}

/**
 * 单选提示的统一入口
 *
 * 「取消 → 打一句提示 → 返回 undefined」这个约定收在这里，将来多一种提示时
 * 不必把它重写一遍，也不会有哪一种忘了提示就静悄悄地返回。
 */
export async function promptSelect<T extends string>(config: SelectConfig<T>): Promise<T | undefined> {
  const answer = await select({ message: config.message, options: config.options })

  if (isCancel(answer)) {
    cancel(MSG.promptCancelledLabel)
    return undefined
  }

  return answer as T
}

export async function promptLinterChoice(): Promise<LinterKind | 'none' | undefined> {
  return promptSelect<LinterKind | 'none'>({
    message: MSG.promptLinterMessage,
    options: [
      // 三个选项是产品名，不翻译
      { value: 'eslint', label: 'ESLint' },
      { value: 'biome', label: 'Biome' },
      { value: 'oxlint', label: 'Oxlint' },
      { value: 'none', label: MSG.promptLinterNone },
    ],
  })
}
