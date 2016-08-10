/* global describe, it */
import expect from 'expect'

import { isDefined } from '../src/util'

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
