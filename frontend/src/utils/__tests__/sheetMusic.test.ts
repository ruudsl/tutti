import { describe, it, expect } from 'vitest'
import { searchSheetMusicWebsites } from '../sheetMusic'

describe('searchSheetMusicWebsites', () => {
  it('returns 5 search sites', () => {
    const results = searchSheetMusicWebsites('Bohemian Rhapsody')
    expect(results).toHaveLength(5)
  })

  it('includes expected site names', () => {
    const results = searchSheetMusicWebsites('test')
    const names = results.map(r => r.name)
    expect(names).toContain('De Haske')
    expect(names).toContain('Hal Leonard')
    expect(names).toContain('YouTube')
  })

  it('encodes the title in URLs', () => {
    const results = searchSheetMusicWebsites('My Title & More')
    results.forEach(result => {
      expect(result.url).toContain('My%20Title%20%26%20More')
    })
  })

  it('returns valid URLs', () => {
    const results = searchSheetMusicWebsites('test')
    results.forEach(result => {
      expect(result.url).toMatch(/^https:\/\//)
    })
  })
})
