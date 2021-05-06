<template>
  <draggable v-model="localContentNodeIds"
             :disabled="!draggingEnabled"
             group="contentNodes"
             class="d-flex flex-column"
             :class="{ 'column-min-height': layoutMode }"
             @start="startDrag"
             @sort="finishDrag">
    <content-node v-for="id in draggableContentNodeIds"
                  :key="id"
                  class="content-node"
                  :content-node="allContentNodesById[id]"
                  :layout-mode="layoutMode"
                  :draggable="draggingEnabled" />
  </draggable>
</template>
<script>
import { sortBy } from 'lodash'
import Draggable from 'vuedraggable'

export default {
  name: 'DraggableContentNodes',
  components: {
    Draggable,
    // Lazy import necessary due to recursive component structure
    ContentNode: () => import('@/components/activity/ContentNode.vue')
  },
  props: {
    layoutMode: { type: Boolean, default: false },
    slotName: { type: String, required: true },
    allContentNodesById: { type: Object, default: () => {} }
  },
  data () {
    return {
      localContentNodeIds: this.contentNodeIds
    }
  },
  computed: {
    draggingEnabled () {
      return this.layoutMode && this.$vuetify.breakpoint.mdAndUp
    },
    contentNodeIds () {
      return sortBy(
        this.contentNode.children().items.filter(contentNode => contentNode.slot === this.slotName),
        'position'
      ).map(contentNode => contentNode.id)
    },
    draggableContentNodeIds () {
      return this.localContentNodeIds.filter(id => id in this.allContentNodesById)
    }
  },
  watch: {
    contentNodeIds () {
      this.localContentNodeIds = this.contentNodeIds
    }
  },
  methods: {
    startDrag () {
      document.body.classList.add('dragging')
    },
    finishDrag () {
      document.body.classList.remove('dragging')
      this.saveReorderedChildren()
    },
    async saveReorderedChildren () {
      let position = 0
      const payload = Object.fromEntries(this.draggableContentNodeIds.map(id => [id, { slot: this.slotName, position: position++ }]))
      this.api.patch(await this.api.href(this.contentNode, 'children'), payload)
    }
  }
}
</script>
<style scoped>
.column-min-height {
  min-height: 10rem;
}
</style>
