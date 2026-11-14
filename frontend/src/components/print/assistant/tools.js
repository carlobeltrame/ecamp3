const readBuiltinSource = {
  name: 'read_builtin_source',
  description:
    'Returns the source code of one built-in file of the PDF renderer, for example a built-in section, one of its child components or a helper. Read the relevant built-in files before writing a custom section that should look or behave like a built-in one. The context block of the first user message lists all readable paths.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Path as listed in the context block, for example "pdf/campPrint/picasso/Picasso.vue".',
      },
    },
    required: ['path'],
  },
}

const readSection = {
  name: 'read_section',
  description:
    "Returns the title, description, options and all source files of one custom section. If a change to this section is waiting for the leader's decision, the pending version is returned.",
  input_schema: {
    type: 'object',
    properties: {
      sectionId: {
        type: 'string',
        description: 'The id of the custom section, as shown in the context block.',
      },
    },
    required: ['sectionId'],
  },
}

const writeSection = {
  name: 'write_section',
  description:
    'Creates a custom section or replaces an existing one, then compiles and renders it once to check it. Returns the page count on success or the error on failure. Always pass the complete section: every file, and every option. On success the leader is shown a before/after preview and decides whether to keep the change, so nothing else is needed from you to apply it. A new section is added to the end of the document when the leader accepts it.',
  input_schema: {
    type: 'object',
    properties: {
      sectionId: {
        type: 'string',
        description:
          'The id of the custom section to replace. Omit to create a new section.',
      },
      title: {
        type: 'string',
        description:
          'Short name of the section in the leader\'s language, shown in the section list and in the table of contents, for example "Picasso compact".',
      },
      description: {
        type: 'string',
        description:
          "One sentence in the leader's language that says what the section prints, shown in the list of available sections.",
      },
      summary: {
        type: 'string',
        description:
          "One or two plain sentences in the leader's language that say what this change does, shown next to the before/after preview. No technical terms.",
      },
      options: {
        type: 'array',
        description:
          'The settings the leader can adjust in the configurator. Their values arrive in content.options under the given keys.',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Property name in content.options, camelCase.',
            },
            type: {
              type: 'string',
              enum: ['periods', 'boolean', 'number', 'text', 'select', 'image'],
            },
            label: {
              type: 'string',
              description: 'Label shown to the leader, in their language.',
            },
            default: {
              description: 'Default value. Not used for the types periods and image.',
            },
            min: { type: 'number' },
            max: { type: 'number' },
            step: { type: 'number' },
            items: {
              type: 'array',
              description: 'Choices of a select option.',
              items: {
                type: 'object',
                properties: {
                  value: { type: ['string', 'number'] },
                  label: { type: 'string' },
                },
                required: ['value', 'label'],
              },
            },
          },
          required: ['key', 'type', 'label'],
        },
      },
      files: {
        type: 'array',
        description:
          'All source files of the section. Must contain Section.vue, the entry component.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'File name without directories, ending in .vue or .js, for example "Section.vue".',
            },
            content: { type: 'string' },
          },
          required: ['name', 'content'],
        },
      },
    },
    required: ['title', 'description', 'summary', 'options', 'files'],
  },
}

const setPrintConfig = {
  name: 'set_print_config',
  description:
    'Replaces the document options and the list of sections of the print config. Use it to reorder, add or remove sections and to change options of built-in or custom sections. Pass the complete list of sections in the wanted order; copy the entries you do not change from the context block unchanged. The change is applied immediately and the leader can undo it. Invalid values are repaired and the resulting config is returned.',
  input_schema: {
    type: 'object',
    properties: {
      options: {
        type: 'object',
        properties: {
          pageSize: { type: 'string', enum: ['A5', 'A4', 'A3'] },
          pageNumbers: { type: 'boolean' },
          compact: {
            type: 'boolean',
            description:
              'Smaller page margins and denser layout in the built-in sections.',
          },
        },
        required: ['pageSize', 'pageNumbers', 'compact'],
      },
      contents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'A section type from the context block: a built-in type such as "Picasso", or the id of a custom section.',
            },
            options: { type: 'object' },
          },
          required: ['type', 'options'],
        },
      },
    },
    required: ['options', 'contents'],
  },
}

const readCampData = {
  name: 'read_camp_data',
  description:
    'Returns one entity or collection of the camp data exactly as sections read it with this.api.get(uri). Relations are shown as URIs that you can read with further calls. Reads the sample camp unless the leader has allowed access to their own camp. Start from the camp URI in the context block.',
  input_schema: {
    type: 'object',
    properties: {
      uri: { type: 'string' },
    },
    required: ['uri'],
  },
}

const requestCampAccess = {
  name: 'request_camp_access',
  description:
    'Asks the leader for permission to see their own camp instead of the sample camp for the rest of this session. Only call it when the request cannot be solved with the sample camp. Returns whether access was granted; when granted, the result contains the URI of their camp.',
  input_schema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description:
          "One short sentence in the leader's language that says why you need to see their camp. It is shown to them in the permission dialog.",
      },
    },
    required: ['reason'],
  },
}

export const tools = [
  readBuiltinSource,
  readSection,
  writeSection,
  setPrintConfig,
  readCampData,
  requestCampAccess,
].map((tool) => ({ ...tool, eager_input_streaming: true }))
