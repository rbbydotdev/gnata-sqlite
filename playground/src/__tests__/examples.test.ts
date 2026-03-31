import { describe, it, expect } from 'vitest'
import { GNATA_EXAMPLES } from '../gnata/examples'
import { QUERIES } from '../sqlite/queries'

describe('gnata examples', () => {
  const exampleKeys = Object.keys(GNATA_EXAMPLES)

  it('has at least 8 examples', () => {
    expect(exampleKeys.length).toBeGreaterThanOrEqual(8)
  })

  it.each(exampleKeys)('"%s" has a non-empty expression', (key) => {
    expect(GNATA_EXAMPLES[key].expr.trim().length).toBeGreaterThan(0)
  })

  it.each(exampleKeys)('"%s" has valid JSON data', (key) => {
    const data = GNATA_EXAMPLES[key].data
    expect(() => JSON.parse(data)).not.toThrow()
  })

  it.each(exampleKeys)('"%s" JSON data has at least one top-level key', (key) => {
    const parsed = JSON.parse(GNATA_EXAMPLES[key].data)
    expect(Object.keys(parsed).length).toBeGreaterThan(0)
  })

  it('includes the key examples: invoice, transform, pipeline', () => {
    expect(GNATA_EXAMPLES).toHaveProperty('invoice')
    expect(GNATA_EXAMPLES).toHaveProperty('transform')
    expect(GNATA_EXAMPLES).toHaveProperty('pipeline')
  })
})

describe('SQL queries', () => {
  it('has at least 10 queries', () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(10)
  })

  it.each(QUERIES.map((q, i) => [q.name, i] as const))(
    '"%s" has a non-empty SQL string',
    (_name, idx) => {
      expect(QUERIES[idx].sql.trim().length).toBeGreaterThan(0)
    }
  )

  it.each(QUERIES.map((q, i) => [q.name, i] as const))(
    '"%s" has a non-empty name',
    (_name, idx) => {
      expect(QUERIES[idx].name.trim().length).toBeGreaterThan(0)
    }
  )

  it('all query names are unique', () => {
    const names = QUERIES.map((q) => q.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('queries use jsonata functions', () => {
    const usesJsonata = QUERIES.filter(
      (q) => q.sql.includes('jsonata(') || q.sql.includes('jsonata_query(')
    )
    expect(usesJsonata.length).toBe(QUERIES.length)
  })
})
