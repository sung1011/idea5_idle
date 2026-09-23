/**
 * 选中工人将进入的槽位。`picked` 顺序就是确认后的出战 / 入洞顺序。
 * `occupied` 是已经占着的槽：增援用场上存活人数，开采用洞里已派人数。开战为 0。
 * 未选中返回 null。取消某人后，其余人按剩余顺序重算。
 */
export function pickSlotNumber(picked: readonly string[], workerId: string, occupied = 0): number | null {
  const index = picked.indexOf(workerId)
  if (index < 0) return null
  const base = Number.isFinite(occupied) ? Math.max(0, Math.floor(occupied)) : 0
  return base + index + 1
}
