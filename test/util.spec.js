/* global describe, it */
import expect from 'expect'

import { callOrMap, isDefined } from '../src/util'

describe('callOrMap', () => {
  const toUpperCase = str => str.toUpperCase()

  it('applies a function to a singleton', () => {
    expect(callOrMap(toUpperCase, 'foo')).toEqual('FOO')
  })

  it('maps a function over an array', () => {
    expect(callOrMap(toUpperCase, ['foo', 'bar'])).toEqual(['FOO', 'BAR'])
  })
})

describe('isDefined', () => {
  it('knows when a value is defined', () => {
    expect(isDefined(undefined)).toBe(false)
    expect(isDefined('')).toBe(true)
    expect(isDefined([])).toBe(true)
    expect(isDefined({})).toBe(true)
    expect(isDefined(false)).toBe(true)
    expect(isDefined(null)).toBe(true)
    expect(isDefined(NaN)).toBe(true)
  })
})
