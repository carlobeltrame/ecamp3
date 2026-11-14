<template>
  <div class="e-form-container">
    <e-checkbox
      :model-value="modelValue.pageNumbers"
      :label="$t('components.print.printConfigurator.pageNumbers')"
      @update:model-value="update('pageNumbers', $event)"
    />
    <e-checkbox
      :model-value="modelValue.compact"
      :label="$t('components.print.printConfigurator.compact')"
      @update:model-value="update('compact', $event)"
    />
    <e-select
      :model-value="modelValue.pageSize"
      class="mt-4"
      :items="pageSizes"
      :label="$t('components.print.printConfigurator.fontSize')"
      @update:model-value="update('pageSize', $event)"
    />
  </div>
</template>

<script>
export default {
  name: 'DocumentOptions',
  props: {
    modelValue: { type: Object, required: true },
  },
  emits: ['update:modelValue'],
  computed: {
    pageSizes() {
      return ['A5', 'A4', 'A3'].map((size) => ({
        value: size,
        text: this.$t(`components.print.printConfigurator.fontSizes.${size}`),
      }))
    },
  },
  methods: {
    update(key, value) {
      this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
    },
  },
}
</script>
