<template>
  <Link class="toc-entry" :href="`#${id}`">
    <Text>{{ title }}</Text>
    <TocEntryPageNumber v-if="config.options.pageNumbers" :id="id" />
  </Link>
</template>
<script>
import PdfComponent from '@/pdf/PdfComponent.js'
import TocEntryPageNumber from '../TocEntryPageNumber.vue'
import camelCase from 'lodash-es/camelCase.js'

export default {
  name: 'TitleEntry',
  components: { TocEntryPageNumber },
  extends: PdfComponent,
  props: {
    type: { type: String, required: true },
    config: { type: Object, required: true },
  },
  computed: {
    title() {
      return (
        this.config.sectionTitles?.[this.type] ??
        this.$tc(`print.${camelCase(this.type)}.title`)
      )
    },
  },
}
</script>
<style lang="react-pdf"></style>
