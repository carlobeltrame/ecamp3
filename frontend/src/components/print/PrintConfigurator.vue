<template>
  <v-skeleton-loader v-if="loading" type="article" />
  <div v-else>
    <PagesOverview v-model="cnf.contents" @update:model-value="onChange">
      <template #item="{ element: content, index: idx }">
        <PagesConfig
          :title="$t('components.print.printConfigurator.config.' + content.type)"
          :landscape="content.options.orientation === 'L'"
          :multiple="
            contentComponents[content.type].design.multiple ||
            content.options?.periods?.length > 1
          "
          @remove="removeContent(idx)"
        >
          <component
            :is="contentComponents[content.type]"
            :model-value="content.options"
            :camp="camp"
            @update:model-value="onChangeContentConfig(idx, $event)"
          />
        </PagesConfig>
      </template>

      <v-menu offset-y rounded="lg" offset-overflow>
        <template #activator="{ props }">
          <PagesConfig
            id="page-config"
            :title="$t('components.print.printConfigurator.add')"
            multiple
            template
            v-bind="props"
          />
        </template>
        <v-list>
          <v-list-item
            v-for="(component, idx) in contentComponents"
            :key="idx"
            @click="
              addContent({
                type: idx,
                options: component.defaultOptions(camp),
              })
            "
          >
            <v-list-item-title>
              {{ $t('components.print.printConfigurator.config.' + idx) }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <template #drawer>
        <v-expansion-panels flat class="e-print-configurator__cnf">
          <v-expansion-panel class="bg-transparent rounded-0">
            <v-expansion-panel-title class="subtitle py-2"
              >{{ $t('components.print.printConfigurator.options') }}
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <e-checkbox
                v-model="cnf.options.pageNumbers"
                :label="$t('components.print.printConfigurator.pageNumbers')"
                @update:model-value="onChange"
              />
              <e-select
                v-model="cnf.options.pageSize"
                class="mt-4"
                :items="pageSizes"
                :label="$t('components.print.printConfigurator.fontSize')"
                @update:model-value="onChange"
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <v-expansion-panels v-if="isDev" flat class="e-print-configurator__cnf">
          <v-expansion-panel class="bg-transparent rounded-0">
            <v-expansion-panel-title class="subtitle py-2"
              >View Print-Config
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <pre style="font-size: 12px">{{ prettyConfig }}</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </template>
    </PagesOverview>

    <v-card-text class="e-button-container">
      <DownloadNuxtPdfButton :config="cnf" />
      <DownloadClientPdfButton :config="cnf" />
    </v-card-text>

    <template v-if="isDev">
      <v-tabs v-model="previewTab" class="px-4">
        <v-tab>Nuxt preview</v-tab>
        <v-tab>Client print preview</v-tab>
      </v-tabs>
      <v-tabs-window v-model="previewTab">
        <v-tabs-window-item>
          <print-preview-nuxt
            v-if="previewTab === 0"
            :config="cnf"
            width="100%"
            height="600"
            class="my-4"
          />
        </v-tabs-window-item>
        <v-tabs-window-item>
          <print-preview-client
            v-if="previewTab === 1"
            :config="cnf"
            width="100%"
            height="600"
            class="my-4"
          />
        </v-tabs-window-item>
      </v-tabs-window>
    </template>
  </div>
</template>

<script>
import PrintPreviewClient from './print-client/PrintPreviewClient.vue'
import PrintPreviewNuxt from './print-nuxt/PrintPreviewNuxt.vue'
import CoverConfig from './config/CoverConfig.vue'
import PicassoConfig from './config/PicassoConfig.vue'
import SummaryConfig from './config/SummaryConfig.vue'
import ProgramConfig from './config/ProgramConfig.vue'
import ActivityConfig from './config/ActivityConfig.vue'
import ActivityListConfig from './config/ActivityListConfig.vue'
import TocConfig from './config/TocConfig.vue'
import PagesOverview from './configurator/PagesOverview.vue'
import PagesConfig from './configurator/PagesConfig.vue'
import DownloadNuxtPdfButton from '@/components/print/print-nuxt/DownloadNuxtPdfButton.vue'
import DownloadClientPdfButton from '@/components/print/print-client/DownloadClientPdfButton.vue'
import { getEnv } from '@/environment.js'
import cloneDeep from 'lodash-es/cloneDeep'
import { componentI18n } from '../../plugins/i18n/index.js'
import repairConfig from './repairPrintConfig.js'
import StoryConfig from '@/components/print/config/StoryConfig.vue'
import SafetyConsiderationsConfig from '@/components/print/config/SafetyConsiderationsConfig.vue'
import campShortTitle from '@/common/helpers/campShortTitle.js'
import jsonStringifyReactiveValue from '@/components/print/jsonStringifyReactiveValue.js'

export default {
  name: 'PrintConfigurator',
  components: {
    DownloadClientPdfButton,
    DownloadNuxtPdfButton,
    PagesConfig,
    PagesOverview,
    PrintPreviewClient,
    PrintPreviewNuxt,
    CoverConfig,
    PicassoConfig,
    SummaryConfig,
    ProgramConfig,
    ActivityConfig,
    TocConfig,
    ActivityListConfig,
  },
  props: {
    camp: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      loading: true,
      previewTab: null,
    }
  },
  computed: {
    contentComponents() {
      return {
        Cover: CoverConfig,
        Picasso: PicassoConfig,
        Story: StoryConfig,
        SafetyConsiderations: SafetyConsiderationsConfig,
        Program: ProgramConfig,
        Activity: ActivityConfig,
        Toc: TocConfig,
        ActivityList: ActivityListConfig,
      }
    },
    lang() {
      return this.$store.state.lang.language
    },
    cnf() {
      return this.repairConfig(
        this.$store.getters.getLastPrintConfig(this.camp._meta.self, {
          language: this.lang,
          documentName: campShortTitle(this.camp),
          options: { pageNumbers: false, pageSize: 'A4' },
          camp: this.camp._meta.self,
          contents: this.defaultContents(),
        })
      )
    },
    pageSizes() {
      return ['A5', 'A4'].map((size) => ({
        value: size,
        text: this.$t(`components.print.printConfigurator.fontSizes.${size}`),
      }))
    },
    isDev() {
      return getEnv().FEATURE_DEVELOPER ?? false
    },
    prettyConfig() {
      return jsonStringifyReactiveValue(this.cnf, 2)
    },
  },
  watch: {
    lang: {
      handler(language) {
        this.cnf.language = language
      },
      immediate: true,
    },
  },
  async mounted() {
    await this.camp.periods().$reload()
    await Promise.all([
      ...this.camp
        .periods()
        .items.flatMap((period) => [
          period.days().$reload(),
          period.contentNodes().$reload(),
        ]),
      this.camp.activities().$reload(),
      this.camp.categories().$reload(),
    ])
    this.loading = false
  },
  methods: {
    resetConfig() {
      this.$store.commit('setLastPrintConfig', {
        campUri: this.camp._meta.self,
        printConfig: undefined,
      })
    },
    defaultContents() {
      const contents = [
        {
          type: 'Cover',
          options: {},
        },
        {
          type: 'Picasso',
          options: {
            periods: this.camp.periods().items.map((period) => period._meta.self),
            orientation: 'L',
          },
        },
      ]

      this.camp.periods().items.forEach((period) => {
        contents.push({
          type: 'Story',
          options: {
            periods: [period._meta.self],
            contentType: 'Storycontext',
          },
        })
        contents.push({
          type: 'Program',
          options: {
            periods: [period._meta.self],
          },
        })
      })

      contents.push({
        type: 'Toc',
        options: {},
      })

      return contents
    },
    addContent(content) {
      this.cnf.contents.push(content)
      this.onChange()
    },
    removeContent(idx) {
      this.cnf.contents.splice(idx, 1)
      this.onChange()
    },
    onChange() {
      this.$nextTick(() => {
        this.$store.commit('setLastPrintConfig', {
          campUri: this.camp._meta.self,
          printConfig: cloneDeep(JSON.parse(jsonStringifyReactiveValue(this.cnf))),
        })
      })
    },
    onChangeContentConfig(index, value) {
      this.cnf.contents[index].options = value
      this.onChange()
    },
    repairConfig(config) {
      const repairers = Object.fromEntries(
        Object.entries(this.contentComponents).map(([componentName, component]) => [
          componentName,
          component.repairConfig,
        ])
      )

      return repairConfig(
        config,
        this.camp,
        componentI18n.availableLocales,
        this.lang,
        repairers,
        this.defaultContents()
      )
    },
  },
}
</script>

<style scoped lang="scss">
.e-print-configurator__cnf {
  &:deep(.v-expansion-panel-title) {
    font-family: monospace;
    border-top: 1px solid rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }

  &:deep(.v-expansion-panel-title--active) {
    border-bottom: none;
  }

  &:deep(.v-expansion-panel-text) {
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }
}
</style>
