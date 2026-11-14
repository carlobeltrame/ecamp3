import { reactive } from 'vue'
import { cloneDeep } from 'lodash-es'
import { AssistantUnavailableError } from './askModel.js'
import { builtinSourcePaths, readBuiltinSource } from './builtinSources.js'
import { loadSampleCamp, loadSampleStore, SAMPLE_CAMP_URI } from './sampleCamp.js'
import { customSections, saveCustomSection } from '../sections/customSections.js'
import { newCustomSectionType } from '../sections/customSectionType.js'
import { defaultOptions } from '../sections/optionsSchema.js'
import { ENTRY_FILE } from '../sections/entryFile.js'

const MAX_ROUNDS = 30
const MAX_FAILED_RENDERS = 3
const MAX_TOOL_RESULT_LENGTH = 30000
const OPTION_TYPES = ['periods', 'boolean', 'number', 'text', 'select', 'image']

/**
 * Holds one conversation with the print assistant and runs the tools it calls.
 * Pictures are sent along with a message as base64 data URLs.
 *
 * @param deps.postMessages sends the conversation to the model and resolves to its reply
 * @param deps.generatePdf renders a print config, see generatePdf.js
 * @param deps.getConfig returns the current print config
 * @param deps.setConfig repairs and applies a print config, and returns the applied config
 * @param deps.availableSections returns the sections which can be used in a print config, by type
 * @param deps.camp the camp of the user
 * @param deps.loadCampData loads all data of the user's camp into the store
 * @param deps.getStoreData returns the store state holding the data of the user's camp
 * @param deps.translationData messages for the PDF, by locale
 * @param deps.askForCampAccess asks the user whether the model may see their camp
 * @param deps.onSectionSaved called with the id of a custom section after the user accepted it
 */
