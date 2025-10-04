<template>
  <v-btn color="secondary" v-bind="$attrs" variant="text">
    {{ $t('global.button.cancel') }}
  </v-btn>
</template>

<script>
export default {
  name: 'ButtonCancel',
}
</script>
