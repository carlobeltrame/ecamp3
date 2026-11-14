function periodUris(camp) {
  return camp.periods().items.map((period) => period._meta.self)
}

function defaultValue(option, camp) {
  switch (option.type) {
    case 'periods':
      return periodUris(camp)
    case 'boolean':
      return option.default === true
    case 'number':
      return typeof option.default === 'number' ? option.default : (option.min ?? 0)
    case 'select':
      return isSelectable(option, option.default)
        ? option.default
        : option.items?.[0]?.value
    case 'text':
    case 'textarea':
      return typeof option.default === 'string' ? option.default : ''
    default:
      return null
  }
}

function isSelectable(option, value) {
  return (option.items ?? []).some((item) => item.value === value)
}

function isValid(option, value, camp) {
  switch (option.type) {
    case 'periods':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((uri) => periodUris(camp).includes(uri))
      )
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return (
        typeof value === 'number' &&
        value >= (option.min ?? -Infinity) &&
        value <= (option.max ?? Infinity)
      )
    case 'select':
      return isSelectable(option, value)
    case 'text':
    case 'textarea':
      return typeof value === 'string'
    case 'image':
      return value === null || (typeof value === 'string' && value.startsWith('data:'))
    case 'pdf':
      return value === null || (!!value?.assetId && Array.isArray(value.pages))
    default:
      return false
  }
}

/**
 * @param schema list of { key, type, label, default, ... } describing the options of a section
 */
export function defaultOptions(schema, camp) {
  return Object.fromEntries(
    schema.map((option) => [option.key, defaultValue(option, camp)])
  )
}

export function repairOptions(options, schema, camp) {
  return Object.fromEntries(
    schema.flatMap((option) => {
      const value = options?.[option.key]
      const repaired = isValid(option, value, camp) ? value : defaultValue(option, camp)
      const fileName = options?.[imageFileNameKey(option)]
      return option.type === 'image' && repaired && typeof fileName === 'string'
        ? [
            [option.key, repaired],
            [imageFileNameKey(option), fileName],
          ]
        : [[option.key, repaired]]
    })
  )
}

/**
 * The value of an image option is only the picture, so the name of its file is kept
 * under a key of its own.
 */
export function imageFileNameKey(option) {
  return `${option.key}FileName`
}
