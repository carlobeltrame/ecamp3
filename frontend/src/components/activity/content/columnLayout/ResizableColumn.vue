<template>
  <v-col class="resizable-col" :class="{ [widthClass]: true, 'layout-mode': layoutMode }">

    <resizable-column-header v-if="layoutMode && $vuetify.breakpoint.mdAndUp"
                             :column-height="columnHeight"
                             :last="last"
                             v-on="$listeners" />

    <mobile-column-width-indicator v-if="layoutMode && $vuetify.breakpoint.smAndDown && numColumns > 1"
                                   :num-columns="numColumns"
                                   :width="width"
                                   :width-left="widthLeft"
                                   :width-right="widthRight" />

    <slot />

    <v-row v-if="layoutMode"
           no-gutters
           justify="center"
           class="my-3">
      <v-menu bottom
              left
              offset-y>
        <template #activator="{ on, attrs }">
          <v-btn color="primary"
                 outlined
                 v-bind="attrs"
                 v-on="on">
            <v-icon left>mdi-plus-circle-outline</v-icon>
            {{ $tc('global.button.add') }}
          </v-btn>
        </template>
        <v-list>
          <v-list-item v-for="act in availableContentTypes"
                       :key="act.contentType.id"
                       @click="addContentNode(act.contentType.id)">
            <v-list-item-icon>
              <v-icon>{{ $tc(act.contentTypeIconKey) }}</v-icon>
            </v-list-item-icon>
            <v-list-item-title>
              {{ $tc(act.contentTypeNameKey) }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-row>
  </v-col>
</template>

<script>
import ResizableColumnHeader from '@/components/activity/content/columnLayout/ResizableColumnHeader.vue'
import MobileColumnWidthIndicator from '@/components/activity/content/columnLayout/MobileColumnWidthIndicator.vue'

export default {
  name: 'ResizableColumn',
  components: {
    MobileColumnWidthIndicator,
    ResizableColumnHeader
  },
  props: {
    layoutMode: { type: Boolean, required: true },
    widthLeft: { type: Number, required: true },
    width: { type: Number, required: true }, // the column width, in 1/12th units of the full width
    widthRight: { type: Number, required: true },
    numColumns: { type: Number, default: 1 },
    last: { type: Boolean, default: false }, // whether this is the last column
    minWidth: { type: Number, default: 3 }, // minimum allowed width of this column
    maxWidth: { type: Number, default: 12 } // maximum allowed width of this column
  },
  data () {
    return {
      startWidth: 0,
      startValue: this.width,
      columnHeight: 100,
      contentIds: []
    }
  },
  computed: {
    widthClass () {
      if (this.$vuetify.breakpoint.smAndDown) return 'col-12'
      return 'col-md-' + this.width
    }
  },
  updated () {
    this.columnHeight = this.$el.clientHeight
  }
}
</script>

<style scoped lang="scss">
.fullwidth {
  width: 100%;
}
.resizable-col {
  .content-node {
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0;
  }

  @media #{map-get($display-breakpoints, 'sm-and-down')} {
    border-bottom: 1px solid rgba(0, 0, 0, 0.32);
  }

  &:not(.layout-mode) {
    @media #{map-get($display-breakpoints, 'md-and-up')} {
      &+.resizable-col:not(.layout-mode) {
        border-left: 1px solid rgba(0, 0, 0, 0.12);
      }
    }
  }
}
</style>
