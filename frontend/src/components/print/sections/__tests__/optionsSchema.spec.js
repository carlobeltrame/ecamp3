import { describe, expect, it } from 'vitest'
import { defaultOptions, repairOptions } from '../optionsSchema.js'

const camp = {
  periods: () => ({
    items: [{ _meta: { self: '/periods/1' } }, { _meta: { self: '/periods/2' } }],
  }),
}

const schema = [
  { key: 'periods', type: 'periods' },
  { key: 'bold', type: 'boolean', default: true },
  { key: 'fontSize', type: 'number', default: 7, min: 5, max: 12 },
  { key: 'heading', type: 'text', default: 'Hello' },
  {
    key: 'orientation',
    type: 'select',
    default: 'landscape',
    items: [{ value: 'portrait' }, { value: 'landscape' }],
  },
  { key: 'logo', type: 'image' },
]

const defaults = {
  periods: ['/periods/1', '/periods/2'],
  bold: true,
  fontSize: 7,
  heading: 'Hello',
  orientation: 'landscape',
  logo: null,
}

describe('defaultOptions', () => {
  it('uses the declared defaults and all periods of the camp', () => {
    expect(defaultOptions(schema, camp)).toEqual(defaults)
  })

  it('falls back to neutral values when no default is declared', () => {
    const withoutDefaults = schema.map(({ default: _, ...option }) => option)

    expect(defaultOptions(withoutDefaults, camp)).toEqual({
      periods: ['/periods/1', '/periods/2'],
      bold: false,
      fontSize: 5,
      heading: '',
      orientation: 'portrait',
      logo: null,
    })
  })
})

describe('repairOptions', () => {
  it('keeps valid values', () => {
    const options = {
      periods: ['/periods/2'],
      bold: false,
      fontSize: 10,
      heading: '',
      orientation: 'portrait',
      logo: 'data:image/png;base64,AAAA',
    }

    expect(repairOptions(options, schema, camp)).toEqual(options)
  })

  it('keeps the file name of an image', () => {
    const options = { logo: 'data:image/png;base64,AAAA', logoFileName: 'logo.png' }

    expect(repairOptions(options, schema, camp).logoFileName).toBe('logo.png')
  })

  it('drops the file name of a missing image', () => {
    const options = { logo: null, logoFileName: 'logo.png' }

    expect(repairOptions(options, schema, camp)).not.toHaveProperty('logoFileName')
  })

  it.each([
    [{ periods: ['/periods/unknown'] }],
    [{ periods: [] }],
    [{ bold: 'yes' }],
    [{ fontSize: 99 }],
    [{ fontSize: '7' }],
    [{ heading: 3 }],
    [{ orientation: 'diagonal' }],
    [{ logo: 'https://example.com/logo.png' }],
    [undefined],
  ])('replaces invalid values in %j with the defaults', (invalid) => {
    expect(repairOptions(invalid, schema, camp)).toEqual(defaults)
  })

  it('drops values which are not part of the schema', () => {
    expect(repairOptions({ ...defaults, removed: 1 }, schema, camp)).toEqual(defaults)
  })
})
