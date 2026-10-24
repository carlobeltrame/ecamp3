import wrap from './minimalHalJsonVuex.js'
import createI18n from './i18n.js'
import { render, prepare } from '@/pdf/index.js'

export const createPdfRenderer = async (
  { config, storeData, translationData },
  onProgress
) => {
  await onProgress('setupTranslationsAndFonts')

  const { translate } = createI18n(translationData, storeData.lang.language)
  const store = wrap(storeData.api)

  if (typeof prepare === 'function') {
    await prepare(config)
  }

  config.camp = store.get(config.camp)
  const props = { config, store, $tc: translate, locale: storeData.lang.language }

  return { filename: config.documentName, pdf: render(props, onProgress) }
}

export const renderPdf = async (data, onProgress) => {
  const result = {
    filename: null,
    blob: null,
    error: null,
  }

  try {
    const { filename, pdf } = await createPdfRenderer(data, onProgress)
    result.filename = filename
    result.blob = await pdf.toBlob()
  } catch (error) {
    result.error = error
  }

  return result
}
