<!--
Basic layout for print preview
-->

<template>
  <content-card :title="$t('views.camp.admin.print.title')" toolbar>
    <template #title-actions>
      <v-btn variant="text" @click="$refs.printConfigurator?.resetConfig()">
        <v-icon v-if="$vuetify.display.smAndUp" start>mdi-file-restore-outline</v-icon>
        {{ $t('global.button.reset') }}
      </v-btn>
    </template>
    <v-alert type="info" variant="tonal" class="ma-4">
      <i18n-t keypath="views.camp.admin.print.mergedLayoutsInfo" scope="global">
        <template #supportLink>
          <a :href="contactLink" target="_blank">
            {{ $t('views.camp.admin.print.contactSupport') }}
          </a>
        </template>
      </i18n-t>
    </v-alert>
    <print-configurator ref="printConfigurator" :camp="camp" />
  </content-card>
</template>

<script>
import ContentCard from '@/components/layout/ContentCard.vue'
import PrintConfigurator from '@/components/print/PrintConfigurator.vue'
import { getEnv } from '@/environment.js'

export default {
  name: 'CampAdminPrint',
  components: {
    ContentCard,
    PrintConfigurator,
  },
  props: {
    camp: { type: Object, required: true },
  },
  head() {
    return {
      title: this.$t('views.camp.admin.print.title'),
    }
  },
  computed: {
    contactLink() {
      return getEnv().CONTACT_LINK
    },
  },
}
</script>

<style scoped>
:deep(.v-toolbar-title .v-spacer) {
  flex-grow: 0;
}
</style>
