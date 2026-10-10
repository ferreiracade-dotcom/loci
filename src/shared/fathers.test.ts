import { describe, expect, it } from 'vitest'
import { fathersVolumeLabel, parseFathersCode } from './fathers'

describe('parseFathersCode', () => {
  it('decodes the three CCEL series', () => {
    expect(parseFathersCode('anf01')).toEqual({ series: 'anf', number: 1 })
    expect(parseFathersCode('anf10')).toEqual({ series: 'anf', number: 10 })
    expect(parseFathersCode('npnf105')).toEqual({ series: 'npnf1', number: 5 })
    expect(parseFathersCode('npnf214')).toEqual({ series: 'npnf2', number: 14 })
  })

  it('is case-insensitive and trims', () => {
    expect(parseFathersCode(' ANF03 ')).toEqual({ series: 'anf', number: 3 })
  })

  it('rejects anything else', () => {
    expect(parseFathersCode('anf1')).toBeNull()
    expect(parseFathersCode('npnf301')).toBeNull()
    expect(parseFathersCode('npnf01')).toBeNull()
    expect(parseFathersCode('readme')).toBeNull()
    expect(parseFathersCode('')).toBeNull()
  })
})

describe('fathersVolumeLabel', () => {
  it('labels volumes with the series and number', () => {
    expect(fathersVolumeLabel('anf01')).toBe('ANF 1')
    expect(fathersVolumeLabel('npnf104')).toBe('NPNF¹ 4')
    expect(fathersVolumeLabel('npnf212')).toBe('NPNF² 12')
  })

  it('passes an unknown code through', () => {
    expect(fathersVolumeLabel('zzz')).toBe('zzz')
  })
})
