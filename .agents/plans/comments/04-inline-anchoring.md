# Phase 04 — Inline anchoring (roadmap step 7)

See [epic.md](epic.md) for the datamodel and decisions. Requires
[03-conversations.md](03-conversations.md).

This is a real future feature, not a speculative one — nothing in phases 01–03 may make it harder to
reach. It is still the largest phase by a wide margin, and it is the only step that breaks an
invariant the feature currently gets for free, so it stays gated on 01–03 being in production use.

## Goal

A comment points at the thing it is about: a selected sentence in a Notes field, one cell of a
storyboard, one checkbox of an LA thematic area, or a schedule entry on the picasso. Clicking a card
scrolls to and highlights its anchor; clicking a highlight focuses its card. When an anchor is lost
— someone rewrote the sentence — the thread is not lost with it: it shows the stored snapshot and
can be re-anchored to a new selection.

## The insight that keeps this small

The frontend already addresses every field inside every content node as `uri` + `path`, a lodash
path (`frontend/src/mixins/apiPropsMixin.js`, `ApiWrapper.vue:119,258`). Every surface the product
owner named is already reachable that way:

| surface                   | uri                             | path (already in the code)          |
| ------------------------- | ------------------------------- | ----------------------------------- |
| Notes rich text           | `/content_node/single_texts/x`  | `data.html`                         |
| Storyboard cell           | `/content_node/storyboards/x`   | `data.sections[<uuid>].column2Html` |
| LA thematic-area checkbox | `/content_node/multi_selects/x` | `data.options.<key>`                |
| Schedule entry            | `/schedule_entries/x`           | —                                   |

So a checkbox and a storyboard cell are **not new anchor types**. They are the same `contentNode` FK
with a different `anchorPath`. This is where the reference fork is inverted: it treats tiptap as the
base case and cannot express the others at all.

## Should we use Tiptap's own Comments extension? No.

Evaluated because the issue links to it. It is not viable for eCamp, on three independent grounds:

- **It is a paid Pro product**, distributed from Tiptap's private npm registry
  (`@tiptap-pro/extension-comments`) behind a personal access token and a Start-plan subscription.
  eCamp is open-source-based, and a private-registry dependency would break any contributor's build.
- **It requires the Tiptap Cloud Document server to store threads.** That is a second backend owning
  comment data, duplicating our `Comment` entity — and it could never express camp-level comments,
  schedule-entry anchors or checkbox anchors, which is more than half of what we want.
- Its value is mostly the parts we already have or do not want (thread storage, a REST API,
  webhooks, conflict resolution for real-time collaborative editing, which eCamp does not do).

What we actually need from tiptap is small: **a Mark carrying a `commentId` attribute, plus commands
to set/unset it and a hook telling us which mark the cursor is in.** Two open-source options:

1. `@sereneinserenade/tiptap-comment-extension` (MIT, ~511 stars, supports Tiptap 3) — exactly that
   Mark plus `setComment`/`unsetComment` and an `onCommentActivated` callback. No storage, no UI. It
   does not document overlapping marks, orphan detection or active-highlight styling, all of which
   we need.
2. The reference fork's hand-rolled `frontend/src/components/form/tiptap/CommentMark.js` (~344
   lines), which already handles overlapping marks, orphan stripping and active highlighting against
   _this_ codebase.

**Recommendation: start from the fork's `CommentMark.js`.** The MIT package is a smaller dependency
but only covers the easy third of the problem, and we would end up reimplementing the rest anyway.
Evaluate the package again only if `CommentMark.js` proves hard to maintain.

## Non-goals

| Not in this phase                                   | Where                             |
| --------------------------------------------------- | --------------------------------- |
| Google-Docs float-aligned card positioning          | not built — see below             |
| One comment anchored to several things at once      | dropped (step 10), see the epic   |
| Automatic re-anchoring by fuzzy text matching       | not built — manual re-anchor only |
| Comments on category (prototype) content-node trees | never — see the validation below  |
| Mentions, notifications                             | 05                                |

## Verify this first — the whole design rests on it

**HTMLPurifier strips unrecognised attributes.** `api/config/packages/exercise_html_purifier.yaml`
is currently near-default (only `Core.Encoding`), which means the standard whitelist:
`<span class="...">` survives, but **`data-comment-id` is stripped on save** by
`api/src/InputFilter/CleanHTMLFilter.php`.

