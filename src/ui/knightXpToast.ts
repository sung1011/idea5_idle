import { ref } from 'vue'

/** 顶栏酋长等级旁要飘的经验。0 表示当前没有。 */
export const knightXpPop = ref(0)
export const knightXpPopToken = ref(0)

export function showKnightXpPop(amount: number): void {
  const gain = Math.floor(amount)
  if (gain <= 0) return
  knightXpPop.value = gain
  knightXpPopToken.value += 1
}
