import * as path from 'node:path'
import dayjs, { toDayjsLocale } from '@/common/helpers/dayjs.js'
import { createPdfRenderer } from '@/components/print/print-client/renderPdf.js'
import { prepare, twemojiPath } from '@/pdf/CampPrint.vue'
import { Font } from '@/pdf/renderer/index.js'

const eventTarget = new EventTarget()
for (const method of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
  globalThis[method] ??= eventTarget[method].bind(eventTarget)
}

export async function warmUp({ publicDir }) {
  await prepare()
  Font.registerEmojiSource({
    withVariationSelectors: true,
    builder: (code) => path.join(publicDir, twemojiPath(code)),
  })
}

export async function renderPdf(data, onProgress = async () => {}) {
  const language = data?.config?.language
  if (!language) {
    throw new Error('language was undefined in the print config')
  }
  dayjs.locale(toDayjsLocale(language))

  const { pdf } = await createPdfRenderer(data, onProgress)
  return readStream(await pdf.toStream())
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
  })
}
