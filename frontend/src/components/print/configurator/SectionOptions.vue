<template>
  <div>
    <h3 class="text-subtitle-1 font-weight-bold">{{ section.title }}</h3>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ section.description }}</p>
    <component
      :is="section.optionsComponent"
      v-if="section.optionsComponent"
      :model-value="content.options"
      :camp="camp"
      @update:model-value="$emit('update:options', $event)"
    />
    <OptionsForm
      v-else
      :model-value="content.options"
      :schema="section.optionsSchema"
      :camp="camp"
      @update:model-value="$emit('update:options', $event)"
    />
  </div>
</template>

<script>
import OptionsForm from './OptionsForm.vue'

export default {
  name: 'SectionOptions',
  components: { OptionsForm },
  props: {
    content: { type: Object, required: true },
    section: { type: Object, required: true },
    camp: { type: Object, required: true },
  },
  emits: ['update:options'],
}
</script>
