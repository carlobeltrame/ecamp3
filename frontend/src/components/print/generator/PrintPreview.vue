<template>
  <div style="position: relative">
    <iframe
      :src="urlWithPagemodes"
      :title="$t('components.print.generator.printPreview.previewIframeTitle')"
      class="d-block"
      v-bind="$attrs"
    />
    <div v-if="loading || error" class="e-print-preview__overlay text-white">
      <div v-if="error">
        {{ $t('components.print.generator.printPreview.previewError') }}
      </div>
      <div v-else class="d-flex flex-column gap-3 align-center h-100 justify-center">
        <v-progress-circular :model-value="progress" size="24"></v-progress-circular>
        <div>{{ state }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { generatePdf } from './generatePdf.js'
import { generatePdfMixin } from './generatePdfMixin.js'
import { componentI18n } from '@/plugins/index.js'
import { useToast } from '@/components/toast/useToast.js'

const RENDER_IN_WORKER = true

export default {
  name: 'PrintPreview',
  mixins: [generatePdfMixin],
  props: {
    config: {
      type: Object,
      default: () => ({}),
    },
    draftSections: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['rendered'],
  setup() {
    const toast = useToast()
    return { toast }
  },
  data() {
    return {
      url: null,
      preventingMultiple: false,
      error: null,
    }
  },
  computed: {
    language() {
      return this.$store.state.lang.language
    },
    urlWithPagemodes() {
      if (!this.url) return null
      return this.url + '#navpanes=0&pagemode=none'
    },
  },
  watch: {
    config: {
      immediate: true,
      deep: true,
      handler() {
        this.generatePdf()
      },
    },
    language: {
      immediate: true,
      handler() {
        this.generatePdf()
      },
    },
  },
  unmounted() {
    this.revokeOldObjectUrl()
  },
  methods: {
    async generatePdf() {
      if (this.loading) {
        this.preventingMultiple = true
        return
      }

      this.loading = true
      this.error = null
      this.revokeOldObjectUrl()
      this.setProgress(0, 'loadingData')

      const { error, blob, pageCount } = await generatePdf(
        {
          config: { ...this.config, apiGet: this.api.get.bind(this) },
          storeData: this.$store.state,
          translationData: componentI18n.messages.value,
          draftSections: this.draftSections,
          renderInWorker: RENDER_IN_WORKER,
        },
        this.onProgress.bind(this)
      )

      if (error) {
        this.error = error
        console.log(error)
        this.setProgress(100, 'failed')
      } else {
        this.url = URL.createObjectURL(blob)
        this.$emit('rendered', { pageCount })
        this.setProgress(100, 'done')
      }

      this.loading = false
      if (this.preventingMultiple) {
        this.preventingMultiple = false
        this.generatePdf()
      }
    },
    revokeOldObjectUrl() {
      const oldUrl = this.url
      if (oldUrl) {
        this.url = null
        URL.revokeObjectURL(oldUrl)
      }
    },
  },
}
</script>

<style scoped>
.e-print-preview__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgb(0, 0, 0, 0.32);
}
</style>
