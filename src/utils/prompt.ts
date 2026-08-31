import type { LinterKind } from '@/utils/linter'
import { cancel, isCancel, select } from '@clack/prompts'

export async function promptLinterChoice(): Promise<LinterKind | 'none' | undefined> {
  const answer = await select({
    message: '未检测到已知的 linter，用于 lint-staged 的检查工具是？/ No known linter detected — which one drives lint-staged?',
    options: [
      { value: 'eslint', label: 'ESLint' },
      { value: 'biome', label: 'Biome' },
      { value: 'oxlint', label: 'Oxlint' },
      { value: 'none', label: '跳过 — 我自己配置 / None — I will configure lint-staged myself' },
    ],
  })

  if (isCancel(answer)) {
    cancel('已取消 / Cancelled.')
    return undefined
  }

  return answer as LinterKind | 'none'
}
