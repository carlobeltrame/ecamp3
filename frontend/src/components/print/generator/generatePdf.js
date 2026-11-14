import { prepareInMainThread } from '@/pdf/prepareInMainThread.js'
import { cloneDeep } from 'lodash-es'
import { proxy } from 'comlink'
import { endpointSymbol } from 'vite-plugin-comlink/symbol'
import jsonStringifyReactiveValue from '@/components/print/jsonStringifyReactiveValue.js'
import { isCustomSectionType } from '@/components/print/sections/customSectionType.js'
import { customSections } from '@/components/print/sections/customSections.js'

const RENDER_TIMEOUT_MS = 5 * 60 * 1000

/**
 * @param data.config the print config. Camp data is loaded from the API when config.apiGet is set.
 * @param data.storeData the store state holding the camp data
 * @param data.draftSections custom sections to use instead of the saved ones with the same id
 */
export const generatePdf = async (data, onProgress) => {
  if (data.config.apiGet) {
    await prepareInMainThread(data.config)
  }

  const serializableData = prepareDataForSerialization(data)
  const result = await dispatchRenderPdf(data, serializableData, onProgress)

  if (!result.error && Object.keys(result.insertedPages ?? {}).length > 0) {
    try {
      const { insertPdfPages } = await import('./insertPdfPages.js')
      result.blob = await insertPdfPages(result.blob, result.insertedPages)
    } catch (error) {
      result.error = `Error while inserting PDF pages: ${error.message}`
    }
  }

  return result
}

async function dispatchRenderPdf(data, serializableData, onProgress) {
  const hasCustomSections = serializableData.customSections.length > 0
  if (!hasCustomSections && !data.renderInWorker) {
    return (await import('./renderPdf.js')).renderPdf(serializableData, onProgress)
  }

  const instance = hasCustomSections ? customSectionsWorker() : defaultWorker()
  let timeout
  try {
    return await Promise.race([
      instance.renderPdfInWorker(serializableData, proxy(onProgress)),
      new Promise((resolve) => {
        timeout = setTimeout(
          () => resolve({ error: 'Rendering the PDF took too long.' }),
          RENDER_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    clearTimeout(timeout)
    instance[endpointSymbol].terminate()
  }
}

// ComlinkWorker is provided by vite-plugin-comlink
/* eslint-disable no-undef */
function defaultWorker() {
  return new ComlinkWorker(new URL('./renderPdf.worker.js', import.meta.url))
}

function customSectionsWorker() {
  return new ComlinkWorker(
    new URL('./renderCustomSectionsPdf.worker.js', import.meta.url)
  )
}
/* eslint-enable no-undef */

function prepareDataForSerialization(data) {
  const usedSections = usedCustomSections(data.config, data.draftSections)
  return {
    config: JSON.parse(
      jsonStringifyReactiveValue({
        ...replaceEntitiesWithRelativeUris(cloneDeep(data.config)),
        sectionTitles: Object.fromEntries(
          usedSections.map(({ id, title }) => [id, title])
        ),
      })
    ),
    storeData: JSON.parse(JSON.stringify(data.storeData)),
    translationData: JSON.parse(JSON.stringify(data.translationData)),
    customSections: JSON.parse(
      jsonStringifyReactiveValue(usedSections.map(({ id, files }) => ({ id, files })))
    ),
  }
}

function usedCustomSections(config, draftSections = []) {
  const types = new Set(config.contents.map((content) => content.type))
  return [...types]
    .filter((type) => isCustomSectionType(type))
    .map(
      (type) =>
        draftSections.find((section) => section.id === type) ?? customSections[type]
    )
    .filter((section) => section)
}

function replaceEntitiesWithRelativeUris(map) {
  Object.keys(map).forEach((key) => {
    const value = map[key]
    const relativeUri = relativeUriFor(value)
    if (relativeUri) {
      map[key] = relativeUri
    }
  })
  return map
}

function relativeUriFor(entity) {
  if (typeof entity !== 'function') {
    return entity
  }
  return entity()?._meta?.self
}
