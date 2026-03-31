import { describe, it, expect } from 'vitest'
import type { WorkerInMessage, WorkerOutMessage, DataPools, QueryResult } from '../sqlite/types'

/**
 * Type-level tests: these verify that the worker message protocol
 * types are structurally correct. If these compile, the types are valid.
 * Runtime assertions verify discriminated union exhaustiveness.
 */

describe('worker message types', () => {
  it('WorkerInMessage covers init, generate, query', () => {
    const init: WorkerInMessage = { type: 'init', wasmExecText: '', wasmBytes: new ArrayBuffer(0) }
    const generate: WorkerInMessage = {
      type: 'generate',
      count: 1000,
      pools: { products: [], addresses: [], names: [], emails: [], cities: [], countries: [] },
    }
    const query: WorkerInMessage = { type: 'query', sql: 'SELECT 1' }

    expect(init.type).toBe('init')
    expect(generate.type).toBe('generate')
    expect(query.type).toBe('query')
  })

  it('WorkerOutMessage covers all response types', () => {
    const msgs: WorkerOutMessage[] = [
      { type: 'ready' },
      { type: 'progress', pct: 50, msg: 'halfway' },
      { type: 'generated', count: 1000, custCount: 200, elapsed: '1.5' },
      { type: 'queryResult', columns: ['id'], values: [[1]], totalRows: 1, time: 5, sampled: null },
      { type: 'queryError', msg: 'bad sql' },
      { type: 'error', msg: 'fatal' },
    ]

    const types = msgs.map((m) => m.type)
    expect(types).toEqual(['ready', 'progress', 'generated', 'queryResult', 'queryError', 'error'])
  })

  it('DataPools has all required string arrays', () => {
    const pools: DataPools = {
      products: ['Widget'],
      addresses: ['123 Main St'],
      names: ['Alice'],
      emails: ['a@b.com'],
      cities: ['NYC'],
      countries: ['US'],
    }

    for (const key of ['products', 'addresses', 'names', 'emails', 'cities', 'countries'] as const) {
      expect(Array.isArray(pools[key])).toBe(true)
      expect(pools[key].length).toBeGreaterThan(0)
    }
  })

  it('QueryResult has the expected shape', () => {
    const result: QueryResult = {
      columns: ['id', 'name'],
      values: [[1, 'Alice'], [2, 'Bob']],
      totalRows: 2,
      time: 3.5,
      sampled: null,
    }

    expect(result.columns).toHaveLength(2)
    expect(result.values).toHaveLength(2)
    expect(result.totalRows).toBe(2)
    expect(result.time).toBeGreaterThan(0)
  })
})
