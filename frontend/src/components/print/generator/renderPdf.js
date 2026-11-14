import wrap from './minimalHalJsonVuex.js'
import createI18n from './i18n.js'
import { render, prepare } from '@/pdf/index.js'

/**
 * @param compileSections turns the sources of custom sections into components, see compileSections.js
 */
export const renderPdf = async (
  { config, storeData, translationData, customSections = [] },
  onProgress,
  compileSections = null
) => {
  const result = {
    filename: null,
    blob: null,
    error: null,
    pageCount: null,
    insertedPages: {},
  }

  try {
    await onProgress('setupTranslationsAndFonts')

    const { translate } = createI18n(translationData, storeData.lang.language)
    const store = wrap(storeData.api)

    if (typeof prepare === 'function') {
      await prepare(config)
    }

    if (customSections.length > 0 && !compileSections) {
      throw new Error('Custom sections cannot be rendered here.')
    }
    const customComponents =
      customSections.length > 0 ? await compileSections(customSections) : {}

    config.camp = store.get(config.camp)
    const props = {
      config,
      customComponents,
      store,
      $tc: translate,
      locale: storeData.lang.language,
      insertedPages: result.insertedPages,
    }

    result.filename = config.documentName
    result.blob = await render(props, (state, params) => {
      if (params?.totalPages) result.pageCount = params.totalPages
      return onProgress(state, params)
    }).toBlob()
  } catch (error) {
    result.error = error
  }

  return result
}