Allow-listing is therefore not "add `span` to a tag list" — it needs an explicit attribute
definition on the HTMLDefinition (`%HTML.AllowedAttributes` plus a custom attribute registration, or
`HTMLPurifier_HTMLDefinition::addAttribute('span', 'data-comment-id', 'Text')` via a definition
customisation, and a bumped `HTML.DefinitionRev`). **Write a throwaway test that PATCHes a
`SingleText` containing `<span data-comment-id="x">y</span>` and asserts the attribute survives,
before writing anything else in this phase.** If it cannot be made to survive cleanly, the anchor
must move out of the HTML (e.g. character offsets), which is a different design.

**Tiptap drops unknown marks on parse.** `TiptapEditor.vue`'s extension list has no span-producing
mark, so a stored `data-comment-id` span round-trips away the moment a user edits and saves. A
custom Mark extension is mandatory regardless — this is not optional polish.

## Backend changes

### New columns

```php
#[AssertBelongsToSameCamp]
#[Groups(['read', 'create', 'update'])]   // update: so an orphan can be re-anchored
#[ORM\ManyToOne(targetEntity: ContentNode::class)]
#[ORM\JoinColumn(nullable: true, onDelete: 'set null')]
public ?ContentNode $contentNode = null;

#[Assert\Length(max: 128)]
#[Assert\Regex('/^data(\.[A-Za-z0-9_]+|\[[0-9a-f-]{36}\])*$/')]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'string', length: 128, nullable: true)]
public ?string $anchorPath = null;

#[Assert\Length(max: 36)]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'string', length: 36, nullable: true)]
public ?string $anchorId = null;      // tiptap mark id

#[InputFilter\Trim]
#[InputFilter\CleanText]
#[Assert\Length(max: 255)]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'text', nullable: true)]
public ?string $anchorText = null;    // snapshot; doubles as the orphan label
```

The anchor fields **must** be in the `update` group, not only `create` — re-anchoring after a
concurrent edit is the entire reason `anchorText` exists.

Add `contentNode` to the `SearchFilter` properties. Validation:

```
Expression: anchorPath === null or contentNode !== null
Expression: anchorId   === null or (contentNode !== null and anchorPath !== null)
Expression: contentNode === null or activity !== null      // categories are not commentable
Expression: parent === null or (contentNode === null and anchorPath === null
                                and anchorId === null)     // replies inherit the anchor
```

The third expression is worth stating rather than assuming: category prototype trees have
`activity === null`, and we deliberately do not support commenting on them. Making the rule explicit
keeps the "denormalise `activity` onto every anchor" guarantee total, which is what lets the
dashboard badge stay one indexed query.

No new validator class is needed: `AssertBelongsToSameCamp` already handles `ContentNode`, which
implements `BelongsToContentNodeTreeInterface` and is resolved by `GetCampFromContentNodeTrait`.

### Prototype copy — same PR, not later

`api/src/Entity/ContentNode.php:274` copies `$prototype->data` verbatim, so the instant anchor spans
exist in stored HTML, a copied camp inherits `data-comment-id` marks with no comments behind them.

**Is the fork's `CommentAnchors::stripFromData()` good enough? Yes — with two tightenings.** It
`array_walk_recursive`s every string in the JSON and regex-strips the attributes, leaving the span
tags in place. Regex-on-HTML is normally a smell, but here it is defensible and arguably better than
the alternative:

- It strips **attributes, not tags**, so it stays correct for nested and overlapping anchor spans —
  which a tag-unwrapping regex would corrupt.
- Its input is HTMLPurifier-normalised output, not arbitrary web HTML: attribute quoting is
  predictable.
- The leftover span is genuinely inert. Because tiptap drops unknown marks on parse (above), it
  disappears on the next edit anyway.
- The "proper" alternative — parsing each string with `DOMDocument` — is more code and runs in the
  camp-creation hot path, for no correctness gain on this constrained input.

Tightenings before merging it: make the pattern tolerant of single quotes and of `comment-mark`
appearing alongside other classes, and add tests for nested spans, overlapping spans and a
multi-class `class` attribute. `api/tests/Util/CommentAnchorsTest.php` from the fork is the starting
point.

Comments themselves stay excluded from prototype copies by omission (`Comment` does not implement
`CopyFromPrototypeInterface`). Keep it that way.

### Optional

An inverse `#[ORM\OneToMany]` on `ContentNode` would give a free `_links.comments` on every content
node. **Large snapshot churn** — it touches every content-node snapshot. Skip it; the
`?contentNode=` filter already works.

## Frontend changes

### Anchor registry

