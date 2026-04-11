<template>
  <DetailPane
    v-model="dialogOpen"
    max-width="900px"
    :title="$t('components.print.config.dialogScheduleEntryFilter.title')"
    icon="mdi-filter"
    :cancel-action="close"
    :cancel-visible="false"
    @update:model-value="emit"
  >
    <template #activator="{ props }">
      <v-chip
        label
        variant="outlined"
        :color="anyFilter ? 'primary' : 'secondary'"
        border="sm"
        class="align-self-stretch mt-4 mb-4"
        v-bind="props"
      >
        <v-icon start size="20">mdi-filter</v-icon>
        <span class="flex-grow-1 text-center">{{ activatorLabel }}</span>
      </v-chip>
    </template>
    <ScheduleEntryFilters
      v-model="localFilter"
      :camp="camp"
      :filter-fn="filterFn"
      :loading-endpoints="{}"
      :hide-self-filter="isOutsider"
      :hide-period-filter="hidePeriodFilter"
      :hide-day-filter="hideDayFilter"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <template #moreActions>
      {{ resultCountLabel }}
    </template>
  </DetailPane>
</template>
<script>
import ScheduleEntryFilters from '../../program/ScheduleEntryFilters.vue'
import DetailPane from '../../generic/DetailPane.vue'
import { campRoleMixin } from '../../../mixins/campRoleMixin.js'

export default {
  name: 'DialogScheduleEntryFilter',
  components: { DetailPane, ScheduleEntryFilters },
  mixins: [campRoleMixin],
  props: {
    camp: { type: Object, required: true },
    filterFn: { type: Function, required: true },
    modelValue: { type: Object, required: true },
    hidePeriodFilter: { type: Boolean, default: false },
    hideDayFilter: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      dialogOpen: false,
      localFilter: this.modelValue,
    }
  },
  computed: {
    filteredCount() {
      return this.filterFn(this.localFilter).length
    },
    activatorLabel() {
      if (this.anyFilter)
        return this.$t('components.print.config.dialogScheduleEntryFilter.filterActive', {
          filtered: this.filteredCount,
          total: this.filterFn({}).length,
        })
      return this.$t(
        'components.print.config.dialogScheduleEntryFilter.filterActivities',
        {
          total: this.filterFn({}).length,
        }
      )
    },
    resultCountLabel() {
      return this.$t(
        'components.print.config.dialogScheduleEntryFilter.resultCount',
        { filtered: this.filteredCount, total: this.filterFn({}).length },
        1
      )
    },
    anyFilter() {
      return (
        this.localFilter.period ||
        (this.localFilter.day != null && this.localFilter.day.length > 0) ||
        (this.localFilter.responsible != null &&
          this.localFilter.responsible.length > 0) ||
        (this.localFilter.category != null && this.localFilter.category.length > 0) ||
        (this.localFilter.progressLabel != null &&
          this.localFilter.progressLabel.length > 0)
      )
    },
  },
  watch: {
    filteredCount: {
      handler(val) {
        this.localFilter.activityCount = val
        this.$emit('update:modelValue', this.localFilter)
      },
      immediate: true,
    },
  },
  methods: {
    emit(dialogOpen) {
      if (dialogOpen) return // only emit when closing dialog
      this.$emit('update:modelValue', this.localFilter)
    },
    close() {
      this.dialogOpen = false
      this.emit()
    },
  },
}
</script>
<style scoped>
:deep(.v-chip__content) {
  width: 100%;
}
</style>
