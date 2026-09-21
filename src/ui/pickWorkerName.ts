import { CLASS_LABEL } from '../sim/tables'

/** 长后缀优先，避免先剥短词。 */
const CLASS_SUFFIXES = [...new Set(Object.values(CLASS_LABEL))].sort((a, b) => b.length - a.length)

/**
 * 选人弹层显示名：只留本名（如「铁钉」），剥掉职业后缀（游民 / 骑士等）。
 * 名字本身就是职业名时原样留下。
 */
export function pickWorkerName(worker: { id: string; name?: string }): string {
  const raw = (worker.name ?? worker.id).trim()
  if (!raw) return worker.id
  for (const suffix of CLASS_SUFFIXES) {
    if (raw === suffix) return raw
    if (raw.endsWith(suffix) && raw.length > suffix.length) {
      return raw.slice(0, -suffix.length).replace(/[·\s\-—]+$/, '') || raw
    }
  }
  return raw
}
