# Phase 04 — Inline anchoring (roadmap step 7)

See [epic.md](epic.md) for the datamodel and decisions. Requires [03-conversations.md](03-conversations.md).

**Gate this phase on epic decision 5** and on phases 01–03 being in production use. It is roughly
three times the size of everything before it, and it is the only step that breaks an invariant the
feature currently gets for free.

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

## Non-goals

| Not in this phase                                        | Where                             |
| -------------------------------------------------------- | --------------------------------- |
| Google-Docs float-aligned card positioning               | not built — see below             |
| One comment anchored to several things at once (step 10) | dropped, see the epic             |
| Referencing an anchor inline in the comment text         | dropped with step 10              |
| Automatic re-anchoring by fuzzy text matching            | not built — manual re-anchor only |
| Mentions, notifications                                  | 05                                |

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

Add `contentNode` to the `SearchFilter` properties. Add the fourth threading expression from phase
03: a reply carries no anchor of its own (`parent === null or (contentNode === null and
anchorPath === null and anchorId === null)`), plus:

```
Expression: anchorPath === null or contentNode !== null
Expression: anchorId   === null or (contentNode !== null and anchorPath !== null)
```

No new validator class is needed: `AssertBelongsToSameCamp` already handles `ContentNode`, which
implements `BelongsToContentNodeTreeInterface` and is resolved by `GetCampFromContentNodeTrait`.

Remember the epic's rule: **`activity` stays denormalised** onto every anchor inside an activity's
content-node tree, so `GET /activities/{id}/comments` keeps working and the dashboard badge stays one
indexed query.

### Purifier

Allowlist `span[data-comment-id]` in `api/config/packages/exercise_html_purifier.yaml`. This is the
moment the comment anchor becomes part of stored content-node HTML.

### Prototype copy — same PR, not later

`api/src/Entity/ContentNode.php:274` currently copies `$prototype->data` verbatim, so the instant
anchor spans exist in stored HTML, a copied camp inherits `data-comment-id` marks with no comments
behind them. Take the fork's `api/src/Util/CommentAnchors.php` and call `stripFromData()` from
`copyFromPrototype()`.

Note _why_ the fork's implementation is right: it strips only the attributes
(`data-comment-id`, `class="comment-mark"`) and leaves the span tags in place. They are inert
without the attribute and get unwrapped on the next edit — and this stays correct for nested,
overlapping anchor spans, which a tag-unwrapping regex would corrupt.

Comments themselves stay excluded from prototype copies by omission (`Comment` does not implement
`CopyFromPrototypeInterface`). Keep it that way.

### Optional

An inverse `#[ORM\OneToMany]` on `ContentNode` would give a free `_links.comments` on every content
node. **Large snapshot churn** — it touches every content-node snapshot. Budget for it or skip it;
the `?contentNode=` filter already works.

## Frontend changes

### Anchor registry

Extend `commentsState.js` with a registry (~40 lines), keyed to mirror `apiPropsMixin`:

```js
export const anchorKey = (targetUri, path = null) => `${targetUri}#${path ?? ''}`

