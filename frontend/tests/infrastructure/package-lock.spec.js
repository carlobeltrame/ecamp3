import { lockfileVersion } from '../../package-lock.json'
import { describe, expect, test } from 'vitest'

describe('The package-lock.json', () => {
  test('uses lockfileVersion 3', () => {
    expect(lockfileVersion).toBe(3)
  })
})
