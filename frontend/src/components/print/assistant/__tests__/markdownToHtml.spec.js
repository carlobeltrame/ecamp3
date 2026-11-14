import { describe, expect, it } from 'vitest'
import { markdownToHtml } from '../markdownToHtml.js'

describe('markdownToHtml', () => {
  it('converts emphasis and lists', () => {
    expect(markdownToHtml('**Done.** I changed:\n\n- the *title*\n- the margins')).toBe(
      '<p><strong>Done.</strong> I changed:</p>\n<ul>\n<li>the <em>title</em></li>\n<li>the margins</li>\n</ul>\n'
    )
  })

  it('keeps single line breaks', () => {
    expect(markdownToHtml('one\ntwo')).toBe('<p>one<br>two</p>\n')
  })

  it('turns headings into bold paragraphs', () => {
    expect(markdownToHtml('## What *changed*')).toBe(
      '<p><strong>What <em>changed</em></strong></p>'
    )
  })

  it('prints one line per table row', () => {
    expect(markdownToHtml('| Day | Hours |\n|---|---|\n| **Mon** | 4 |')).toBe(
      '<p>Day · Hours</p><p><strong>Mon</strong> · 4</p>'
    )
  })

  it('escapes HTML', () => {
    expect(markdownToHtml('<img src=x onerror=alert(1)>\n\nsee <b>this</b>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;\n\n<p>see &lt;b&gt;this&lt;/b&gt;</p>\n'
    )
  })
})
