import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// An unclosed block in app.css silently swallows every rule after it (a merge once dropped one
// closing brace and unstyled the commentary, dogmatics and Fathers views), so guard the balance.
describe('app.css', () => {
  it('has balanced braces', () => {
    const css = readFileSync(join(__dirname, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    let depth = 0
    let line = 1
    for (const ch of css) {
      if (ch === '\n') line++
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        expect(depth, `extra "}" near line ${line}`).toBeGreaterThanOrEqual(0)
      }
    }
    expect(depth, 'a block is never closed').toBe(0)
  })
})
