import { describe, expect, it } from 'vitest'
import { KIND_LABEL, KIND_PLURAL, kindFromPath, ofKind, type KindRoots } from './libraryKind'

const roots: KindRoots = { vaultPdfs: 'G:\\Drive\\Loci\\pdfs', localLibrary: 'D:\\Theology\\PDF' }

describe('kindFromPath (vault)', () => {
  it('pdfs/Books is a book', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Books\\A - B.pdf', roots)).toBe('book')
  })
  it('pdfs/Articles is an article, at any depth', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Articles\\A - B.pdf', roots)).toBe('article')
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Articles\\Journals\\CJ\\A - B.pdf', roots)).toBe('article')
  })
  it('is case-insensitive on the folder and the root, and accepts forward slashes', () => {
    expect(kindFromPath('g:/drive/loci/PDFS/ARTICLES/x.pdf', roots)).toBe('article')
  })
  it('any other vault pdf folder is a book', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Old\\x.pdf', roots)).toBe('book')
  })
  it('a file directly in pdfs is a book, and a folder called Articles NAMING the file is not a folder', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\x.pdf', roots)).toBe('book')
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Books\\Articles.pdf', roots)).toBe('book')
  })
})

describe('kindFromPath (local library folder)', () => {
  it('a file in the root is a book', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Calvin - Institutes.pdf', roots)).toBe('book')
  })
  it('any directory named Articles at any depth makes an article (case-insensitive)', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Articles\\x.pdf', roots)).toBe('article')
    expect(kindFromPath('D:\\Theology\\PDF\\Luther\\ARTICLES\\2020\\x.pdf', roots)).toBe('article')
    expect(kindFromPath('D:\\Theology\\PDF\\articles\\x.pdf', roots)).toBe('article')
  })
  it('a directory that merely contains the word is not Articles', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Smalcald Articles\\x.pdf', roots)).toBe('book')
  })
})

describe('kindFromPath (outside both roots)', () => {
  it('returns null', () => {
    expect(kindFromPath('C:\\Users\\me\\Downloads\\x.pdf', roots)).toBeNull()
    expect(kindFromPath('x.pdf', { vaultPdfs: null, localLibrary: null })).toBeNull()
  })
  it('does not treat a sibling folder with the same prefix as inside the root', () => {
    expect(kindFromPath('D:\\Theology\\PDF-old\\Articles\\x.pdf', roots)).toBeNull()
  })
})

describe('labels and ofKind', () => {
  it('labels', () => {
    expect(KIND_LABEL).toEqual({ book: 'Book', article: 'Article' })
    expect(KIND_PLURAL).toEqual({ book: 'Books', article: 'Articles' })
  })
  it('filters by kind', () => {
    const items = [
      { id: 1, kind: 'book' as const },
      { id: 2, kind: 'article' as const }
    ]
    expect(ofKind(items, 'article').map((i) => i.id)).toEqual([2])
    expect(ofKind(items, 'book').map((i) => i.id)).toEqual([1])
  })
})