export function createAssistantSession(deps) {
  const messages = []
  const state = reactive({
    entries: [],
    busy: false,
    activity: null,
    campAccess: false,
    pendingChange: null,
  })

  async function send(text, images = []) {
    if (state.busy) return
    state.busy = true
    state.entries.push({ type: 'user', text, images })
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: await contextBlock() },
        ...images.map(imageBlock),
        ...(text ? [{ type: 'text', text }] : []),
      ],
    })

    try {
      await runToolLoop()
    } catch (error) {
      state.entries.push({
        type: error instanceof AssistantUnavailableError ? 'unavailable' : 'error',
      })
    } finally {
      state.busy = false
      state.activity = null
    }
  }

  async function runToolLoop() {
    const turn = { failedRenders: 0, changed: false }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      state.activity = 'thinking'
      const reply = await deps.postMessages(messages)
      messages.push({ role: 'assistant', content: reply.content })

      const toolUses = reply.content.filter((block) => block.type === 'tool_use')
      if (reply.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const text = reply.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n\n')
          .trim()
        state.entries.push(
          reply.stop_reason === 'end_turn' && text
            ? { type: 'assistant', text }
            : { type: 'error' }
        )
        break
      }

      const results = []
      for (const toolUse of toolUses) {
        results.push(await runTool(toolUse, turn))
      }
      messages.push({ role: 'user', content: results })

      if (turn.failedRenders >= MAX_FAILED_RENDERS) {
        state.pendingChange = turn.changed ? null : state.pendingChange
        state.entries.push({ type: 'failure' })
        return
      }
    }

    if (turn.changed && state.pendingChange) {
      state.entries
        .filter((entry) => entry.type === 'change' && entry.status === 'open')
        .forEach((entry) => (entry.status = 'replaced'))
      state.entries.push({ type: 'change', change: state.pendingChange, status: 'open' })
    }
  }

  async function runTool(toolUse, turn) {
    const tool = tools[toolUse.name]
    let result
    let isError = false
    try {
      if (!tool) throw new Error(`Unknown tool "${toolUse.name}".`)
      result = await tool(toolUse.input ?? {}, turn)
    } catch (error) {
      result = error.message
      isError = true
    }
    const content = typeof result === 'string' ? result : JSON.stringify(result)
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content:
        content.length > MAX_TOOL_RESULT_LENGTH
          ? content.substring(0, MAX_TOOL_RESULT_LENGTH) + '\n[truncated]'
          : content,
      is_error: isError,
    }
  }

  const tools = {
    async read_builtin_source({ path }) {
      state.activity = 'reading'
      const source = await readBuiltinSource(path)
      if (source === null) {
        throw new Error(`There is no readable file "${path}".`)
      }
      return source
    },

    async read_section({ sectionId }) {
      state.activity = 'reading'
      return describeSection(findSection(sectionId), true)
    },

    async write_section(input, turn) {
      state.activity = 'rendering'
      const existing = input.sectionId ? findSection(input.sectionId) : null
      const section = {
        id: existing?.id ?? newCustomSectionType(),
        ...validatedSection(input),
      }

      const { error, pageCount } = await renderSection(section)
      if (error) {
        turn.failedRenders++
        return { ok: false, error: cleanError(error) }
      }

      turn.failedRenders = 0
      turn.changed = true
      state.pendingChange = {
        section,
        summary: String(input.summary ?? ''),
        isNew: !(section.id in customSections),
        pageCount,
      }
      return {
        ok: true,
        sectionId: section.id,
        pageCount,
        renderedWith: state.campAccess ? "the leader's camp" : 'the sample camp',
      }
    },

    async set_print_config({ options, contents }) {
      if (!Array.isArray(contents) || typeof options !== 'object') {
        throw new Error('Expected "options" and the list "contents".')
      }
      const previous = cloneDeep(deps.getConfig())
      const applied = deps.setConfig({ ...previous, options, contents })
      state.entries.push({ type: 'configChange', previous, status: 'applied' })
      return describeConfig(applied)
    },

    async read_camp_data({ uri }) {
      state.activity = 'reading'
      const store = state.campAccess ? deps.getStoreData().api : await loadSampleStore()
      const key = String(uri).replace(/^\/api(?=\/|$)/, '')
      if (!store[key] || store[key]._meta?.loading) {
        throw new Error(`There is no loaded data at "${uri}".`)
      }
      return describeEntity(store[key])
    },

    async request_camp_access({ reason }) {
      if (!state.campAccess) {
        state.activity = 'waiting'
        const granted = await deps.askForCampAccess(String(reason ?? ''))
        if (granted) await allowCampAccess()
      }
      return state.campAccess
        ? { granted: true, campUri: deps.camp._meta.self }
        : { granted: false }
    },
  }

  async function allowCampAccess() {
    await deps.loadCampData()
    state.campAccess = true
  }

  function revokeCampAccess() {
    state.campAccess = false
  }

  function findSection(sectionId) {
    const section =
      state.pendingChange?.section.id === sectionId
        ? state.pendingChange.section
        : customSections[sectionId]
    if (!section) throw new Error(`There is no custom section "${sectionId}".`)
    return section
  }

  async function renderSection(section) {
    const config = deps.getConfig()
    const camp = state.campAccess ? deps.camp : await loadSampleCamp()
    return deps.generatePdf(
      {
        config: {
          language: config.language,
          documentName: section.title,
          options: config.options,
          camp: state.campAccess ? deps.camp._meta.self : SAMPLE_CAMP_URI,
          contents: [
            { type: section.id, options: defaultOptions(section.options, camp) },
          ],
        },
        storeData: state.campAccess
          ? deps.getStoreData()
          : { api: await loadSampleStore(), lang: { language: config.language } },
        translationData: deps.translationData,
        draftSections: [section],
        renderInWorker: true,
      },
      () => {}
    )
  }

  async function contextBlock() {
    const sections = deps.availableSections()
    const context = {
      campData: state.campAccess
        ? { visible: "the leader's camp", campUri: deps.camp._meta.self }
        : { visible: 'the sample camp', campUri: SAMPLE_CAMP_URI },
      printConfig: describeConfig(deps.getConfig()),
      customSections: Object.values(customSections).map((section) =>
        describeSection(section, false)
      ),
      pendingChange: state.pendingChange
        ? {
            note: 'Waiting for the leader to accept or reject it.',
            ...describeSection(state.pendingChange.section, false),
          }
        : null,
    }
    if (messages.length === 0) {
      context.builtinSections = Object.values(sections)
        .filter((section) => section.origin !== 'user')
        .map((section) => ({
          type: section.type,
          title: section.title,
          description: section.description,
          defaultOptions: section.defaultOptions(deps.camp),
        }))
      context.readableSourcePaths = builtinSourcePaths
    }
    return `<context>\n${JSON.stringify(context, null, 1)}\n</context>`
  }

  function acceptChange(entry, options = null) {
    const { section, isNew } = entry.change
    saveCustomSection(section)
    const config = deps.getConfig()
    const contents = [...config.contents]
    if (isNew) {
      contents.push({
        type: section.id,
        options: options ?? defaultOptions(section.options, deps.camp),
      })
    } else if (options) {
      const index = contents.findIndex((content) => content.type === section.id)
      if (index >= 0) contents[index] = { ...contents[index], options }
    }
    deps.setConfig({ ...config, contents })
    deps.onSectionSaved(section.id)
    entry.status = 'accepted'
    state.pendingChange = null
  }

  function rejectChange(entry) {
    entry.status = 'rejected'
    state.pendingChange = null
  }

  function undoConfigChange(entry) {
    deps.setConfig(entry.previous)
    entry.status = 'undone'
  }

  return {
    state,
    send,
    allowCampAccess,
    revokeCampAccess,
    acceptChange,
    rejectChange,
    undoConfigChange,
  }
}

