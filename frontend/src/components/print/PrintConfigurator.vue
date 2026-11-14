<template>
  <v-skeleton-loader v-if="loading" type="article" class="pa-4" />
  <div v-else class="e-print-configurator">
    <div class="e-print-configurator__column">
      <SectionList
        :contents="cnf.contents"
        :options="cnf.options"
        :sections="sections"
        :selected="selectedIndex"
        @update:contents="reorderContents"
        @update:selected="selectedIndex = $event"
        @add="showAddSection = true"
        @remove="removeContent"
      />
      <DownloadPdfButton :config="cnf" class="pa-4" />
    </div>

    <div class="e-print-configurator__column pa-4">
      <SectionOptions
        v-if="selectedContent"
        :key="selectedIndex"
        :content="selectedContent"
        :section="sections[selectedContent.type]"
        :camp="camp"
        @update:options="onChangeContentConfig(selectedIndex, $event)"
      />
      <DocumentOptions v-else v-model="cnf.options" @update:model-value="onChange" />
    </div>

    <div class="e-print-configurator__column e-print-configurator__preview">
      <div class="px-4 py-2 text-body-2 text-medium-emphasis">
        {{ previewTitle }}
      </div>
      <PrintPreview
        :config="previewConfig"
        width="100%"
        height="100%"
        class="flex-grow-1"
        @rendered="previewPageCount = $event.pageCount"
      />
    </div>

    <PrintAssistant
      ref="assistant"
      class="e-print-configurator__column pa-4"
      :camp="camp"
      :config="cnf"
      :sections="sections"
      :set-config="setConfig"
      @section-saved="selectSection"
    />

    <DialogAddSection
      v-model="showAddSection"
      :sections="sections"
      @add="addContent"
      @delete="deleteSection"
      @ask-assistant="$refs.assistant.focus()"
    />
  </div>
</template>

<script>
import PrintPreview from './generator/PrintPreview.vue'
import DownloadPdfButton from './generator/DownloadPdfButton.vue'
import SectionList from './configurator/SectionList.vue'
import SectionOptions from './configurator/SectionOptions.vue'
import DocumentOptions from './configurator/DocumentOptions.vue'
import DialogAddSection from './configurator/DialogAddSection.vue'
import PrintAssistant from './assistant/PrintAssistant.vue'
import { availableSections } from './sections/sections.js'
import { deleteCustomSection } from './sections/customSections.js'
import { cloneDeep } from 'lodash-es'
import { componentI18n } from '../../plugins/i18n/index.js'
import repairConfig from './repairPrintConfig.js'
import campShortTitle from '@/helpers/campShortTitle.js'
import jsonStringifyReactiveValue from '@/components/print/jsonStringifyReactiveValue.js'

