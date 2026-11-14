<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent>
    <v-card :title="$t('components.print.assistant.dialogCampAccess.title')">
      <v-card-text>
        <p>
          {{
            $t('components.print.assistant.dialogCampAccess.explanation', {
              camp: camp.title,
            })
          }}
        </p>
        <p v-if="reason" class="mt-4">
          {{ $t('components.print.assistant.dialogCampAccess.reason', { reason }) }}
        </p>
        <p class="mt-4 text-medium-emphasis">
          {{ $t('components.print.assistant.dialogCampAccess.revoke') }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :text="$t('components.print.assistant.dialogCampAccess.deny')"
          @click="$emit('decide', false)"
        />
        <v-btn
          color="primary"
          variant="flat"
          :text="$t('components.print.assistant.dialogCampAccess.allow')"
          @click="$emit('decide', true)"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: 'DialogCampAccess',
  props: {
    modelValue: { type: Boolean, required: true },
    camp: { type: Object, required: true },
    reason: { type: String, default: '' },
  },
  emits: ['decide'],
}
</script>
