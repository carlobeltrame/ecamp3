import { compileScript, compileTemplate, parse, rewriteDefault } from '@vue/compiler-sfc'
import { htmlToPdfElementMap } from '@/pdf/renderer/nodeOps.js'
import { styleStore } from '@/pdf/renderer/styleStore.js'
import { parsePdfStyle } from '@/pdf/vue-pdf-style-plugin.js'
import { lockdownWorker } from './lockdownWorker.js'
import { transformModule } from './transformModule.js'
import { ENTRY_FILE } from '@/components/print/sections/entryFile.js'

const builtinModules = import.meta.glob([
  '/src/pdf/**/*.{vue,js}',
  '/src/helpers/**/*.js',
  '!**/__tests__/**',
  '!/src/pdf/vue-pdf-style-plugin.js',
  '!/src/helpers/{scheduleEntryRouteChange,selfXssWarning,serverError}.js',
])

const AsyncFunction = (async () => {}).constructor

/**
 * Compiles the source files of custom sections into Vue components.
 *
 * @param sections list of { id, files: { [fileName]: sourceCode } }
 * @returns an object mapping the section ids to their entry components
 */
export async function compileSections(sections) {
  lockdownWorker()

  const components = {}
  for (const section of sections) {
    const modules = new Map()
    components[section.id] = (await loadSectionFile(ENTRY_FILE, section, modules)).default
  }
  return components
}

function loadSectionFile(fileName, section, modules) {
  if (!modules.has(fileName)) {
    modules.set(fileName, evaluateSectionFile(fileName, section, modules))
  }
  return modules.get(fileName)
}

async function evaluateSectionFile(fileName, section, modules) {
  const source = section.files[fileName]
  if (typeof source !== 'string') {
    throw new Error(`The section has no file "${fileName}".`)
  }

  try {
    const code = fileName.endsWith('.vue')
      ? compileSingleFileComponent(source, fileName, section.id)
      : source
    const run = new AsyncFunction('__import', '__exports', transformModule(code))
    const exports = {}
    await run((specifier) => resolveImport(specifier, section, modules), exports)
    return exports
  } catch (error) {
    throw new Error(`${fileName}: ${error.message}`, { cause: error })
  }
}

async function resolveImport(specifier, section, modules) {
  if (specifier === 'vue') return import('vue')
  if (specifier === 'lodash-es') return import('lodash-es')
  if (specifier.startsWith('lodash-es/')) {
    const functionName = specifier.replace(/^lodash-es\/|\.js$/g, '')
    return { default: (await import('lodash-es'))[functionName] }
  }
  if (specifier.startsWith('./')) {
    return loadSectionFile(specifier.substring(2), section, modules)
  }
  const builtinModule = builtinModules[specifier.replace(/^@\//, '/src/')]
  if (specifier.startsWith('@/') && builtinModule) {
    return builtinModule()
  }
  throw new Error(
    `Cannot import "${specifier}". Only "vue", "lodash-es", files of this section ("./Name.vue") and existing files below "@/pdf/" and "@/helpers/" can be imported.`
  )
}

function compileSingleFileComponent(source, fileName, sectionId) {
  const compilerOptions = { isCustomElement: (tag) => tag in htmlToPdfElementMap }
  const { descriptor, errors } = parse(source, {
    filename: fileName,
    templateParseOptions: compilerOptions,
  })
  throwOnErrors(errors)

  const id = `${sectionId}-${fileName}`

  descriptor.styles
    .filter((style) => style.lang === 'react-pdf')
    .forEach((style) => registerStyles(parsePdfStyle(style.content)))

  if (descriptor.scriptSetup) {
    const script = compileScript(descriptor, {
      id,
      inlineTemplate: true,
      templateOptions: { compilerOptions },
    })
    return `${rewriteDefault(script.content, '__component')}\nexport default __component`
  }

  const script = descriptor.script ? compileScript(descriptor, { id }) : null
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: fileName,
    id,
    compilerOptions: { ...compilerOptions, bindingMetadata: script?.bindings },
  })
  throwOnErrors(template.errors)

  return [
    script ? rewriteDefault(script.content, '__component') : 'const __component = {}',
    template.code.replace(/^export (function|const) render/m, '$1 render'),
    '__component.render = render',
    'export default __component',
  ].join('\n')
}

function registerStyles(rulesBySelector) {
  Object.entries(rulesBySelector).forEach(([selector, rules]) => {
    styleStore[selector] = { ...styleStore[selector], ...rules }
  })
}

function throwOnErrors(errors) {
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message ?? String(error)).join('\n'))
  }
}
