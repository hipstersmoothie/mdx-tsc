import { expect, test } from 'vitest'
import { version } from '../src/index.js'

test('package exposes a version', () => {
  expect(version).toBe('0.1.0')
})