function validatedSection(input) {
  const files = Object.fromEntries(
    (Array.isArray(input.files) ? input.files : []).map((file) => [
      String(file?.name),
      String(file?.content ?? ''),
    ])
  )
  if (!(ENTRY_FILE in files)) {
    throw new Error(`The files must contain "${ENTRY_FILE}".`)
  }
  if (Object.keys(files).some((name) => !/^[\w-]+\.(vue|js)$/.test(name))) {
    throw new Error('File names must be plain names ending in .vue or .js.')
  }
  const options = Array.isArray(input.options) ? input.options : []
  options.forEach((option) => {
    if (!/^[a-zA-Z]\w*$/.test(option?.key ?? '') || !OPTION_TYPES.includes(option.type)) {
      throw new Error(`Invalid option ${JSON.stringify(option)}.`)
    }
    if (option.type === 'select' && !(option.items?.length > 0)) {
      throw new Error(`The select option "${option.key}" needs items.`)
    }
  })
  if (!input.title) throw new Error('The section needs a title.')

  return {
    title: String(input.title),
    description: String(input.description ?? ''),
    options: options.map(
      ({ key, type, label, default: defaultValue, min, max, step, items }) => ({
        key,
        type,
        label: String(label ?? key),
        default: defaultValue,
        min,
        max,
        step,
        items: items?.map((item) => ({ value: item.value, label: String(item.label) })),
      })
    ),
    files,
  }
}

function imageBlock(dataUrl) {
  const [, mediaType, data] = dataUrl.match(/^data:(.+?);base64,(.*)$/)
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
}

function describeSection(section, withFiles) {
  return {
    sectionId: section.id,
    title: section.title,
    description: section.description,
    options: section.options,
    files: withFiles
      ? Object.entries(section.files).map(([name, content]) => ({ name, content }))
      : Object.keys(section.files),
  }
}

function describeConfig(config) {
  return { options: config.options, contents: config.contents }
}

function describeEntity(entity) {
  return Object.fromEntries(
    Object.entries(entity)
      .filter(([key]) => key !== '_meta')
      .map(([key, value]) => {
        if (key === 'items' && Array.isArray(value)) {
          return [key, value.map((item) => item.href ?? item)]
        }
        return [key, value]
      })
  )
}

function cleanError(error) {
  return String(error.message ?? error).replace(
    /^Error in PDF worker code\..*?Error message was: /,
    ''
  )
}
