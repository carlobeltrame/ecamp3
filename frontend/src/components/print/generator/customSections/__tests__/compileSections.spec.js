import { describe, expect, it, vi } from 'vitest'
import { compileSections } from '../compileSections.js'
import { renderVueToPdfStructure } from '@/pdf/renderer/vueRenderer.js'
import { h } from 'vue'

vi.mock('../lockdownWorker.js', () => ({ lockdownWorker: vi.fn() }))

const section = {
  id: 'custom-1',
  files: {
    'Section.vue': `
      <template>
        <Page :id="id" class="page">
          <Greeting v-for="name in sorted" :key="name" :name="name" />
        </Page>
      </template>
      <script>
      import PdfComponent from '@/pdf/PdfComponent.js'
      import sortBy from 'lodash-es/sortBy.js'
      import Greeting from './Greeting.vue'
      import { PREFIX } from './constants.js'

      export default {
        name: 'Greetings',
        components: { Greeting },
        extends: PdfComponent,
        props: { content: { type: Object, required: true } },
        computed: {
          sorted() {
            return sortBy(this.content.options.names).map((name) => PREFIX + name)
          },
        },
      }
      </script>`,
    'Greeting.vue': `
      <template>
        <Text class="custom-greeting">{{ name }}</Text>
      </template>
      <script setup>
      defineProps({ name: { type: String, required: true } })
      </script>
      <style lang="react-pdf">
      .custom-greeting {
        font-size: 7pt;
      }
      </style>`,
    'constants.js': `export const PREFIX = 'Hello '`,
  },
}

function render(component, options) {
  const Document = {
    render: () => h('Document', [h(component, { content: { options }, id: 'entry-0' })]),
  }
  return renderVueToPdfStructure(Document, { $tc: (key) => key })
}

describe('compileSections', () => {
  it('compiles a section of several files into a renderable component', async () => {
    const components = await compileSections([section])

    const [page] = render(components['custom-1'], { names: ['Zoe', 'Adam'] }).children

    expect(page.type).toBe('PAGE')
    expect(page.children.map((text) => text.children[0].value)).toEqual([
      'Hello Adam',
      'Hello Zoe',
    ])
    expect(page.children[0].style).toEqual({ fontSize: '7pt' })
  })

  it('reports the file in which the compilation failed', async () => {
    const broken = {
      id: 'custom-2',
      files: {
        ...section.files,
        'Greeting.vue': '<template><Text>{{ </Text></template>',
      },
    }

    await expect(compileSections([broken])).rejects.toThrow(/Greeting\.vue/)
  })

  it('refuses imports from outside of the PDF code', async () => {
    const importing = (specifier) => ({
      id: 'custom-3',
      files: { 'Section.vue': `<script>import x from '${specifier}'</script>` },
    })

    await expect(compileSections([importing('axios')])).rejects.toThrow(/Cannot import/)
    await expect(
      compileSections([importing('@/plugins/store/index.js')])
    ).rejects.toThrow(/Cannot import/)
  })

  it('requires the entry file', async () => {
    await expect(compileSections([{ id: 'custom-4', files: {} }])).rejects.toThrow(
      /Section\.vue/
    )
  })
})
