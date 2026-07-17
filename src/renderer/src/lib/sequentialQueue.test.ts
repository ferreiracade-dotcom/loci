import { describe, expect, it } from 'vitest'
import { createSequentialQueue } from './sequentialQueue'

describe('createSequentialQueue', () => {
  it('runs tasks in the order they were pushed, even if an earlier one resolves later', async () => {
    const results: string[] = []
    const push = createSequentialQueue()
    push(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            results.push('a')
            resolve()
          }, 20)
        })
    )
    push(async () => {
      results.push('b')
    })
    push(async () => {
      results.push('c')
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(results).toEqual(['a', 'b', 'c'])
  })

  it('keeps running later tasks even if an earlier one throws', async () => {
    const results: string[] = []
    const push = createSequentialQueue()
    push(async () => {
      throw new Error('boom')
    })
    push(async () => {
      results.push('after-failure')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(results).toEqual(['after-failure'])
  })
})
