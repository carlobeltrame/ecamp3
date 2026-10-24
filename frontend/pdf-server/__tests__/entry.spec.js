import { beforeAll, describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { renderPdf, warmUp } from '../entry.js'
import fullCampStoreContent from '@/pdf/renderer/__tests__/fullCampStoreContent.json'
import en from '@/common/locales/en.json'

const publicDir = path.resolve('public')

const renderConfig = (contents) => ({
  config: {
    language: 'en',
    documentName: 'Pfila 2023.pdf',
    options: { pageNumbers: true, pageSize: 'A4' },
    camp: '/camps/c4cca3a51342',
    contents,
  },
  storeData: {
    lang: { language: 'en' },
    api: fullCampStoreContent,
  },
  translationData: { en },
})

describe('pdf server entry', () => {
  beforeAll(async () => {
    await warmUp({ publicDir })
  })

  it('renders a pdf in Node.js', async () => {
    const progress = []

    const pdf = await renderPdf(
      renderConfig([
        { type: 'Cover', options: {} },
        {
          type: 'Picasso',
          options: {
            periods: ['/periods/16b2fcffdd8e'],
            orientation: 'L',
            filter: {
              period: null,
              responsible: [],
              day: [],
              progressLabel: [],
              category: [],
            },
          },
        },
      ]),
      async (state) => progress.push(state)
    )

    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-')
    expect(progress).toContain('layoutDocument')
    expect(progress).toContain('renderingPdfPage')
  })

  it('reports an error for a missing language', async () => {
    const data = renderConfig([{ type: 'Cover', options: {} }])
    delete data.config.language

    await expect(renderPdf(data)).rejects.toThrow('language was undefined')
  })
})