Extend `frontend/src/components/comments/commentsState.js` (~+50 lines), keyed to mirror
`apiPropsMixin`. All comments UI state stays in that one module — phase 01 left it holding only
`{ open: false }`, since camp and activity come from `router.js`'s route helpers, and this is where
it grows.

```js
export const commentsState = reactive({
  open: false, // phase 01
  commentsLoaded: false, // editors must not reconcile highlights before this
  activeCommentUri: null, // the focused thread
})

export const anchorKey = (targetUri, path = null) => `${targetUri}#${path ?? ''}`

// host: { el?, resolve?: (anchorId) => Element|null,
//         scrollIntoView?, setActive?: (bool) => void, getTop?: () => number }
export function registerAnchorSurface(key, host) // → unregister()
export function resolveAnchor(comment) // → Element | null
export function focusAnchor(anchorId) //   panel → content
export function focusComment(commentUri, anchorId) // content → panel
```

Keep the registry of hosts itself in a plain module-scope `Map` outside the `reactive()` — it holds
element references and callbacks, which have no business being reactive. Only the flags above are.

`anchorId` is deliberately **not** part of the key: one editor owns every mark id for its
`(uri, path)`. The registry resolves the surface; the surface resolves the id.

Positions are read on demand inside a `requestAnimationFrame` pass, never stored reactively.
Grouping in the panel is `groupBy(comments, commentAnchorKey)`; thread order down the panel is
`getBoundingClientRect().top` of each resolved element, with unresolved (orphaned) threads pinned to
the bottom. That is Google Docs' ordering behaviour and it needs no backend ordering.

### Registering a surface — one call each

A `commentAnchorMixin` (or `useCommentAnchor`) wraps register-on-mount / unregister-on-unmount:

- **LA thematic-area checkbox** (`LAThematicArea.vue`): one call per row, `el` = the row, no
  `resolve`.
- **Rich text** (`TiptapEditor.vue`, reached through `ApiRichtext`, which _already_ receives `uri`
  and `path`): one call plus
  `resolve: (id) => root.querySelector('[data-comment-id="' + id + '"]')`.
  **This single change lights up Notes, Storycontext, SafetyConsiderations, LearningObjectives,
  LearningTopics and every Storyboard cell at once**, because they all go through `api-richtext`
  with distinct `path`s. That is the whole payoff of reusing `uri` + `path`.
- **Picasso schedule entry**: one call, target `scheduleEntry`, `path: null`. Needs the
  `scheduleEntry` FK column, which can land in this migration or a later one.

A `targetField(target)` helper (~8 lines) maps a resource type to its payload key
(`activity` | `contentNode` | `scheduleEntry`), so the create call reads:

```js
createComment({ target: contentNode, path, anchorId, anchorText, text })
```

### The tiptap mark

Start from the fork's `frontend/src/components/form/tiptap/CommentMark.js` (~344 lines) — see the
evaluation above. It pulls a corresponding amount of churn into `TiptapEditor.vue` (~290 lines in
the fork); review that diff rather than copying it wholesale, since our editor must call
`registerAnchorSurface` rather than the fork's `commentsController`.

Also lift `frontend/src/helpers/randomUuid.js` from the fork — it extracts the `crypto.randomUUID`
polyfill currently inlined in `Storyboard.vue:89-108`, which the mark needs too.

### Print — do not strip; fix one parser rule instead

The plan is **not** to strip anchor spans in the renderers. Checked both:

**Nuxt print (`print/components/generic/RichText.vue`): nothing to do.** It is
`v-html="DOMPurify.sanitize(richText)"` with default DOMPurify config (deliberately, per the
comment in the file) — `<span>`, `class` and `data-*` all survive, and grepping the repo for
`comment-mark` finds no CSS rule anywhere, in `typography.css`, `tailwind.css`, `print-preview.css`
or the Tailwind `tw-prose` styles. An unstyled inline span inherits everything and renders its text
identically. Every content-node component routes through this one file, so one place governs it.

**Client-side PDF (`frontend/src/pdf/campPrint/RichText.vue`): one 4-line fix, and it is a bug fix.**
This one is not a styling question. It parses with `html-parse-stringify` and dispatches through a
rule **allow-list** — `text`, `p`, `br`, `h1-h3`, `strong|b`, `em`, `u`, `s|strike`, `ul|ol`, `li` —
and a miss returns `null` **without recursing**:

```js
const rule = rules.find((rule) => rule.shouldProcessNode(node, parent))
if (!rule) {
  console.log('unknown HTML node type', node)
  return null // children never visited
}
```

So `<p>foo <span data-comment-id="x">bar</span> baz</p>` renders `foo ` and ` baz` — **`bar`
disappears**. Silent data loss, with only a `console.log` inside a worker. Add a generic passthrough
rule at the end of `rules`:

```js
{ shouldProcessNode: (node) => node.type === 'tag',
  processNode: (node) => h('Text', {}, visitChildren(node.children, node)) },
