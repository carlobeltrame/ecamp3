import { Marked } from 'marked'
import { escape } from 'lodash-es'

const marked = new Marked({
  breaks: true,
  renderer: {
    heading({ tokens }) {
      return `<p><strong>${this.parser.parseInline(tokens)}</strong></p>`
    },
    table({ header, rows }) {
      return [header, ...rows]
        .map((row) => row.map((cell) => this.parser.parseInline(cell.tokens)).join(' · '))
        .map((row) => `<p>${row}</p>`)
        .join('')
    },
    html({ text }) {
      return escape(text)
    },
  },
})

export function markdownToHtml(markdown) {
  return marked.parse(markdown)
}
