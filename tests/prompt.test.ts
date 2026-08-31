import { describe, expect, it, vi } from 'vitest'

const selectMock = vi.fn()
const isCancelMock = vi.fn((_value: unknown) => false)
const cancelMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  select: selectMock,
  isCancel: isCancelMock,
  cancel: cancelMock,
}))

const { promptLinterChoice } = await import('@/utils/prompt')

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

  it('提示文案应该是中英双语', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    await promptLinterChoice()
    const call = selectMock.mock.calls[0][0]
    expect(call.message).toContain('未检测到已知的 linter')
    expect(call.message).toMatch(/no known linter/i)
  })
})
