import { describe, expect, it } from 'vitest'
import { requestHeadersFromEnv } from '../src/scrape/stores/env-headers.js'

const read = (value: string | undefined) => requestHeadersFromEnv({ H: value }, 'H', 'Shop')

describe('requestHeadersFromEnv', () => {
  it('fails when the variable is absent or blank', () => {
    expect(() => read(undefined)).toThrow('Shop: H is not set')
    expect(() => read('  ')).toThrow('Shop: H is not set')
  })
  it('fails on text that is not JSON', () => {
    expect(() => read('{oops')).toThrow('Shop: H is not valid JSON')
  })
  it('fails when JSON is not an object', () => {
    for (const v of ['[]', '"x"', 'null', '3']) {
      expect(() => read(v)).toThrow('Shop: H must be a JSON object of header names to values')
    }
  })
  it('fails when a value is not a string', () => {
    expect(() => read('{"a":1}')).toThrow('Shop: H values must be strings')
  })
  it('returns the object', () => {
    expect(read('{"a":"b","c":"d"}')).toEqual({ a: 'b', c: 'd' })
  })
})
