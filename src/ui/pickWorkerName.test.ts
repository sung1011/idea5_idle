import { describe, expect, it } from 'vitest'
import { pickWorkerName } from './pickWorkerName'

describe('pickWorkerName', () => {
  it('keeps a pool base name', () => {
    expect(pickWorkerName({ id: 'w1', name: '格鲁克' })).toBe('格鲁克')
  })

  it('strips class suffixes like 流浪者 and 督军', () => {
    expect(pickWorkerName({ id: 'w1', name: '铁钉流浪者' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉督军' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉·督军' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉 力工' })).toBe('铁钉')
    expect(pickWorkerName({ id: 'w1', name: '铁钉营地厨子' })).toBe('铁钉')
  })

  it('strips any class suffix, not only the current job', () => {
    expect(pickWorkerName({ id: 'w1', name: '炉火炼金师' })).toBe('炉火')
    expect(pickWorkerName({ id: 'w1', name: '青苔草药师' })).toBe('青苔')
    expect(pickWorkerName({ id: 'w1', name: '青苔监工' })).toBe('青苔')
  })

  it('keeps a name that is itself a class label', () => {
    expect(pickWorkerName({ id: 'w1', name: '流浪者' })).toBe('流浪者')
    expect(pickWorkerName({ id: 'w1', name: '督军' })).toBe('督军')
    expect(pickWorkerName({ id: 'w1', name: '营地厨子' })).toBe('营地厨子')
  })

  it('keeps assist prefix names without a class suffix', () => {
    expect(pickWorkerName({ id: 'assist-guest', name: '助战·铁钉' })).toBe('助战·铁钉')
  })

  it('falls back to id when name is empty', () => {
    expect(pickWorkerName({ id: 'w-9', name: '  ' })).toBe('w-9')
    expect(pickWorkerName({ id: 'w-9' })).toBe('w-9')
  })
})
