const PREFIX = 'custom-'

export function isCustomSectionType(type) {
  return typeof type === 'string' && type.startsWith(PREFIX)
}

export function newCustomSectionType() {
  return PREFIX + crypto.randomUUID()
}
