import { describe, expect, it } from 'vitest'
import source from './techPanel.vue?raw'

describe('tech panel', () => {
  it('opens the effect sheet for every node, including locked rows', () => {
    const onNode = source.slice(source.indexOf('function onNode'), source.indexOf('function activate'))
    expect(onNode).toContain('selected.value = node')
    expect(onNode).not.toContain('researchTech')
    expect(onNode).not.toContain('isRowOpen')
    expect(source).toContain('@click="onNode(node)"')
    expect(source).toContain(':class="nodeClass(node)"')
    expect(source).toContain("return 'off'")
    const offRule = source.slice(source.indexOf('.node.off {'), source.indexOf('.modal {'))
    expect(offRule).toContain('filter: grayscale(0.35)')
    expect(offRule).not.toContain('pointer-events')
    expect(source).not.toContain(':disabled="!isRowOpen')
  })

  it('grays the activate button on locked rows with the previous-row hint', () => {
    expect(source).toContain('techRowLockReason')
    expect(source).toContain('selectedLive.lockReason')
    expect(source).toContain('v-else-if="selectedLive.lockReason"')
    expect(source).toContain('已激活')
    expect(source).toContain('selectedLive.activateLabel')
    const activate = source.slice(source.indexOf('function activate'), source.indexOf('function closeSheet'))
    expect(activate).toContain('isRowOpen')
    expect(activate).toContain('researchTech')
    expect(activate).toContain('maxed(node.id)')
  })
})