// host: { el?, resolve?: (anchorId) => Element|null,
//         scrollIntoView?, setActive?: (bool) => void, getTop?: () => number }
export function registerAnchorSurface(key, host) // → unregister()
export function resolveAnchor(comment) // → Element | null
export function focusAnchor(anchorId) //   panel → content
export function focusComment(commentUri, anchorId) // content → panel
```

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

Reuse the fork's `frontend/src/components/form/tiptap/CommentMark.js` (~344 lines) — this is the
genuinely hard part and it is already written and tested there. It pulls a corresponding amount of
churn into `TiptapEditor.vue` (~290 lines in the fork); review that diff rather than copying it
wholesale, since our editor must call `registerAnchorSurface` rather than the fork's
`commentsController`.

Also lift `frontend/src/helpers/randomUuid.js` from the fork — it extracts the `crypto.randomUUID`
polyfill currently inlined in `Storyboard.vue:89-108`, which the mark needs too. That is a small
tidy-up the fork got right.

### Print — the fork covers neither renderer

Strip `data-comment-id` and `class="comment-mark"` in **both**:

- `frontend/src/pdf/campPrint/RichText.vue` (client-side react-pdf), and
- `print/components/...` (the Nuxt server-side renderer).

Neither currently sees comments at all, so this is purely about the spans now living inside content
HTML. Add a case to each renderer's test.

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
`commentsLoaded` guard as an explicit flag in `commentsState`.

## Files touched

```
api/src/Entity/Comment.php                                      modified
api/src/Entity/ContentNode.php                                  modified (copyFromPrototype)
api/src/Util/CommentAnchors.php                                 new (from the fork)
api/tests/Util/CommentAnchorsTest.php                           new (from the fork)
api/config/packages/exercise_html_purifier.yaml                 modified
api/migrations/schema/VersionYYYYMMDDHHMMSS.php                 new
api/fixtures/comments.yml                                       +anchored fixtures
api/tests/Api/Comments/*.php                                    +anchor cases
api/tests/Api/SnapshotTests/__snapshots__/                      all three regenerated

frontend/src/components/comments/commentsState.js               +registry
frontend/src/mixins/commentAnchorMixin.js                       new
frontend/src/components/form/tiptap/CommentMark.js              new (from the fork)
frontend/src/components/form/tiptap/TiptapEditor.vue            modified
frontend/src/components/form/api/ApiRichtext.vue                modified
frontend/src/components/activity/content/LAThematicArea.vue     modified
frontend/src/helpers/randomUuid.js                              new (from the fork)
frontend/src/components/activity/content/Storyboard.vue         use randomUuid
frontend/src/components/comments/CommentThread.vue              +anchor quote, re-anchor
frontend/src/pdf/campPrint/RichText.vue                         strip anchors
print/components/...                                            strip anchors
frontend/src/locales/en.json                                    +keys
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

- creating a comment with `anchorPath` but no `contentNode` → 422;
- `anchorId` without `anchorPath` → 422;
- an `anchorPath` that fails the regex → 422;
- a `contentNode` from a different camp → 422 "Must belong to the same camp.";
- a reply carrying an anchor → 422;
- PATCH re-anchoring an orphan to a different content node of the same activity → 200;
- deleting a content node sets `contentNode` to NULL and leaves the comment readable;
- **deleting a parent `ColumnLayout`** (DB cascade path, no processor) does the same — this is the
  case a remove-processor would have missed;
- `CommentAnchorsTest` — nested/overlapping spans survive stripping intact;
- creating a camp from a prototype whose content contains anchor spans produces content with no
  `data-comment-id` and no comments;
- both print renderers emit no `data-comment-id`.

**Snapshots:** all three regenerated. If the optional `ContentNode` inverse relation is taken, every
content-node snapshot changes too.

## Verification

1. In an activity's Notes, select a sentence and add a comment. The text gains a highlight; a card
   appears in the panel quoting the selection.
2. Click the card → the page scrolls to the sentence and it flashes. Click the highlight → the card
   activates in the panel.
3. Add a comment on one storyboard cell and one LA thematic-area checkbox. Both appear as separate
   anchored threads; the checkbox thread highlights its row.
4. Rewrite the commented sentence entirely. The thread moves to the bottom of the panel, showing its
   snapshot as a quote. Select new text, click re-anchor; the thread reattaches and the highlight
   returns.
5. Delete the whole content node. The thread survives, orphaned, still showing its snapshot.
6. Delete the _parent column layout_ of a commented content node. Same result — this is the DB
   cascade path.
7. Create a camp from a prototype whose activities contain anchored comments. The new camp's content
   contains no `data-comment-id` and no comments.
8. Print the camp (both the client-side PDF and the Nuxt print). No stray spans, no comments.
9. Resolve an anchored thread. Its highlight disappears from the text but the thread is still
   reachable via "show resolved".

## Open questions

- **BLOCKING** — epic decision 5. If inline anchoring is not real, most of this phase disappears and
  only the checkbox/schedule-entry anchoring (which needs no purifier change, no prototype-copy fix
  and no print change) is worth doing.
- Ship the `scheduleEntry` FK in this migration, or wait for the picasso work? _Default: wait_ —
  one nullable column plus an index is a trivial later migration, and the picasso UI is a separate
  effort.
- Take the optional `ContentNode` inverse relation? _Default: no_, because of the snapshot churn.
- What happens to an anchored thread when the activity itself is deleted? `activity` goes NULL via
  `ActivityRemoveProcessor` and `contentNode` goes NULL via DB cascade, so it lands in phase 02's
  orphan list with both `orphanDescription` and `anchorText`. Confirm that page renders both.

## Done criteria

- [ ] A comment can be anchored to a text range, a storyboard cell, and an LA checkbox, using one
      registry call per surface type.
- [ ] Card ↔ anchor focus works in both directions, with scroll and highlight.
- [ ] An orphaned thread shows its snapshot and can be manually re-anchored.
- [ ] Deleting a content node — including via parent cascade — orphans rather than deletes.
- [ ] Prototype copies carry no anchor attributes and no comments.
- [ ] Neither print renderer emits `data-comment-id`.
- [ ] No float-positioning code was written.
