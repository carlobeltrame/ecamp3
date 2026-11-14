<template>
  <v-list density="compact" class="py-0">
    <v-list-item
      :active="selected === null"
      prepend-icon="mdi-file-cog-outline"
      :title="$t('components.print.configurator.sectionList.document')"
      :subtitle="documentSummary"
      @click="$emit('update:selected', null)"
    />
    <v-divider />
    <draggable
      :model-value="contents"
      :item-key="() => undefined"
      handle=".e-section-list__handle"
      @update:model-value="$emit('update:contents', $event)"
      @end="$emit('update:selected', $event.newIndex)"
    >
      <template #item="{ element: content, index }">
        <v-list-item
          :key="index"
          :active="selected === index"
          :title="sections[content.type]?.title"
          @click="$emit('update:selected', index)"
        >
          <template #prepend>
            <v-icon class="e-section-list__handle" icon="mdi-drag" />
          </template>
          <template #append>
            <v-chip
              v-if="sections[content.type]?.origin === 'user'"
              size="x-small"
              class="mr-1"
              :text="$t('components.print.configurator.sectionList.custom')"
            />
            <v-btn
              icon="mdi-close"
              size="x-small"
              variant="text"
              :aria-label="$t('global.button.remove')"
              @click.stop="$emit('remove', index)"
            />
          </template>
        </v-list-item>
      </template>
    </draggable>
    <v-divider />
    <v-list-item
      prepend-icon="mdi-plus"
      :title="$t('components.print.configurator.sectionList.add')"
      @click="$emit('add')"
    />
  </v-list>
</template>

<script>
import Draggable from 'vuedraggable'

export default {
  name: 'SectionList',
  components: { Draggable },
  props: {
    contents: { type: Array, required: true },
    options: { type: Object, required: true },
    sections: { type: Object, required: true },
    selected: { type: Number, default: null },
  },
  emits: ['update:contents', 'update:selected', 'add', 'remove'],
  computed: {
    documentSummary() {
      return [
        this.options.pageSize,
        this.options.pageNumbers
          ? this.$t('components.print.configurator.sectionList.pageNumbers')
          : null,
        this.options.compact
          ? this.$t('components.print.configurator.sectionList.compact')
          : null,
      ]
        .filter((part) => part)
        .join(' · ')
    },
  },
}
</script>

<style scoped>
.e-section-list__handle {
  cursor: grab;
}
</style>
