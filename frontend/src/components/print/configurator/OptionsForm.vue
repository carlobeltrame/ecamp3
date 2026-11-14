<template>
  <div class="e-form-container">
    <p v-if="schema.length === 0" class="text-medium-emphasis">
      {{ $t('components.print.configurator.optionsForm.noOptions') }}
    </p>
    <template v-for="option in schema" :key="option.key">
      <e-select
        v-if="option.type === 'periods'"
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        :items="periods"
        multiple
        @update:model-value="update(option.key, $event)"
      />
      <e-checkbox
        v-else-if="option.type === 'boolean'"
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        @update:model-value="update(option.key, $event)"
      />
      <e-number-field
        v-else-if="option.type === 'number'"
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        :min="option.min"
        :max="option.max"
        :step="option.step"
        @update:model-value="updateNumber(option, $event)"
      />
      <e-select
        v-else-if="option.type === 'select'"
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        :items="option.items.map(({ value, label }) => ({ value, text: label }))"
        @update:model-value="update(option.key, $event)"
      />
      <e-textarea
        v-else-if="option.type === 'textarea'"
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        rows="4"
        @update:model-value="update(option.key, $event)"
      />
      <v-file-input
        v-else-if="option.type === 'image' || option.type === 'pdf'"
        :model-value="selectedFile(option)"
        :label="option.label"
        :accept="option.type === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg'"
        :hint="fileHint(option)"
        :error-messages="fileErrors[option.key]"
        persistent-hint
        variant="underlined"
        :prepend-icon="option.type === 'pdf' ? 'mdi-file-pdf-box' : 'mdi-image'"
        @update:model-value="uploadFile(option, $event)"
      />
      <e-text-field
        v-else
        :model-value="modelValue[option.key]"
        :label="option.label"
        :path="option.key"
        @update:model-value="update(option.key, $event)"
      />
    </template>
  </div>
</template>

<script>
import { deleteAsset, saveAsset } from '../generator/assetStore.js'
import { imageFileNameKey } from '../sections/optionsSchema.js'

const MAX_IMAGE_BYTES = 500_000

export default {
  name: 'OptionsForm',
  props: {
    modelValue: { type: Object, required: true },
    schema: { type: Array, required: true },
    camp: { type: Object, required: true },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      fileErrors: {},
    }
  },
  computed: {
    periods() {
      return this.camp.periods().items.map((period) => ({
        value: period._meta.self,
        text: period.description,
      }))
    },
  },
  methods: {
    update(key, value) {
      this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
    },
    updateImage(option, image, fileName) {
      const options = { ...this.modelValue, [option.key]: image }
      delete options[imageFileNameKey(option)]
      if (image) options[imageFileNameKey(option)] = fileName
      this.$emit('update:modelValue', options)
    },
    updateNumber(option, value) {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        this.update(option.key, value)
      }
    },
    fileHint(option) {
      const value = this.modelValue[option.key]
      if (option.type === 'pdf' && value) {
        return this.$t(
          'components.print.configurator.optionsForm.pdfPages',
          { count: value.pages.length },
          value.pages.length
        )
      }
      return ''
    },
    selectedFile(option) {
      const value = this.modelValue[option.key]
      if (!value) return null
      return new File(
        [],
        option.type === 'pdf'
          ? value.name
          : (this.modelValue[imageFileNameKey(option)] ??
              this.$t('components.print.configurator.optionsForm.imageWithoutName'))
      )
    },
    async uploadFile(option, files) {
      const file = Array.isArray(files) ? files[0] : files
      this.fileErrors[option.key] = []
      if (!file) {
        await this.removeFile(option)
        return
      }
      try {
        if (option.type === 'pdf') {
          this.update(option.key, await this.storePdf(option, file))
        } else {
          this.updateImage(option, await readImage(file), file.name)
        }
      } catch {
        this.fileErrors[option.key] = [
          this.$t(`components.print.configurator.optionsForm.${option.type}Error`),
        ]
      }
    },
    async removeFile(option) {
      const value = this.modelValue[option.key]
      if (!value) return
      if (option.type === 'pdf') {
        await deleteAsset(value.assetId)
        this.update(option.key, null)
      } else {
        this.updateImage(option, null)
      }
    },
    async storePdf(option, file) {
      const { PDFDocument } = await import('pdf-lib')
      const pdf = await PDFDocument.load(await file.arrayBuffer())
      const pages = pdf.getPages().map((page) => page.getSize())
      const previousAssetId = this.modelValue[option.key]?.assetId
      const assetId = await saveAsset(file)
      if (previousAssetId) await deleteAsset(previousAssetId)
      return { assetId, name: file.name, pages }
    },
  },
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error('Image is too large'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
</script>
