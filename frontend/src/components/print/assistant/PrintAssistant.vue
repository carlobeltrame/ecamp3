<template>
  <div class="e-print-assistant">
    <div class="e-print-assistant__header">
      <h3 class="text-subtitle-1 font-weight-bold">
        {{ $t('components.print.assistant.printAssistant.title') }}
      </h3>
      <v-menu>
        <template #activator="{ props }">
          <v-chip
            v-bind="props"
            size="small"
            :color="session.state.campAccess ? 'warning' : undefined"
            :prepend-icon="session.state.campAccess ? 'mdi-eye' : 'mdi-eye-off-outline'"
            :text="
              $t(
                `components.print.assistant.printAssistant.${session.state.campAccess ? 'seesCamp' : 'seesSampleCamp'}`
              )
            "
          />
        </template>
        <v-list density="compact">
          <v-list-item
            v-if="session.state.campAccess"
            :title="$t('components.print.assistant.printAssistant.revokeAccess')"
            @click="session.revokeCampAccess()"
          />
          <v-list-item
            v-else
            :title="$t('components.print.assistant.printAssistant.allowAccess')"
            @click="offerCampAccess"
          />
        </v-list>
      </v-menu>
    </div>

    <div ref="entries" class="e-print-assistant__entries">
      <p v-if="session.state.entries.length === 0" class="text-medium-emphasis">
        {{ $t('components.print.assistant.printAssistant.intro') }}
      </p>
      <template v-for="(entry, index) in session.state.entries" :key="index">
        <div v-if="entry.type === 'user'" class="e-print-assistant__user">
          <div v-if="entry.images.length" class="e-print-assistant__images">
            <img
              v-for="(image, imageIndex) in entry.images"
              :key="imageIndex"
              :src="image"
            />
          </div>
          {{ entry.text }}
        </div>
        <TiptapEditor
          v-else-if="entry.type === 'assistant'"
          class="e-print-assistant__reply"
          :model-value="markdownToHtml(entry.text)"
          :with-extensions="true"
          :editable="false"
        />
        <v-card
          v-else-if="entry.type === 'change'"
          variant="outlined"
          density="compact"
          :title="entry.change.section.title"
          :text="entry.change.summary"
        >
          <v-card-actions v-if="entry.status === 'open'">
            <v-btn
              :text="$t('components.print.assistant.printAssistant.review')"
              @click="reviewedEntry = entry"
            />
            <v-spacer />
            <v-btn
              :text="$t('components.print.assistant.dialogReviewChange.reject')"
              @click="session.rejectChange(entry)"
            />
            <v-btn
              color="primary"
              variant="flat"
              :text="$t('components.print.assistant.dialogReviewChange.accept')"
              @click="session.acceptChange(entry)"
            />
          </v-card-actions>
          <v-card-text v-else class="text-medium-emphasis pt-0">
            {{
              $t(`components.print.assistant.printAssistant.changeStatus.${entry.status}`)
            }}
          </v-card-text>
        </v-card>
        <div v-else-if="entry.type === 'configChange'" class="e-print-assistant__note">
          <span>
            {{
              $t(`components.print.assistant.printAssistant.configChange.${entry.status}`)
            }}
          </span>
          <v-btn
            v-if="entry.status === 'applied'"
            size="small"
            variant="text"
            :text="$t('global.button.undo')"
            @click="session.undoConfigChange(entry)"
          />
        </div>
        <v-alert
          v-else
          density="compact"
          variant="tonal"
          :type="entry.type === 'unavailable' ? 'info' : 'warning'"
          :text="$t(`components.print.assistant.printAssistant.${entry.type}`)"
        />
      </template>
      <div v-if="session.state.busy" class="e-print-assistant__note">
        <v-progress-circular indeterminate size="16" width="2" />
        <span>
          {{
            $t(
              `components.print.assistant.printAssistant.activity.${session.state.activity ?? 'thinking'}`
            )
          }}
        </span>
      </div>
    </div>

    <div v-if="images.length" class="e-print-assistant__images">
      <div
        v-for="(image, index) in images"
        :key="index"
        class="e-print-assistant__attachment"
      >
        <img :src="image" />
        <v-btn
          icon="mdi-close"
          size="x-small"
          density="compact"
          variant="elevated"
          :aria-label="$t('components.print.assistant.printAssistant.removeImage')"
          @click="images.splice(index, 1)"
        />
      </div>
    </div>
    <v-alert
      v-if="imageError"
      class="e-print-assistant__image-error"
      density="compact"
      variant="tonal"
      type="warning"
      closable
      :text="$t('components.print.assistant.printAssistant.imageError')"
      @click:close="imageError = false"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      hidden
      @change="attachFromInput"
    />
    <v-textarea
      ref="input"
      v-model="draft"
      :label="$t('components.print.assistant.printAssistant.input')"
      :disabled="session.state.busy"
      rows="2"
      auto-grow
      max-rows="6"
      variant="outlined"
      density="compact"
      hide-details
      prepend-inner-icon="mdi-paperclip"
      append-inner-icon="mdi-send"
      @click:prepend-inner="$refs.fileInput.click()"
      @click:append-inner="send"
      @keydown.enter.exact.prevent="send"
      @paste="attachFromClipboard"
    />

    <DialogCampAccess
      :model-value="accessRequest !== null"
      :camp="camp"
      :reason="accessRequest?.reason"
      @decide="accessRequest.resolve($event)"
    />
    <DialogReviewChange
      v-if="reviewedEntry"
      :change="reviewedEntry.change"
      :config="config"
      :camp="camp"
      @close="reviewedEntry = null"
      @accept="decide('acceptChange', $event)"
      @reject="decide('rejectChange')"
    />
  </div>
