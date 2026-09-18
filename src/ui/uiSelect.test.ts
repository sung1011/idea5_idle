import { describe, expect, it } from 'vitest'
import {
  nextUiSelectUid,
  uiSelectCanPick,
  uiSelectLabel,
  uiSelectStepIndex,
  type UiSelectOption,
} from './uiSelect'

const options: UiSelectOption[] = [
  { value: '', label: '无' },
  { value: 'a', label: '工具1' },
  { value: 'b', label: '工具2（Lv10）', disabled: true },
  { value: 'c', label: '工具3' },
]

describe('uiSelect helpers', () => {
  it('allocates unique ids', () => {
    expect(nextUiSelectUid()).not.toBe(nextUiSelectUid())
  })

  it('shows the selected label', () => {
    expect(uiSelectLabel(options, '')).toBe('无')
    expect(uiSelectLabel(options, 'a')).toBe('工具1')
    expect(uiSelectLabel(options, 'missing')).toBe('')
  })

  it('blocks disabled options', () => {
    expect(uiSelectCanPick(options[0])).toBe(true)
    expect(uiSelectCanPick(options[2])).toBe(false)
    expect(uiSelectCanPick(undefined)).toBe(false)
  })

  it('steps over disabled rows', () => {
    expect(uiSelectStepIndex(options, 1, 1)).toBe(3)
    expect(uiSelectStepIndex(options, 3, -1)).toBe(1)
    expect(uiSelectStepIndex(options, -1, 1)).toBe(0)
  })
})
