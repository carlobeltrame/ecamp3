<template>
  <Page
    v-for="(page, pageIndex) in pages"
    :id="pageIndex === 0 ? id : undefined"
    :key="pageIndex"
    :size="config.options.pageSize || 'A4'"
    class="page"
    :class="{ 'page-compact': compact }"
  >
    <slot></slot>
    <TocSectionStartMarker v-if="pageIndex === 0" :id="id" />
    <View class="notes-page-header">
      <Text class="notes-page-title">{{ config.camp.title }}</Text>
      <Text>{{ page.date }}</Text>
    </View>
    <Svg :width="area.width" :height="area.height">
      <template v-if="content.options.lineStyle === 'dotted'">
        <template v-for="y in horizontals">
          <Circle v-for="x in verticals" :cx="x" :cy="y" r="0.6" fill="#888888" />
        </template>
      </template>
      <template v-else>
        <Line
          v-for="y in horizontals"
          :x1="0"
          :x2="area.width"
          :y1="y"
          :y2="y"
          stroke="#aaaaaa"
          stroke-width="0.5"
        />
        <template v-if="content.options.lineStyle === 'squared'">
          <Line
            v-for="x in verticals"
            :x1="x"
            :x2="x"
            :y1="0"
            :y2="area.height"
            stroke="#aaaaaa"
            stroke-width="0.5"
          />
        </template>
      </template>
    </Svg>
  </Page>
</template>
<script>
import PdfComponent from '@/pdf/PdfComponent.js'
import TocSectionStartMarker from '../TocSectionStartMarker.vue'
import sortBy from 'lodash-es/sortBy.js'
import range from 'lodash-es/range.js'

const PAGE_SIZES = { A5: [419.53, 595.28], A4: [595.28, 841.89], A3: [841.89, 1190.55] }
const HEADER_HEIGHT = 30
const SAFETY_MARGIN = 6

export default {
  name: 'NotesPage',
  components: { TocSectionStartMarker },
  extends: PdfComponent,
  props: {
    content: { type: Object, required: true },
    config: { type: Object, required: true },
  },
  computed: {
    pages() {
      if (!this.content.options.perDay) return [{ date: '' }]
      return (this.content.options.periods || []).flatMap((periodUri) =>
        sortBy(this.api.get(periodUri).days().items, 'number').map((day) => ({
          date: this.$date.utc(day.start).format('dd D.M.YYYY'),
        }))
      )
    },
    area() {
      const [width, height] = PAGE_SIZES[this.pageSize] ?? PAGE_SIZES.A4
      const padding = this.compact ? 30 : 42.5
      return {
        width: width - 2 * padding,
        height: height - 2 * padding - HEADER_HEIGHT - SAFETY_MARGIN,
      }
    },
    spacing() {
      return this.content.options.lineStyle === 'lined' ? 24 : 14.17
    },
    horizontals() {
      return range(this.spacing, this.area.height, this.spacing)
    },
    verticals() {
      return range(0, this.area.width + 0.1, this.spacing)
    },
  },
}
</script>
<style lang="react-pdf">
.notes-page-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  height: 30pt;
  font-size: 10pt;
}
.notes-page-title {
  font-weight: 600;
}
</style>