export default {
  name: 'PrintConfigurator',
  components: {
    DownloadPdfButton,
    PrintPreview,
    SectionList,
    SectionOptions,
    DocumentOptions,
    DialogAddSection,
    PrintAssistant,
  },
  provide() {
    return {
      loadingEndpoints: this.loadingEndpoints,
    }
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
      cnf: null,
      selectedIndex: null,
      showAddSection: false,
      previewPageCount: null,
      loadingEndpoints: {
        activities: true,
        categories: true,
        periods: true,
        days: true,
        campCollaborations: true,
        progressLabels: true,
        scheduleEntries: true,
      },
    }
  },
  computed: {
    sections() {
      return availableSections(this.$t)
    },
    selectedContent() {
      return this.cnf?.contents[this.selectedIndex] ?? null
    },
    previewConfig() {
      return this.selectedContent
        ? { ...this.cnf, contents: [this.selectedContent] }
        : this.cnf
    },
    previewTitle() {
      const title = this.selectedContent
        ? this.sections[this.selectedContent.type]?.title
        : this.$t('components.print.printConfigurator.wholeDocument')
      return this.previewPageCount
        ? this.$t(
            'components.print.printConfigurator.previewPages',
            { title, count: this.previewPageCount },
            this.previewPageCount
          )
        : title
    },
    lang() {
      return this.$store.state.lang.language
    },
    lastPrintConfig() {
      return this.$store.getters.getLastPrintConfig(this.camp._meta.self, null)
    },
    currentConfig() {
      return this.lastPrintConfig ?? this.defaultConfig
    },
    defaultConfig() {
      return {
        language: this.lang,
        documentName: campShortTitle(this.camp),
        options: { pageNumbers: false, pageSize: 'A4', compact: false },
        camp: this.camp._meta.self,
        contents: this.defaultContents(),
      }
    },
  },
  watch: {
    lang: {
      handler(language) {
        if (!this.cnf) return
        this.cnf.language = language
        this.onChange()
      },
      immediate: true,
    },
    previewConfig() {
      this.previewPageCount = null
    },
  },
  async mounted() {
    await this.loadEndpointData('periods')
    this.setRepairedConfig(this.currentConfig)
    this.loading = false
    await this.loadRemainingPrintData()
  },
  methods: {
    async loadRemainingPrintData() {
      const periods = this.camp.periods().items
      await Promise.all([
        this.loadEndpointData(
          'scheduleEntries',
          Promise.all(periods.map((period) => period.scheduleEntries()._meta.load))
        ),
        this.loadEndpointData('activities'),
      ])

      await Promise.all([
        this.loadEndpointData(
          'days',
          Promise.all(periods.map((period) => period.days()._meta.load))
        ),
        Promise.all(periods.map((period) => period.contentNodes()._meta.load)),
        this.loadEndpointData('categories'),
        this.loadEndpointData('campCollaborations'),
        this.loadEndpointData('progressLabels'),
      ])

      this.setRepairedConfig(this.cnf)
    },
    setRepairedConfig(config) {
      const repaired = this.repairConfig(config)
      this.cnf = repaired
      if (jsonStringifyReactiveValue(config) !== jsonStringifyReactiveValue(repaired)) {
        this.onChange()
      }
    },
    setConfig(config) {
      this.cnf = this.repairConfig(config)
      if (this.selectedIndex >= this.cnf.contents.length) this.selectedIndex = null
      this.onChange()
      return this.cnf
    },
    async loadEndpointData(endpoint, load = this.camp[endpoint]()._meta.load) {
      await load
      this.loadingEndpoints[endpoint] = false
    },
    createConfig() {
      return this.repairConfig(this.defaultConfig)
    },
    resetConfig() {
      this.$store.commit('setLastPrintConfig', {
        campUri: this.camp._meta.self,
        printConfig: undefined,
      })
      this.selectedIndex = null
      this.cnf = this.createConfig()
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
    addContent(section) {
      this.cnf.contents.push({
        type: section.type,
        options: section.defaultOptions(this.camp),
      })
      this.selectedIndex = this.cnf.contents.length - 1
      this.onChange()
    },
    removeContent(idx) {
      this.cnf.contents.splice(idx, 1)
      this.selectedIndex = null
      this.onChange()
    },
    reorderContents(contents) {
      this.cnf.contents = contents
      this.onChange()
    },
    selectSection(type) {
      const index = this.cnf.contents.findLastIndex((content) => content.type === type)
      this.selectedIndex = index === -1 ? null : index
    },
    deleteSection(section) {
      deleteCustomSection(section.type)
      this.setConfig(this.cnf)
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
        Object.entries(this.sections).map(([type, section]) => [type, section.repair])
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
.e-print-configurator {
  display: grid;
  grid-template-columns: 1fr;
}

.e-print-configurator__column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.e-print-configurator__preview {
  height: 70vh;
  background: #eee;
}

@media (min-width: 1264px) {
  .e-print-configurator {
    grid-template-columns: 260px 300px minmax(0, 1fr) 340px;
    height: calc(100vh - 180px);
    min-height: 560px;
  }

  .e-print-configurator__column {
    height: 100%;
    overflow-y: auto;
    border-bottom: none;
    border-right: 1px solid rgba(0, 0, 0, 0.12);
  }

  .e-print-configurator__preview {
    overflow: hidden;
  }
}
</style>
