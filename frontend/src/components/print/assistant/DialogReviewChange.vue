<template>
  <v-dialog
    :model-value="true"
    max-width="1200"
    scrollable
    @update:model-value="$emit('close')"
  >
    <v-card
      :title="
        $t('components.print.assistant.dialogReviewChange.title', {
          section: change.section.title,
        })
      "
    >
      <v-card-text>
        <p class="mb-4">{{ change.summary }}</p>
        <div class="e-review-change__body">
          <OptionsForm
            v-if="change.section.options.length > 0"
            v-model="options"
            class="e-review-change__options"
            :schema="change.section.options"
            :camp="camp"
          />
          <div class="e-review-change__previews">
            <div v-if="!change.isNew">
              <h4>
                {{ $t('components.print.assistant.dialogReviewChange.before') }}
                <span v-if="pageCounts.before" class="font-weight-regular">
                  · {{ pages(pageCounts.before) }}
                </span>
              </h4>
              <PrintPreview
                :config="beforeConfig"
                width="100%"
                height="560"
                @rendered="pageCounts.before = $event.pageCount"
              />
            </div>
            <div>
              <h4>
                {{ $t('components.print.assistant.dialogReviewChange.after') }}
                <span v-if="pageCounts.after" class="font-weight-regular">
                  · {{ pages(pageCounts.after) }}
                </span>
              </h4>
              <PrintPreview
                :config="afterConfig"
                :draft-sections="[change.section]"
                width="100%"
                height="560"
                @rendered="pageCounts.after = $event.pageCount"
              />
            </div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :text="$t('global.button.close')" @click="$emit('close')" />
        <v-btn
          :text="$t('components.print.assistant.dialogReviewChange.reject')"
          @click="$emit('reject')"
        />
        <v-btn
          color="primary"
          variant="flat"
          :text="$t('components.print.assistant.dialogReviewChange.accept')"
          @click="$emit('accept', options)"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import OptionsForm from '../configurator/OptionsForm.vue'
import PrintPreview from '../generator/PrintPreview.vue'
import { repairOptions } from '../sections/optionsSchema.js'

export default {
  name: 'DialogReviewChange',
  components: { OptionsForm, PrintPreview },
  props: {
    change: { type: Object, required: true },
    config: { type: Object, required: true },
    camp: { type: Object, required: true },
  },
  emits: ['accept', 'reject', 'close'],
  data() {
    const { section } = this.change
    const current = this.config.contents.find((content) => content.type === section.id)
    const currentOptions = repairOptions(current?.options, section.options, this.camp)
    return {
      pageCounts: { before: null, after: null },
      currentOptions,
      options: currentOptions,
    }
  },
  computed: {
    beforeConfig() {
      return this.previewConfig(this.currentOptions)
    },
    afterConfig() {
      return this.previewConfig(this.options)
    },
  },
  methods: {
    previewConfig(options) {
      return {
        ...this.config,
        contents: [{ type: this.change.section.id, options }],
      }
    },
    pages(count) {
      return this.$t(
        'components.print.assistant.dialogReviewChange.pages',
        { count },
        count
      )
    },
  },
}
</script>

<style scoped>
.e-review-change__body {
  display: flex;
  gap: 24px;
}

.e-review-change__options {
  flex: 0 0 280px;
}

.e-review-change__previews {
  flex: 1 1 0;
}

.e-review-change__previews {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 16px;
}
</style>
