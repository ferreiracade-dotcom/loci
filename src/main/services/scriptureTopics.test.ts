import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'topics-'))
const fixture: Record<string, string[]> = {
  'Prayer of Faith': ['James 5:15'],
  Prayer: ['Matthew 6:9', 'Luke 11:2'],
  'Answered prayer': ['1 John 5:14'],
  Praise: ['Psalm 150:1'],
  'Family prayer': ['Acts 12:5']
}
for (let i = 0; i < 300; i++) fixture['Zed ' + String(i).padStart(3, '0')] = ['Gen 1:1']
writeFileSync(join(dir, 'topics.json'), JSON.stringify(fixture))

vi.mock('./scripture', () => ({ bundledScriptureDir: () => dir }))

import { getScriptureTopic, searchScriptureTopics } from './scriptureTopics'

describe('searchScriptureTopics', () => {
  it('ranks prefix before substring, then alphabetical, case-insensitively', () => {
    expect(searchScriptureTopics('PRAYER').map((h) => h.name)).toEqual([
      'Prayer',
      'Prayer of Faith',
      'Answered prayer',
      'Family prayer'
    ])
  })
  it('reports ref counts', () => {
    expect(searchScriptureTopics('prayer')[0]).toEqual({ name: 'Prayer', refCount: 2 })
  })
  it('honours the limit, defaults to 50 and caps it', () => {
    expect(searchScriptureTopics('prayer', 2)).toHaveLength(2)
    expect(searchScriptureTopics('zed')).toHaveLength(50)
    expect(searchScriptureTopics('zed', 100000)).toHaveLength(200)
  })
  it('returns nothing for empty or unmatched queries', () => {
    expect(searchScriptureTopics('  ')).toEqual([])
    expect(searchScriptureTopics('nomatch')).toEqual([])
  })
})

describe('getScriptureTopic', () => {
  it('returns the topic refs or null', () => {
    expect(getScriptureTopic('Prayer')).toEqual({ name: 'Prayer', refs: ['Matthew 6:9', 'Luke 11:2'] })
    expect(getScriptureTopic('prayer')).toBeNull()
    expect(getScriptureTopic('toString')).toBeNull()
  })
})
