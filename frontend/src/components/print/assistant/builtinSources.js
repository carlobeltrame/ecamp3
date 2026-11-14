const sources = import.meta.glob(
  [
    '/src/pdf/**/*.{vue,js}',
    '/src/helpers/**/*.js',
    '!**/__tests__/**',
    '!/src/pdf/renderer/**',
    '!/src/pdf/vue-pdf-style-plugin.js',
    '!/src/helpers/{scheduleEntryRouteChange,selfXssWarning,serverError}.js',
  ],
  { query: '?raw', import: 'default' }
)

const toPath = (key) => key.replace(/^\/src\//, '')

export const builtinSourcePaths = Object.keys(sources)
  .filter((key) => key.startsWith('/src/pdf/'))
  .map(toPath)

/**
 * @param path path below the source directory, e.g. "pdf/campPrint/cover/Cover.vue"
 * @returns the source code of the file, or null if no such file can be read
 */
export async function readBuiltinSource(path) {
  const key = '/src/' + String(path).replace(/^(@\/|\/?src\/|\/)/, '')
  return key in sources ? sources[key]() : null
}
