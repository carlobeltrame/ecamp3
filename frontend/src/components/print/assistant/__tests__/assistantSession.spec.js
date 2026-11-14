import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAssistantSession } from '../assistantSession.js'
import { AssistantUnavailableError } from '../askModel.js'
import { customSections, deleteCustomSection } from '../../sections/customSections.js'
import { SAMPLE_CAMP_URI } from '../sampleCamp.js'

const camp = {
  _meta: { self: '/camps/real' },
  periods: () => ({ items: [{ _meta: { self: '/periods/real' } }] }),
}

const sectionInput = {
  title: 'Hours per day',
  description: 'Lists the hours of every day.',
  summary: 'A new page with the hours of every day.',
  options: [{ key: 'periods', type: 'periods', label: 'Periods' }],
  files: [{ name: 'Section.vue', content: '<template><Page /></template>' }],
}

const text = (value) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: value }],
})

let toolUseCount = 0
const toolUse = (name, input) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: `toolu_${toolUseCount++}`, name, input }],
})

function createSession(replies, overrides = {}) {
  let config = {
    language: 'en',
    options: { pageSize: 'A4', pageNumbers: false, compact: false },
    contents: [{ type: 'Cover', options: {} }],
  }
  const deps = {
    postMessages: vi.fn(async (messages) => {
      deps.requests.push(JSON.parse(JSON.stringify(messages)))
      return replies.shift()
    }),
    requests: [],
    generatePdf: vi.fn(async () => ({ error: null, pageCount: 2 })),
    getConfig: () => config,
    setConfig: vi.fn((newConfig) => (config = newConfig)),
    availableSections: () => ({}),
    camp,
    loadCampData: vi.fn(async () => {}),
    getStoreData: () => ({ api: { '/camps/real': { title: 'Real camp' } } }),
    translationData: {},
    askForCampAccess: vi.fn(async () => true),
    onSectionSaved: vi.fn(),
    ...overrides,
  }
  return { session: createAssistantSession(deps), deps }
}

const lastToolResult = (deps) => {
  const [result] = deps.requests.at(-1).at(-1).content
  return { ...result, content: tryParse(result.content) }
}

const tryParse = (value) => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

