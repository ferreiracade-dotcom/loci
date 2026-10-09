import { describe, expect, it } from 'vitest'
import { leaveToEditor } from './leaveToEditor'

const editor = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget
const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget
const page = { tagName: 'DIV', isContentEditable: false } as unknown as EventTarget
const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>, target: EventTarget) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
  target
})

describe('tab shortcuts inside text', () => {
  it('leaves Ctrl+Shift+B (blockquote) to the note editor only', () => {
    expect(leaveToEditor(key('B', { ctrlKey: true, shiftKey: true }, editor), false)).toBe(true)
    expect(leaveToEditor(key('B', { ctrlKey: true, shiftKey: true }, page), false)).toBe(false)
  })

  it('leaves Option+arrows to text fields on macOS only', () => {
    expect(leaveToEditor(key('ArrowLeft', { altKey: true }, input), true)).toBe(true)
    expect(leaveToEditor(key('ArrowRight', { altKey: true }, editor), true)).toBe(true)
    expect(leaveToEditor(key('ArrowLeft', { altKey: true }, input), false)).toBe(false)
    expect(leaveToEditor(key('ArrowLeft', { altKey: true }, page), true)).toBe(false)
  })

  it('keeps the tab shortcuts everywhere else', () => {
    expect(leaveToEditor(key('w', { ctrlKey: true }, editor), false)).toBe(false)
    expect(leaveToEditor(key('t', { ctrlKey: true }, input), true)).toBe(false)
  })
})
