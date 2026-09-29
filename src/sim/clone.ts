import { isProxy, toRaw } from 'vue'
import type { Save } from './types'

/**
 * 纯数据直接 structuredClone。
 * 撞上 Vue reactive Proxy 时浏览器抛 DataCloneError（#<Object> could not be cloned），
 * 再剥掉嵌套 Proxy 重克隆一次。
 */
export function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch (error) {
    if (!isDataCloneError(error)) throw error
    return structuredClone(deepToRaw(value))
  }
}

function isDataCloneError(error: unknown): boolean {
  return error instanceof Error && error.name === 'DataCloneError'
}

export function cloneSave(save: Save): Save {
  return clonePlain(save)
}

function deepToRaw<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  const raw = (isProxy(value) ? toRaw(value) : value) as T
  if (Array.isArray(raw)) {
    let copy: unknown[] | null = null
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]
      const next = deepToRaw(item)
      if (copy) {
        copy.push(next)
      } else if (!Object.is(next, item)) {
        copy = raw.slice(0, i)
        copy.push(next)
      }
    }
    return (copy ?? raw) as T
  }
  if (Object.getPrototypeOf(raw) !== Object.prototype) return raw
  const obj = raw as Record<string, unknown>
  let copy: Record<string, unknown> | null = null
  for (const key of Object.keys(obj)) {
    const item = obj[key]
    const next = deepToRaw(item)
    if (!Object.is(next, item)) {
      if (!copy) copy = { ...obj }
      copy[key] = next
    }
  }
  return (copy ?? raw) as T
}
