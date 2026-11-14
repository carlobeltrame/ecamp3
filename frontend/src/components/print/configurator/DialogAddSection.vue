<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card :title="$t('components.print.configurator.dialogAddSection.title')">
      <v-card-text class="pt-0">
        <v-text-field
          v-model="search"
          :label="$t('components.print.configurator.dialogAddSection.search')"
          prepend-inner-icon="mdi-magnify"
          variant="underlined"
          clearable
          autofocus
          hide-details
        />
        <v-list lines="two" density="compact">
          <template v-for="group in groups" :key="group.origin">
            <v-list-subheader>
              {{
                $t(
                  `components.print.configurator.dialogAddSection.origin.${group.origin}`
                )
              }}
            </v-list-subheader>
            <v-list-item
              v-for="section in group.sections"
              :key="section.type"
              :title="section.title"
              :subtitle="section.description"
              @click="add(section)"
            >
              <template #append>
                <v-btn
                  v-if="section.origin === 'user'"
                  icon="mdi-delete-outline"
                  size="small"
                  variant="text"
                  :aria-label="$t('global.button.delete')"
                  @click.stop="$emit('delete', section)"
                />
              </template>
            </v-list-item>
          </template>
          <v-list-item
            prepend-icon="mdi-creation-outline"
            :title="$t('components.print.configurator.dialogAddSection.newWithAssistant')"
            :subtitle="
              $t('components.print.configurator.dialogAddSection.newWithAssistantHint')
            "
            @click="askAssistant"
          />
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :text="$t('global.button.cancel')" @click="close" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: 'DialogAddSection',
  props: {
    modelValue: { type: Boolean, required: true },
    sections: { type: Object, required: true },
  },
  emits: ['update:modelValue', 'add', 'delete', 'askAssistant'],
  data() {
    return {
      search: '',
    }
  },
  computed: {
    groups() {
      const words = (this.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      const matches = (section) => {
        const text = `${section.title} ${section.description}`.toLowerCase()
        return words.every((word) => text.includes(word))
      }
      return ['ecamp', 'user']
        .map((origin) => ({
          origin,
          sections: Object.values(this.sections).filter(
            (section) => section.origin === origin && matches(section)
          ),
        }))
        .filter((group) => group.sections.length > 0)
    },
  },
  methods: {
    add(section) {
      this.$emit('add', section)
      this.close()
    },
    askAssistant() {
      this.$emit('askAssistant')
      this.close()
    },
    close() {
      this.$emit('update:modelValue', false)
    },
  },
}
</script>
