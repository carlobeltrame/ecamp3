<template>
  <v-subheader>
    {{ $tc('contentNode.columnLayout.entity.column.name') }}
    <v-progress-linear class="ml-3" buffer-value="100" :style="'flex-basis: ' + widthLeft + '0%'"/>
    <v-progress-linear value="100" :style="'flex-basis: ' + width + '0%'"/>
    <v-progress-linear buffer-value="100" :style="'flex-basis: ' + widthRight + '0%'"/>
  </v-subheader>
</template>
<script>
export default {
  name: 'mobile-column-width-indicator',
  props: {
    layoutMode: {},
    numColumns: {},
    width: {},
    widthLeft: {},
    widthRight: {}
  }
}
</script>
