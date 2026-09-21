import { describe, expect, it } from 'vitest'
import { pickWorkerName } from './pickWorkerName'

describe('pickWorkerName', () => {
  it('keeps a pool base name', () => {
    expect(pickWorkerName({ id: 'w1', name: '铁钉' })).toBe('铁钉')
  })

  it('strips class suffixes like 游民 and 骑士', () => {
    expect(pickWorkerName({ id: 'w1', name: '铁钉游民' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉骑士' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉·骑士' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉 力工' })).toBe('铁钉')
  })

  it('strips any class suffix, not only the current job', () => {
    expect(pickWorkerName({ id: 'w1', name: '炉火炼金师' })).toBe('炉火')
    expect(pickWorkerName({ id: 'w1', name: '青苔药农' })).toBe('青苔')
  })

  it('keeps a name that is itself a class label', () => {
    expect(pickWorkerName({ id: 'w1', name: '游民' })).toBe('游民')
    expect(pickWorkerName({ id: 'w1', name: '骑士' })).toBe('骑士')
  })

  it('keeps assist prefix names without a class suffix', () => {
    expect(pickWorkerName({ id: 'assist-guest', name: '助战·铁钉' })).toBe('助战·铁钉')
  })

  it('falls back to id when name is empty', () => {
    expect(pickWorkerName({ id: 'w-9', name: '  ' })).toBe('w-9')
    expect(pickWorkerName({ id: 'w-9' })).toBe('w-9')
  })
})
