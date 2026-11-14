import CoverConfig from '../config/CoverConfig.vue'
import TocConfig from '../config/TocConfig.vue'
import PicassoConfig from '../config/PicassoConfig.vue'
import ProgramConfig from '../config/ProgramConfig.vue'
import ActivityConfig from '../config/ActivityConfig.vue'
import ActivityListConfig from '../config/ActivityListConfig.vue'
import StoryConfig from '../config/StoryConfig.vue'
import SafetyConsiderationsConfig from '../config/SafetyConsiderationsConfig.vue'
import { customSections } from './customSections.js'
import { defaultOptions, repairOptions } from './optionsSchema.js'

const TRANSLATIONS = 'components.print.sections.sections'

const builtinComponents = {
  Cover: CoverConfig,
  Toc: TocConfig,
  Picasso: PicassoConfig,
  Program: ProgramConfig,
  Activity: ActivityConfig,
  ActivityList: ActivityListConfig,
  Story: StoryConfig,
  SafetyConsiderations: SafetyConsiderationsConfig,
}

const builtinSchemas = {
  EmptyPage: [
    { key: 'pageCount', type: 'number', default: 1, min: 1, max: 50, step: 1 },
    { key: 'heading', type: 'text' },
    { key: 'text', type: 'textarea' },
    { key: 'alignment', type: 'select', default: 'left', items: ['left', 'center'] },
  ],
  NotesPage: [
    {
      key: 'lineStyle',
      type: 'select',
      default: 'lined',
      items: ['lined', 'squared', 'dotted'],
    },
    { key: 'perDay', type: 'boolean', default: false },
    { key: 'periods', type: 'periods' },
  ],
  InsertPdf: [
    { key: 'file', type: 'pdf' },
    { key: 'tocTitle', type: 'text' },
    { key: 'pageRange', type: 'text' },
    { key: 'fitToPageSize', type: 'boolean', default: true },
  ],
}

function builtinSection(type, component, t) {
  return {
    type,
    origin: 'ecamp',
    title: t(`components.print.printConfigurator.config.${type}`),
    description: t(`${TRANSLATIONS}.description.${type}`),
    optionsComponent: component,
    defaultOptions: (camp) => component.defaultOptions(camp),
    repair: component.repairConfig,
  }
}

function schemaSection(section) {
  return {
    ...section,
    defaultOptions: (camp) => defaultOptions(section.optionsSchema, camp),
    repair: (content, camp) => ({
      ...content,
      options: repairOptions(content.options, section.optionsSchema, camp),
    }),
  }
}

function builtinSchemaSection(type, options, t) {
  return schemaSection({
    type,
    origin: 'ecamp',
    title: t(`components.print.printConfigurator.config.${type}`),
    description: t(`${TRANSLATIONS}.description.${type}`),
    optionsSchema: options.map((option) => ({
      ...option,
      label: t(`${TRANSLATIONS}.option.${type}.${option.key}`),
      items: option.items?.map((value) => ({
        value,
        label: t(`${TRANSLATIONS}.option.${type}.${option.key}Items.${value}`),
      })),
    })),
  })
}

function customSection({ id, title, description, options }) {
  return schemaSection({
    type: id,
    origin: 'user',
    title,
    description,
    optionsSchema: options,
  })
}

/**
 * All sections which can be added to a print config, by type.
 *
 * @param t translation function
 * @param draftSections custom sections to use instead of the saved ones with the same id
 */
export function availableSections(t, draftSections = []) {
  return Object.fromEntries(
    [
      ...Object.entries(builtinComponents).map(([type, component]) =>
        builtinSection(type, component, t)
      ),
      ...Object.entries(builtinSchemas).map(([type, options]) =>
        builtinSchemaSection(type, options, t)
      ),
      ...Object.values({
        ...customSections,
        ...Object.fromEntries(draftSections.map((section) => [section.id, section])),
      }).map(customSection),
    ].map((section) => [section.type, section])
  )
}
