<template>
  <ValidationProvider
    v-slot="{ errors: veeErrors }"
    tag="div"
    :name="validationLabel"
    :vid="veeId"
    :rules="veeRules"
    :skip-if-empty="skipIfEmpty"
    :required="required"
    :immediate="immediateValidation"
    class="e-form-container"
  >
    <v-autocomplete
      v-bind="$attrs"
      :search-input.sync="search"
      :filled="filled"
      :hide-details="hideDetails"
      :error-messages="veeErrors.concat(errorMessages)"
      :label="labelOrEntityFieldLabel"
      :class="[inputClass]"
      :readonly="readonly"
      :append-icon="readonly ? null : '$dropdown'"
      :filter="tokensFilter"
    >
      <template #item="{ item, on, attrs }">
        <v-list-item v-bind="attrs" v-on="on">
          <v-list-item-content>
            <v-list-item-title>
              <span v-for="(part, idx) in renderHighlighted(item)" :key="idx">
                <mark v-if="part.h">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </span>
            </v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </template>

      <!-- passing through all slots -->
      <slot v-for="(_, name) in $slots" :slot="name" :name="name" />
      <template v-for="(_, name) in $scopedSlots" :slot="name" slot-scope="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
    </v-autocomplete>
  </ValidationProvider>
</template>

<script>
import { ValidationProvider } from 'vee-validate'
import { formComponentPropsMixin } from '@/mixins/formComponentPropsMixin.js'
import { formComponentMixin } from '@/mixins/formComponentMixin.js'
import uFuzzy from '@leeoniya/ufuzzy'

export default {
  name: 'EAutocomplete',
  components: { ValidationProvider },
  mixins: [formComponentPropsMixin, formComponentMixin],
  props: {
    immediateValidation: { type: Boolean, default: false },
    skipIfEmpty: { type: Boolean, default: true },
    readonly: { type: Boolean, default: false },
  },
  data() {
    return {
      fuzzy: new uFuzzy({ intraMode: 1 }),
      search: null,
      searchInfos: new Map(),
    }
  },
  methods: {
    tokensFilter(item, queryText, itemText) {
      const [idxs, info] = this.fuzzy.search([itemText], queryText, true, 1e3)
      this.searchInfos.set(item.value, info)
      return idxs && idxs.length > 0
    },

    renderHighlighted(item) {
      if (this.search) {
        if (this.searchInfos.has(item.value)) {
          const info = this.searchInfos.get(item.value)
          if (info) {
            return uFuzzy.highlight(
              item.text,
              info.ranges[0],
              (p, m) => ({ h: m, text: p }),
              [],
              (a, p) => {
                a.push(p)
              }
            )
          }
        }
      }
      return [{ h: false, text: item.text }]
    },
  },
}
</script>

<style scoped>
[required]:deep(label::after) {
  content: '\a0*';
  font-size: 12px;
  color: #d32f2f;
}
[required]:deep(.v-input--is-label-active label::after) {
  color: gray;
}
</style>