describe('assistantSession', () => {
  beforeEach(() => {
    Object.keys(customSections).forEach(deleteCustomSection)
  })

  it('shows the reply of the model', async () => {
    const { session, deps } = createSession([text('Hello!')])

    await session.send('Hi')

    expect(session.state.entries).toEqual([
      { type: 'user', text: 'Hi', images: [] },
      { type: 'assistant', text: 'Hello!' },
    ])
    const [context, message] = deps.requests[0][0].content
    expect(context.text).toContain(SAMPLE_CAMP_URI)
    expect(context.text).toContain('readableSourcePaths')
    expect(context.text).not.toContain('/camps/real')
    expect(message.text).toBe('Hi')
  })

  it('sends attached pictures before the text', async () => {
    const { session, deps } = createSession([text('Nice sketch.')])

    await session.send('Like this', ['data:image/jpeg;base64,AAAA'])

    expect(session.state.entries[0]).toEqual({
      type: 'user',
      text: 'Like this',
      images: ['data:image/jpeg;base64,AAAA'],
    })
    expect(deps.requests[0][0].content.slice(1)).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
      },
      { type: 'text', text: 'Like this' },
    ])
  })

  it('sends a picture without text', async () => {
    const { session, deps } = createSession([text('Nice sketch.')])

    await session.send('', ['data:image/jpeg;base64,AAAA'])

    expect(deps.requests[0][0].content.map((block) => block.type)).toEqual([
      'text',
      'image',
    ])
  })

  it('reports a missing API key', async () => {
    const { session } = createSession([], {
      postMessages: async () => {
        throw new AssistantUnavailableError()
      },
    })

    await session.send('Hi')

    expect(session.state.entries.at(-1)).toEqual({ type: 'unavailable' })
    expect(session.state.busy).toBe(false)
  })

  it('returns sources of built-in files', async () => {
    const { session, deps } = createSession([
      toolUse('read_builtin_source', { path: 'pdf/campPrint/cover/Cover.vue' }),
      toolUse('read_builtin_source', { path: 'plugins/auth.js' }),
      text('Done'),
    ])

    await session.send('Hi')

    expect(deps.requests[1].at(-1).content[0].content).toContain('cover-camp-title')
    expect(lastToolResult(deps).is_error).toBe(true)
  })

  it('renders a written section with the sample camp and proposes it', async () => {
    const { session, deps } = createSession([
      toolUse('write_section', sectionInput),
      text('I added a page.'),
    ])

    await session.send('Add a page')

    const result = lastToolResult(deps).content
    expect(result).toMatchObject({ ok: true, pageCount: 2 })
    const [renderData] = deps.generatePdf.mock.calls[0]
    expect(renderData.config.camp).toBe(SAMPLE_CAMP_URI)
    expect(renderData.config.apiGet).toBeUndefined()
    expect(renderData.config.contents).toEqual([
      { type: result.sectionId, options: { periods: ['/periods/45b93e3dbb5f'] } },
    ])
    expect(renderData.draftSections[0].files).toEqual({
      'Section.vue': '<template><Page /></template>',
    })
    expect(session.state.entries.at(-1)).toMatchObject({
      type: 'change',
      status: 'open',
      change: { isNew: true, summary: sectionInput.summary, pageCount: 2 },
    })
    expect(customSections).toEqual({})
  })

  it('saves an accepted section and adds it to the document', async () => {
    const { session, deps } = createSession([
      toolUse('write_section', sectionInput),
      text('I added a page.'),
    ])
    await session.send('Add a page')

    session.acceptChange(session.state.entries.at(-1))

    const [sectionId] = Object.keys(customSections)
    expect(customSections[sectionId].title).toBe('Hours per day')
    expect(deps.getConfig().contents.at(-1)).toEqual({
      type: sectionId,
      options: { periods: ['/periods/real'] },
    })
    expect(deps.onSectionSaved).toHaveBeenCalledWith(sectionId)
    expect(session.state.pendingChange).toBeNull()
    expect(session.state.entries.at(-1).status).toBe('accepted')
  })

  it('adds an accepted section with the options chosen during the review', async () => {
    const { session, deps } = createSession([
      toolUse('write_section', sectionInput),
      text('I added a page.'),
    ])
    await session.send('Add a page')

    session.acceptChange(session.state.entries.at(-1), { periods: [] })

    expect(deps.getConfig().contents.at(-1).options).toEqual({ periods: [] })
  })

  it('does not save a rejected section', async () => {
    const { session } = createSession([
      toolUse('write_section', sectionInput),
      text('I added a page.'),
    ])
    await session.send('Add a page')

    session.rejectChange(session.state.entries.at(-1))

    expect(customSections).toEqual({})
    expect(session.state.pendingChange).toBeNull()
  })

  it('gives up after three failed renders in a row', async () => {
    const { session, deps } = createSession(
      [
        toolUse('write_section', sectionInput),
        toolUse('write_section', sectionInput),
        toolUse('write_section', sectionInput),
        text('never requested'),
      ],
      {
        generatePdf: async () => ({
          error:
            'Error in PDF worker code. To get the full stack trace, set RENDER_IN_WORKER to false. Error message was: Section.vue: boom',
        }),
      }
    )

    await session.send('Add a page')

    expect(deps.requests).toHaveLength(3)
    expect(lastToolResult(deps).content).toEqual({
      ok: false,
      error: 'Section.vue: boom',
    })
    expect(session.state.entries.at(-1)).toEqual({ type: 'failure' })
    expect(session.state.pendingChange).toBeNull()
  })

  it.each([
    [{ files: [] }, /Section\.vue/],
    [{ files: [{ name: '../Section.vue', content: '' }] }, /Section\.vue/],
    [{ options: [{ key: 'size', type: 'slider', label: 'Size' }] }, /Invalid option/],
    [{ sectionId: 'custom-unknown' }, /no custom section/],
  ])('rejects the invalid section input %j', async (invalid, message) => {
    const { session, deps } = createSession([
      toolUse('write_section', { ...sectionInput, ...invalid }),
      text('Done'),
    ])

    await session.send('Add a page')

    expect(lastToolResult(deps)).toMatchObject({ is_error: true })
    expect(lastToolResult(deps).content).toMatch(message)
    expect(deps.generatePdf).not.toHaveBeenCalled()
  })

  it('applies a config change and can undo it', async () => {
    const newConfig = {
      options: { pageSize: 'A5', pageNumbers: true, compact: false },
      contents: [],
    }
    const { session, deps } = createSession([
      toolUse('set_print_config', newConfig),
      text('Done'),
    ])

    await session.send('Use A5')

    expect(deps.getConfig()).toMatchObject(newConfig)
    expect(lastToolResult(deps).content).toEqual(newConfig)
    const entry = session.state.entries.find(({ type }) => type === 'configChange')

    session.undoConfigChange(entry)

    expect(deps.getConfig().options.pageSize).toBe('A4')
    expect(deps.getConfig().contents).toHaveLength(1)
    expect(entry.status).toBe('undone')
  })

  it('reads the sample camp until the user allows access to their camp', async () => {
    const { session, deps } = createSession([
      toolUse('read_camp_data', { uri: SAMPLE_CAMP_URI }),
      toolUse('read_camp_data', { uri: '/camps/real' }),
      toolUse('request_camp_access', { reason: 'To check Tuesday.' }),
      toolUse('read_camp_data', { uri: '/api/camps/real' }),
      toolUse('write_section', sectionInput),
      text('Done'),
    ])

    await session.send('Fix Tuesday')

    expect(lastToolResult({ requests: deps.requests.slice(0, 2) }).content.title).toBe(
      'GRGR nach 2027'
    )
    expect(lastToolResult({ requests: deps.requests.slice(0, 3) }).is_error).toBe(true)
    expect(deps.askForCampAccess).toHaveBeenCalledWith('To check Tuesday.')
    expect(deps.loadCampData).toHaveBeenCalled()
    expect(lastToolResult({ requests: deps.requests.slice(0, 4) }).content).toEqual({
      granted: true,
      campUri: '/camps/real',
    })
    expect(lastToolResult({ requests: deps.requests.slice(0, 5) }).content).toEqual({
      title: 'Real camp',
    })
    expect(deps.generatePdf.mock.calls[0][0].config.camp).toBe('/camps/real')
    expect(session.state.campAccess).toBe(true)
  })

  it('keeps the sample camp when the user declines', async () => {
    const { session, deps } = createSession(
      [toolUse('request_camp_access', { reason: 'Why not' }), text('Ok')],
      { askForCampAccess: async () => false }
    )

    await session.send('Fix Tuesday')

    expect(lastToolResult(deps).content).toEqual({ granted: false })
    expect(deps.loadCampData).not.toHaveBeenCalled()
    expect(session.state.campAccess).toBe(false)
  })
})
