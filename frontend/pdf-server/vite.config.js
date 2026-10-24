import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  vuePdfStylePlugin,
  vueStyleReactPdfPlugin,
} from '../src/pdf/vue-pdf-style-plugin.js'
import { htmlToPdfElementMap } from '../src/pdf/renderer/nodeOps.js'

const root = fileURLToPath(new URL('..', import.meta.url))

const FONT_FILE_PATH_PREFIX = '\0font-file-path:'

const outDir = 'pdf-server/dist'
let isBuild = false

const fontFilePathPlugin = {
  name: 'pdf-server-font-file-path',
  enforce: 'pre',
  configResolved(config) {
    isBuild = config.command === 'build'
  },
  async resolveId(source, importer) {
    if (!source.endsWith('.ttf')) return
    const resolved = await this.resolve(source, importer, { skipSelf: true })
    return resolved && FONT_FILE_PATH_PREFIX + resolved.id
  },
  load(id) {
    if (!id.startsWith(FONT_FILE_PATH_PREFIX)) return
    const fontFile = id.slice(FONT_FILE_PATH_PREFIX.length)
    if (!isBuild) {
      return `export default ${JSON.stringify(fontFile)}`
    }
    const relativeToBundle = path.relative(path.join(root, outDir), fontFile)
    return `import { fileURLToPath } from 'node:url'
      export default fileURLToPath(new URL(${JSON.stringify(relativeToBundle)}, import.meta.url))`
  },
}

const nodeResolvedPackages = /^(node:|vue$|@react-pdf\/|pdfkit$)/

export default defineConfig({
  root,
  publicDir: false,
  plugins: [
    fontFilePathPlugin,
    vueStyleReactPdfPlugin,
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => Object.keys(htmlToPdfElementMap).includes(tag),
        },
      },
    }),
    vuePdfStylePlugin,
  ],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(root, 'src') }],
    preserveSymlinks: true,
    conditions: ['node', 'module', 'development|production'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: 'esnext',
    lib: {
      entry: 'pdf-server/entry.js',
      formats: ['es'],
      fileName: () => 'entry.js',
    },
    rollupOptions: {
      external: nodeResolvedPackages,
    },
  },
})
