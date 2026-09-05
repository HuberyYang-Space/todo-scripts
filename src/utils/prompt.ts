import type { LinterKind } from '@/utils/linter'
import { cancel, isCancel, select } from '@clack/prompts'
import { MSG } from '@/constants/messages'

export async function promptLinterChoice(): Promise<LinterKind | 'none' | undefined> {
  const answer = await select({
    message: MSG.promptLinterMessage,
    options: [
      // 三个选项是产品名，不翻译
      { value: 'eslint', label: 'ESLint' },
      { value: 'biome', label: 'Biome' },
      { value: 'oxlint', label: 'Oxlint' },
      { value: 'none', label: MSG.promptLinterNone },
    ],
  })

  if (isCancel(answer)) {
    cancel(MSG.promptCancelledLabel)
    return undefined
  }

  return answer as LinterKind | 'none'
}
