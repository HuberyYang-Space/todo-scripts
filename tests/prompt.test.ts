import { describe, expect, it, vi } from 'vitest'

const selectMock = vi.fn()
const isCancelMock = vi.fn((_value: unknown) => false)
const cancelMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  select: selectMock,
  isCancel: isCancelMock,
  cancel: cancelMock,
}))

// 只借 isInteractive 这一个判定，不把 figlet/gradient 那一整串依赖拉进来
const isInteractiveMock = vi.fn(() => true)
vi.mock('@/utils', () => ({ isInteractive: isInteractiveMock }))

const { canPrompt, promptLinterChoice, promptSelect } = await import('@/utils/prompt')

describe('promptLinterChoice', () => {
  it('应该把 select 的结果原样返回', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    expect(await promptLinterChoice()).toBe('eslint')
  })

  it('选择 none 时应该返回 none', async () => {
    selectMock.mockResolvedValue('none')
    isCancelMock.mockReturnValue(false)
    expect(await promptLinterChoice()).toBe('none')
  })

  it('用户取消时应该返回 undefined，并调用 cancel 提示', async () => {
    const cancelSymbol = Symbol('cancel')
    selectMock.mockResolvedValue(cancelSymbol)
    isCancelMock.mockImplementation(value => value === cancelSymbol)
    expect(await promptLinterChoice()).toBeUndefined()
    expect(cancelMock).toHaveBeenCalled()
  })

  it('提示的可选项里应该包含 none（跳过）', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    await promptLinterChoice()
    const call = selectMock.mock.calls[0][0]
    expect(call.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'none' })]),
    )
  })

  it('提示文案应该是纯中文，不再中英并排', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    await promptLinterChoice()
    const call = selectMock.mock.calls[0][0]
    expect(call.message).toContain('未检测到已知的 linter')
    // linter / lint-staged 这类技术名词是保留的，所以不能笼统地断言「不含 ASCII」，
    // 只钉住原来那半句英文确实不见了
    expect(call.message).not.toMatch(/no known linter/i)
    // 「跳过」那一项同样不该再拖一句英文
    const none = call.options.find((o: { value: string }) => o.value === 'none')
    expect(none.label).toBe('跳过 —— 我自己配置')
  })
})

describe('canPrompt', () => {
  it('可交互时应该返回 true', () => {
    isInteractiveMock.mockReturnValue(true)
    expect(canPrompt()).toBe(true)
  })

  it('不可交互时应该返回 false', () => {
    isInteractiveMock.mockReturnValue(false)
    expect(canPrompt()).toBe(false)
  })
})

describe('promptSelect', () => {
  it('应该把用户的选择原样返回', async () => {
    selectMock.mockResolvedValue('a')
    isCancelMock.mockReturnValue(false)
    expect(await promptSelect({ message: '选一个', options: [{ value: 'a', label: 'A' }] })).toBe('a')
  })

  it('用户取消时应该返回 undefined，并调用 cancel 提示', async () => {
    const cancelSymbol = Symbol('cancel')
    selectMock.mockResolvedValue(cancelSymbol)
    isCancelMock.mockImplementation(value => value === cancelSymbol)
    expect(await promptSelect({ message: '选一个', options: [{ value: 'a', label: 'A' }] })).toBeUndefined()
    expect(cancelMock).toHaveBeenCalled()
  })
})
