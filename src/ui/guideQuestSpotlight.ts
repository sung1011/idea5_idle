export const GUIDE_SPOT_PAD = 8
export const GUIDE_SPOT_MIN = 4
export const GUIDE_SPOT_RADIUS = 16

export type SpotlightBox = {
  x: number
  y: number
  w: number
  h: number
}

export type SpotlightHole = SpotlightBox & {
  r: number
}

export type ClientBox = {
  left: number
  top: number
  width: number
  height: number
}

export function intersectBoxes(a: SpotlightBox, b: SpotlightBox): SpotlightBox | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.w, b.x + b.w)
  const bottom = Math.min(a.y + a.h, b.y + b.h)
  const w = right - x
  const h = bottom - y
  if (w < GUIDE_SPOT_MIN || h < GUIDE_SPOT_MIN) return null
  return { x, y, w, h }
}

export function padBox(box: SpotlightBox, pad = GUIDE_SPOT_PAD): SpotlightBox {
  return {
    x: box.x - pad,
    y: box.y - pad,
    w: box.w + pad * 2,
    h: box.h + pad * 2,
  }
}

export function holeRadius(box: SpotlightBox, max = GUIDE_SPOT_RADIUS): number {
  return Math.min(max, box.w / 2, box.h / 2)
}

export function clientBoxToShell(rect: ClientBox, shell: Pick<ClientBox, 'left' | 'top'>): SpotlightBox {
  return {
    x: rect.left - shell.left,
    y: rect.top - shell.top,
    w: rect.width,
    h: rect.height,
  }
}

export function clipBoxToClips(box: SpotlightBox, clips: readonly SpotlightBox[]): SpotlightBox | null {
  let cur: SpotlightBox | null = box
  for (const clip of clips) {
    if (!cur) return null
    cur = intersectBoxes(cur, clip)
  }
  return cur
}

export function holeFromClient(
  rect: ClientBox,
  shell: ClientBox,
  clips: readonly ClientBox[] = [],
  pad = GUIDE_SPOT_PAD,
): SpotlightHole | null {
  const shellBox = { x: 0, y: 0, w: shell.width, h: shell.height }
  const raw = clientBoxToShell(rect, shell)
  const clipBoxes = [shellBox, ...clips.map((c) => clientBoxToShell(c, shell))]
  const visible = clipBoxToClips(raw, clipBoxes)
  if (!visible) return null
  const padded = intersectBoxes(padBox(visible, pad), shellBox)
  if (!padded) return null
  return { ...padded, r: holeRadius(padded) }
}
