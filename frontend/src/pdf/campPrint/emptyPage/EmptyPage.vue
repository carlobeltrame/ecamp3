<template>
  <Page
    v-for="pageIndex in pageCount"
    :id="pageIndex === 1 ? id : undefined"
    :key="pageIndex"
    :size="config.options.pageSize || 'A4'"
    class="page"
    :class="{ 'page-compact': compact }"
  >
    <slot></slot>
    <TocSectionStartMarker v-if="pageIndex === 1" :id="id" />
    <View v-if="pageIndex === 1" :style="{ textAlign: content.options.alignment }">
      <Text v-if="content.options.heading" class="h1">{{ content.options.heading }}</Text>
      <Text v-if="content.options.text" class="empty-page-text">{{
        content.options.text
      }}</Text>
    </View>
  </Page>
</template>
<script>
import PdfComponent from '@/pdf/PdfComponent.js'
import TocSectionStartMarker from '../TocSectionStartMarker.vue'

export default {
  name: 'EmptyPage',
  components: { TocSectionStartMarker },
  extends: PdfComponent,
  props: {
    content: { type: Object, required: true },
    config: { type: Object, required: true },
  },
  computed: {
    pageCount() {
      return Math.max(1, Math.min(50, Number(this.content.options.pageCount) || 1))
    },
  },
}
</script>
<style lang="react-pdf">
.empty-page-text {
  margin-top: 8pt;
  line-height: 1.5;
}
</style>