</template>

<script>
import { componentI18n } from '@/plugins/index.js'
import TiptapEditor from '@/components/form/tiptap/TiptapEditor.vue'
import { prepareInMainThread } from '@/pdf/prepareInMainThread.js'
import { generatePdf } from '../generator/generatePdf.js'
import { askModel } from './askModel.js'
import { readChatImage } from './chatImage.js'
import { createAssistantSession } from './assistantSession.js'
import DialogCampAccess from './DialogCampAccess.vue'
import DialogReviewChange from './DialogReviewChange.vue'
import { markdownToHtml } from './markdownToHtml.js'

export default {
  name: 'PrintAssistant',
  components: { DialogCampAccess, DialogReviewChange, TiptapEditor },
  props: {
    camp: { type: Object, required: true },
    config: { type: Object, required: true },
    sections: { type: Object, required: true },
    setConfig: { type: Function, required: true },
  },
  emits: ['sectionSaved'],
  data() {
    return {
      draft: '',
      images: [],
      imageError: false,
      accessRequest: null,
      reviewedEntry: null,
      session: createAssistantSession({
        postMessages: askModel,
        generatePdf,
        getConfig: () => this.config,
        setConfig: (config) => this.setConfig(config),
        availableSections: () => this.sections,
        camp: this.camp,
        loadCampData: () =>
          prepareInMainThread({
            camp: this.camp._meta.self,
            contents: [{ type: 'Program' }],
            apiGet: this.api.get.bind(this),
          }),
        getStoreData: () => this.$store.state,
        translationData: componentI18n.messages.value,
        askForCampAccess: (reason) => this.askForCampAccess(reason),
        onSectionSaved: (sectionId) => this.$emit('sectionSaved', sectionId),
      }),
    }
  },
  watch: {
    'session.state.entries.length'() {
      this.$nextTick(() => {
        this.$refs.entries.scrollTop = this.$refs.entries.scrollHeight
      })
    },
  },
  methods: {
    markdownToHtml,
    focus() {
      this.$refs.input.focus()
    },
    send() {
      const text = this.draft.trim()
      if ((!text && !this.images.length) || this.session.state.busy) return
      const images = this.images
      this.draft = ''
      this.images = []
      this.imageError = false
      this.session.send(text, images)
    },
    async attach(files) {
      this.imageError = false
      for (const file of files) {
        try {
          this.images.push(await readChatImage(file))
        } catch {
          this.imageError = true
        }
      }
    },
    attachFromInput(event) {
      this.attach([...event.target.files])
      event.target.value = ''
    },
    attachFromClipboard(event) {
      const files = [...event.clipboardData.files].filter((file) =>
        file.type.startsWith('image/')
      )
      if (!files.length) return
      event.preventDefault()
      this.attach(files)
    },
    async askForCampAccess(reason) {
      const granted = await new Promise((resolve) => {
        this.accessRequest = { reason, resolve }
      })
      this.accessRequest = null
      return granted
    },
    async offerCampAccess() {
      if (await this.askForCampAccess('')) {
        await this.session.allowCampAccess()
      }
    },
    decide(decision, options) {
      this.session[decision](this.reviewedEntry, options)
      this.reviewedEntry = null
    },
  },
}
</script>

<style scoped>
.e-print-assistant {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.e-print-assistant :deep(.v-textarea),
.e-print-assistant__image-error {
  flex: 0 0 auto;
}

.e-print-assistant__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.e-print-assistant__entries {
  flex: 1 1 0;
  min-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.e-print-assistant__entries > * {
  flex-shrink: 0;
}

.e-print-assistant__user {
  align-self: flex-end;
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgb(var(--v-theme-primary), 0.1);
  white-space: pre-wrap;
}

.e-print-assistant__images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.e-print-assistant__images img {
  display: block;
  max-width: 100%;
  max-height: 120px;
  border-radius: 8px;
}

.e-print-assistant__user .e-print-assistant__images:not(:last-child) {
  margin-bottom: 8px;
}

.e-print-assistant__attachment {
  position: relative;
}

.e-print-assistant__attachment img {
  max-height: 64px;
}

.e-print-assistant__attachment .v-btn {
  position: absolute;
  top: -6px;
  right: -6px;
}

.e-print-assistant__note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}
</style>
