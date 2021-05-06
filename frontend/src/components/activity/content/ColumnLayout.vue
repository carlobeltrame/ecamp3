<template>
  <v-row v-if="!contentNode.loading" no-gutters>
    <resizable-column v-for="(_, slot) in columns"
                      :key="slot"
                      :layout-mode="layoutMode"
                      :width-left="relativeColumnWidths[slot][0]"
                      :width="relativeColumnWidths[slot][1]"
                      :width-right="relativeColumnWidths[slot][2]"
                      :num-columns="numColumns"
                      :last="slot === lastColumn"
                      :min-width="minWidth(slot)"
                      :max-width="maxWidth(slot)"
                      @add-content-node="contentNodeId => addContentNode(slot, contentNodeId)"
                      @resizing="newWidth => resizeColumn(slot, newWidth)"
                      @resize-stop="saveColumnWidths">
      <draggable-content-nodes :slot-name="slot"
                               :layout-mode="layoutMode"
                               :content-node="contentNode"
                               :all-content-nodes-by-id="allContentNodesById" />
    </resizable-column>
  </v-row>
</template>

<script>
import { keyBy, camelCase, mapValues, reduce } from 'lodash'
import { contentNodeMixin } from '@/mixins/contentNodeMixin.js'
import ResizableColumn from '@/components/activity/content/columnLayout/ResizableColumn.vue'
import DraggableContentNodes from '@/components/activity/content/columnLayout/DraggableContentNodes.vue'

function cumulativeSumReducer (cumSum, nextElement) {
  cumSum.push((cumSum[cumSum.length - 1] + nextElement))
  return cumSum
}

export default {
  name: 'ColumnLayout',
  components: {
    ResizableColumn,
    DraggableContentNodes
  },
  mixins: [contentNodeMixin],
  data () {
    return {
      localColumnWidths: {}
    }
  },
  computed: {
    allContentNodesById () {
      return keyBy(this.contentNode.owner().contentNodes().items, 'id')
    },
    columns () {
      return keyBy(this.contentNode.jsonConfig?.columns || [], 'slot')
    },
    numColumns () {
      return this.contentNode.jsonConfig?.columns?.length || 0
    },
    lastColumn () {
      const slots = Object.keys(this.columns)
      return slots[slots.length - 1]
    },
    relativeColumnWidths () {
      const columnWidths = mapValues(this.columns, 'width')
      // Cumulative sum of column widths, to know how many "width units" are to the left of each column
      // E.g. [0, 3, 8, 12] if there are three columns of width 3, 5, 4
      const cumSum = reduce(columnWidths, (cumSum, width, slot) => , {})
      const cumSum = Object.values(columnWidths).reduce(cumulativeSumReducer, [0])
      // Map the cumulative sum values to the slot names. This says "how wide are the columns on the left of this one?"
      // E.g. {'1': 0, '2': 3, '3': 8}
      const colsLeft = Object.fromEntries(Object.entries(columnWidths).map(([slot, width], idx) => [slot, cumSum[idx]]))
      // Also prepare the column width itself and the number of "width units" to the right of each column
      // E.g. {'1': [0, 3, 9], '2': [3, 5, 4], '3': [8, 4, 0]}
      return mapValues(columnWidths, (width, slot) => [colsLeft[slot], width, 12 - colsLeft[slot] - width])
    },
    availableContentTypes () {
      return this.contentNode.ownerCategory().preferredContentTypes().items.map(ct => ({
        id: ct.id,
        contentType: ct,
        contentTypeNameKey: 'contentNode.' + camelCase(ct.name) + '.name',
        contentTypeIconKey: 'contentNode.' + camelCase(ct.name) + '.icon'
      }))
    }
  },
  mounted () {
    this.contentNode._meta.load.then(() => { this.localColumnWidths = mapValues(this.columns, 'width') })
  },
  methods: {
    resizeColumn (slot, width) {
      const oldWidth = this.localColumnWidths[slot]
      const diff = width - oldWidth
      const nextSlot = this.next(slot)
      this.localColumnWidths[slot] = width
      this.localColumnWidths[nextSlot] = this.localColumnWidths[nextSlot] - diff
    },
    next (slot) {
      const slots = Object.keys(this.columns)
      const index = slots.findIndex(s => s === slot)
      if (index === -1 || index === slots.length - 1) return undefined
      return slots[index + 1]
    },
    minWidth (_) {
      return 3
    },
    maxWidth (slot) {
      const nextSlot = this.next(slot)
      if (nextSlot === undefined) return this.localColumnWidths[slot]
      return this.localColumnWidths[slot] + this.localColumnWidths[nextSlot] - this.minWidth(nextSlot)
    },
    async addContentNode (slot, contentTypeId) {
      await this.contentNode.children().$post({
        parentId: this.contentNode.id,
        contentTypeId: contentTypeId,
        slot: slot
      })
      this.contentNode.owner().children().$reload()
    },
    async saveColumnWidths () {
      const payload = {
        jsonConfig: {
          ...this.contentNode.jsonConfig,
          columns: this.contentNode.jsonConfig.columns.map(column => ({
            ...column,
            width: this.localColumnWidths[column.slot]
          }))
        }
      }
      this.api.patch(this.contentNode, payload)
    }
  }
}
</script>