```

This is strictly better than stripping in two places: it is smaller, it lives in one file, and it
**fixes an existing latent bug** — today _any_ stray tag in stored rich text eats its own text
content in printed PDFs, not just our future anchor spans.

`frontend/src/pdf/campPrint/RichText.vue` currently has **no unit test** (the only PDF test is the
snapshot-level `renderer/__tests__/vueRenderer.spec.js`, and no fixture contains a `<span>`). Add
one covering the passthrough rule; it is the cheapest place to lock this down.

### Card positioning — do not build float alignment

Honest assessment: the activity content card is `max-width: 944px` and centred
(`ScheduleEntry.vue:12`, `ContentCard.vue:6`) and the margin column is 320–340px, so the visual delta
over a plain ordered list is small — while the cost is the fork's ~150 lines of
`computeLayout` / `resolveCollisions` / signature-guard / double-`requestAnimationFrame` /
`updated()` re-entrancy. That is code someone decodes at 3am.

Ship instead: a stacked list sorted by document order, click → `scrollIntoView({ block: 'center' })`
plus a 1.5-second CSS highlight flash, and the reverse on anchor click. Roughly 80% of the feel for
5% of the code.

If float alignment is later demanded, the rule that prevents the fork's growing-page loop:
**cards are absolutely positioned inside the fixed-width, viewport-height drawer, and the only thing
JS writes is `transform: translateY()`.** The drawer's box does not depend on card heights, so
measuring cannot grow anything, and `transform` is compositor-only, so there is no reflow. One
rAF-batched pass driven by a `ResizeObserver` on the content root plus a passive scroll listener.
Do not wait for CSS anchor positioning (`anchor-name` / `position-anchor`) — still not
cross-browser.

### Orphan handling and re-anchoring

An anchored thread whose mark is gone (the text was rewritten, or the content node was deleted and
`contentNode` went to `NULL`) renders at the bottom of the panel showing its `anchorText` snapshot
as a quote, plus a **re-anchor** action: select text in the content, click re-anchor, and the thread
PATCHes new `contentNode` / `anchorPath` / `anchorId` / `anchorText`. Manual only — no fuzzy
matching. The panel must distinguish "not on this page" (an anchor in a different activity) from
"lost" and not offer re-anchor for the former.

Editors must not reconcile or strip highlight spans before the comments collection has loaded, or
they wipe valid anchors while the collection is momentarily empty. The fork hit this; keep its
`commentsLoaded` guard as an explicit flag on `commentsState` (above), set by `CommentsList` once its
collection resolves.

## Files touched

```
api/src/Entity/Comment.php                                      modified
api/src/Entity/ContentNode.php                                  modified (copyFromPrototype)
api/src/Util/CommentAnchors.php                                 new (from the fork, tightened)
api/tests/Util/CommentAnchorsTest.php                           new (+nested/overlap/multi-class)
api/config/packages/exercise_html_purifier.yaml                 modified (attribute definition)
api/migrations/schema/VersionYYYYMMDDHHMMSS.php                 new
api/fixtures/comments.yml                                       +anchored fixtures
api/tests/Api/Comments/*.php                                    +anchor cases
api/tests/Api/ContentNodes/**                                   +data-comment-id survives purifier
api/tests/Api/SnapshotTests/__snapshots__/                      all three regenerated

frontend/src/components/comments/commentsState.js               +registry, +flags
frontend/src/components/comments/__tests__/commentsState.spec.js   new
frontend/src/components/comments/CommentsList.vue               modified (sets commentsLoaded)
frontend/src/mixins/commentAnchorMixin.js                       new
frontend/src/components/form/tiptap/CommentMark.js              new (from the fork)
frontend/src/components/form/tiptap/TiptapEditor.vue            modified
frontend/src/components/form/api/ApiRichtext.vue                modified
frontend/src/components/activity/content/LAThematicArea.vue     modified
frontend/src/helpers/randomUuid.js                              new (from the fork)
frontend/src/components/activity/content/Storyboard.vue         use randomUuid
frontend/src/components/comments/CommentThread.vue              +anchor quote, re-anchor
frontend/src/pdf/campPrint/RichText.vue                         +passthrough rule (bug fix)
frontend/src/pdf/campPrint/__tests__/RichText.spec.js           new
frontend/src/locales/en.json, de.json                           +keys

print/                                                          NOT touched — DOMPurify + v-html
                                                                already renders spans harmlessly
```

## Tests

```bash
docker compose exec api composer test tests/Api/Comments/
docker compose exec api composer test tests/Util/CommentAnchorsTest.php
docker compose exec api composer cs-fix && docker compose exec api composer psalm
docker compose exec frontend npm run test:unit
docker compose exec print npm run test
```

Specific cases that must exist:

- **`data-comment-id` survives `CleanHTMLFilter`** — the keystone test, write it first;
- creating a comment with `anchorPath` but no `contentNode` → 422;
- `anchorId` without `anchorPath` → 422;
- an `anchorPath` that fails the regex → 422;
- a `contentNode` whose activity is null (a category prototype tree) → 422;
- a `contentNode` from a different camp → 422 "Must belong to the same camp.";
- a reply carrying an anchor → 422;
- PATCH re-anchoring an orphan to a different content node of the same activity → 200;
- deleting a content node sets `contentNode` to NULL and leaves the comment readable;
- **deleting a parent `ColumnLayout`** (DB cascade path, no processor) does the same — this is the
  case a remove-processor would have missed, and it is a tested, intended behaviour of the API (see
  the epic's "Known gaps");
- `CommentAnchorsTest` — nested spans, overlapping spans and multi-class `class` attributes survive
  stripping intact;
- creating a camp from a prototype whose content contains anchor spans produces content with no
  `data-comment-id` and no comments;
- `RichText.spec.js` — an unknown tag renders its text content rather than dropping it.

**Snapshots:** all three regenerated.

## Verification

1. In an activity's Notes, select a sentence and add a comment. The text gains a highlight; a card
   appears in the panel quoting the selection.
2. Reload. The highlight is still there — this proves the purifier keeps `data-comment-id`.
3. Edit an unrelated paragraph in the same field and let it autosave. The highlight survives — this
   proves the Mark extension round-trips.
4. Click the card → the page scrolls to the sentence and it flashes. Click the highlight → the card
   activates in the panel.
5. Add a comment on one storyboard cell and one LA thematic-area checkbox. Both appear as separate
   anchored threads; the checkbox thread highlights its row.
6. Rewrite the commented sentence entirely. The thread moves to the bottom of the panel, showing its
   snapshot as a quote. Select new text, click re-anchor; the thread reattaches.
7. Delete the whole content node, then (in another activity) delete the _parent column layout_ of a
   commented content node. Both threads survive, orphaned, still showing their snapshots.
8. Create a camp from a prototype whose activities contain anchored comments. The new camp's content
   contains no `data-comment-id` and no comments.
9. Print the camp both ways. In the Nuxt print and in the client-side PDF, the commented sentence
   renders **in full** — this is the regression the passthrough rule prevents.
10. Resolve an anchored thread. Its highlight disappears from the text but the thread is still
    reachable under "show resolved".

## Open questions

- **BLOCKING** — can HTMLPurifier be configured to keep `data-comment-id` cleanly? Verify before
  anything else. If not, the anchor must move out of the HTML and this phase is redesigned.
- Ship the `scheduleEntry` FK in this migration, or wait for the picasso work? _Default: wait_ —
  one nullable column plus an index is a trivial later migration.
- Take the MIT `@sereneinserenade/tiptap-comment-extension` instead of the fork's `CommentMark.js`?
  _Default: no_, see the evaluation above. Revisit if `CommentMark.js` proves hard to maintain.
- Should the generic passthrough rule in the PDF renderer be its own PR? _Default: yes_ — it is an
  independent bug fix and lands cleanly before this phase.

## Done criteria

- [ ] `data-comment-id` survives a save through `CleanHTMLFilter`, proven by a test.
- [ ] A comment can be anchored to a text range, a storyboard cell and an LA checkbox, using one
      registry call per surface type.
- [ ] Category content nodes are rejected as anchor targets by the API.
- [ ] Card ↔ anchor focus works in both directions, with scroll and highlight.
- [ ] An orphaned thread shows its snapshot and can be manually re-anchored.
- [ ] Deleting a content node — including via parent cascade — orphans rather than deletes.
- [ ] Prototype copies carry no anchor attributes and no comments, including for nested/overlapping
      spans.
- [ ] Both print paths render commented text in full; the PDF renderer has a passthrough rule and a
      test for it.
- [ ] No float-positioning code was written.
