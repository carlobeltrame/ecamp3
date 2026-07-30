# Phase 04 — Inline anchoring (roadmap step 7)

See [epic.md](epic.md) for the datamodel and decisions. Requires
[03-conversations.md](03-conversations.md).

This is a real future feature, not a speculative one — nothing in phases 01–03 may make it harder to
reach. It is still the largest phase by a wide margin, and it is the only step that breaks an
invariant the feature currently gets for free, so it stays gated on 01–03 being in production use.

## Goal

A comment points at the thing it is about: a selected sentence in a Notes field, one cell of a
storyboard, one checkbox of an LA thematic area, or a schedule entry on the picasso. Clicking a card
scrolls to and highlights its anchor; clicking a highlight focuses its card. Anchors survive editing
around and inside them, and find themselves again after a cut-and-paste. When one is genuinely lost —
someone rewrote the sentence — the thread is not lost with it: it shows the stored snapshot and can be
re-anchored.

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
   lines), which already handles overlapping marks, paste stripping, draft decorations and
   snippet-based recovery against _this_ codebase.

**Recommendation: start from the fork's `CommentMark.js`.** The MIT package is a smaller dependency
but only covers the easy third of the problem, and we would end up reimplementing the rest anyway.
Evaluate the package again only if `CommentMark.js` proves hard to maintain.

## Anchor lifetime — what survives an edit, and what does not

The anchor is a ProseMirror **mark**, so it is stored per text node and remapped by ProseMirror
through every transaction. That gives the following behaviour, all of it a consequence of the data
structure rather than of code we write:

| what the user does                         | what happens to the anchor                      |
| ------------------------------------------ | ----------------------------------------------- |
| Adds a word **inside** the anchored range  | Survives; the new text joins the anchor         |
| Deletes a word inside the range            | Survives on the remaining text                  |
| Types at either **edge** of the range      | Anchor does **not** grow (`inclusive: false`)   |
| Deletes text **across** the range's middle | Survives as two runs with the same id           |
| Reformats the range (bold, list, …)        | Survives; marks coexist                         |
| Deletes the whole range                    | **De-anchored** — thread keeps its `anchorText` |
| Copies the range and pastes it elsewhere   | Paste carries **no** anchor (`transformPasted`) |
| Cuts the range and pastes it back          | Mark is gone from the cut; see recovery below   |

Two of these deserve explicit design decisions.

**Copy-paste must not duplicate anchors.** The fork's `transformPasted` handler strips comment marks
from every pasted slice, which is Google Docs' behaviour and the only sane one: a comment thread has
exactly one anchor (step 10 is dropped), so a second highlight for the same thread would make
"scroll to the anchor" ambiguous and "delete the thread" leave a stray highlight behind. Keep it.

**Cut-paste and delete-retype recover automatically, by exact text match only.** Because the mark
travels with neither, both leave the thread de-anchored even though the text is still there — which
would feel broken. The fork already solves this and it is worth taking:
`findSnippetRanges(doc, anchorText)` locates the stored snapshot in the document and re-applies the
mark **only when it matches exactly once** across that content node's editors
(`commentsController.reanchorContentNode`). Zero matches or two or more leave the thread orphaned for
manual re-anchoring, because guessing would attach the thread to the wrong sentence.

This is exact substring matching, not fuzzy matching — deterministic, no scoring, no thresholds, and
it is the difference between "cut and paste a paragraph and your comments follow" and "cut and paste
a paragraph and you silently lose every comment on it".

Two consequences to be aware of when implementing it:

- Re-anchoring **writes to the document**, so it can trigger an autosave shortly after an activity is
  opened. Only do it when the comments collection has loaded and only for open threads (the fork's
  `commentsLoaded` guard plus its `hasAnchor` short-circuit), so the common case — nothing orphaned —
  performs no write at all.
- Do **not** copy the fork's second sweep, which _strips_ highlight spans it cannot match to a
  comment. See "The tiptap mark" below: with decoration-based styling there is nothing to strip, and
  a sweep that deletes marks it does not recognise is one race away from destroying valid anchors.

## Non-goals

| Not in this phase                                   | Where                                   |
| --------------------------------------------------- | --------------------------------------- |
| Google-Docs float-aligned card positioning          | not built — see below                   |
| One comment anchored to several things at once      | dropped (step 10), see the epic         |
| Fuzzy / scored re-anchoring                         | not built — exact unique match only     |
| Comments on category (prototype) content-node trees | never — see the validation below        |
| Anchoring to a schedule entry                       | postponed — see the open question below |
| Mentions, notifications                             | 05                                      |

## HTMLPurifier — three lines of config, already solved

`api/config/packages/exercise_html_purifier.yaml` is currently near-default (only `Core.Encoding`),
so `data-comment-id` is stripped on save by `api/src/InputFilter/CleanHTMLFilter.php`. Allow-listing
it is a three-line addition under the existing `default` profile:

```yaml
attributes:
  span:
    data-comment-id: CDATA
```

The `exercise/htmlpurifier-bundle` does the awkward part for us:
`HTMLPurifierConfigFactory::create()` sets `HTML.DefinitionID` / `HTML.DefinitionRev`, calls
`maybeGetRawHTMLDefinition()`, and forwards `attributes` to
`HTMLPurifier_HTMLDefinition::addAttribute()` (`api/vendor/exercise/htmlpurifier-bundle/src/HTMLPurifierConfigFactory.php:46-70`).
No definition-revision bookkeeping and no custom PHP is needed. The definition is baked into the
serializer cache during warm-up, so this is not a per-request cost.

We do not need to version our HTML definition. The frontend is currently the only API client, and
API clients that do not yet exist cannot be broken by widening what we accept.

**Still write the test first.** The fork ships this config with no test covering it, and a silently
stripped attribute is exactly the failure that would waste a day of frontend debugging. First commit
of this phase: a test that POSTs/PATCHes a rich-text content node containing
`<span data-comment-id="x">y</span>` and asserts the attribute survives the round trip. It belongs
in `api/tests/Api/ContentNodes/`, and it stays in the suite — it is the regression guard for anyone
later tidying the purifier config.

**Tiptap drops unknown marks on parse.** `TiptapEditor.vue`'s extension list has no span-producing
mark, so a stored `data-comment-id` span round-trips away the moment a user edits and saves. A
custom Mark extension is mandatory regardless — this is not optional polish.

## Backend changes

### New columns

Every property gets a docblock in the house style — a short summary of what the column is for, in
full sentences. These are **not decoration**: API Platform reads them and they end up as `description`
in the OpenAPI spec, so `ResponseSnapshotTest__testOpenApiSpecMatchesSnapshot__1.yml` changes when
they change. Compare `Comment::$orphanDescription`, whose docblock appears verbatim in the snapshot at
three separate places today. Write them once, correctly, rather than regenerating snapshots twice.

```php
/**
 * The content node this comment is anchored to, for inline (Google-Docs-style) comments.
 * Null for comments about the whole activity or the whole camp. Only set on the root
 * comment of a thread; replies inherit the anchor from their parent.
 */
#[AssertBelongsToSameCamp]
#[AssertBelongsToSameActivity]
#[ApiProperty(example: '/content_node/single_texts/1a2b3c4d')]
// Updatable so an orphaned thread can be re-anchored, possibly to a different
// content node of the same activity.
#[Groups(['read', 'create', 'update'])]
#[ORM\ManyToOne(targetEntity: ContentNode::class)]
#[ORM\JoinColumn(nullable: true, onDelete: 'set null')]
public ?ContentNode $contentNode = null;

/**
 * Which field inside the content node this comment is about, as a path into the
 * content node's payload (the same paths the frontend already uses to address fields).
 * Null when the comment is about the content node as a whole.
 */
#[Assert\Length(max: 128)]
#[Assert\Regex('/^data(\.[A-Za-z0-9_]+|\[[0-9a-f-]{36}\])*$/')]
#[ApiProperty(example: 'data.sections[1a2b3c4d-....].column2Html')]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'string', length: 128, nullable: true)]
public ?string $anchorPath = null;

/**
 * The id of the comment mark (span[data-comment-id]) in the anchored rich text that
 * ties this thread to a range of text. Null when the comment is about a whole field
 * or a whole content node rather than a text range.
 */
#[Assert\Length(max: 36)]
#[ApiProperty(example: '1a2b3c4d-....')]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'string', length: 36, nullable: true)]
public ?string $anchorId = null;

/**
 * A plain-text snapshot of the anchored content, taken when the comment was created.
 * Shown as a quote in the comments panel, and used to manually find the right place
 * to re-anchor again after the content was edited. Null for comments about a whole
 * activity or camp.
 */
#[InputFilter\Trim]
#[InputFilter\CleanText]
#[Assert\Length(max: 255)]
#[ApiProperty(example: 'the sentence that was commented on')]
#[Groups(['read', 'create', 'update'])]
#[ORM\Column(type: 'text', nullable: true)]
public ?string $anchorText = null;
```

The anchor fields **must** be in the `update` group, not only `create` — re-anchoring after a
concurrent edit is the entire reason `anchorText` exists.

Add `contentNode` to the `SearchFilter` properties.

**Two divergences from the fork, both deliberate** — it is the file we copy from, so they are easy to
lose: the fork's `contentNode` join column is `onDelete: 'cascade'`, which **deletes the comment**
when its content node is deleted; ours is `set null`, so the thread survives as an orphan. And the
fork enforces `(contentNode === null) === (anchorId === null)`, which forbids the whole-card anchor we
explicitly want.

### Validation — one new validator, one extended

The fork writes all of this as `Assert\Expression`. Following phase 03's reasoning, most of these
rules earn a validator class instead: they are the kind of thing that gets a unit test with a table of
cases, and one of them cannot be an expression at all.

**`App\Validator\Comment\AssertValidAnchor`** — new, class-level on `Comment`, covering the three
rules that are really one rule, "the anchor is well formed":

| rule                                   | message                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `anchorPath` requires an anchor target | An anchorPath requires an anchor target.                        |
| `anchorId` requires an `anchorPath`    | An anchorId requires the anchorPath of the anchored field.      |
| a reply carries no anchor of its own   | Replies inherit the anchor from the root comment of the thread. |

One constraint class, one validator, one `AssertValidAnchorValidatorTest` enumerating the valid and
invalid combinations — which is the point, because these three rules define what an anchor _is_ and
they are the ones a future anchor type (schedule entries) must not break. Three separate inline
expressions would test the same logic with no test at all.

It has to be class-level, since it spans four properties, so it needs
`->atPath('anchorPath')` / `->atPath('anchorId')` to attach violations to the property the client got
wrong. That is a first for this codebase (`atPath` is currently unused) — worth the one-line novelty,
because the alternative is a violation on the resource with no field pointer.

**`App\Validator\Comment\AssertBelongsToSameActivity`** — created in phase 03 for `$parent`; extend it
here to also accept a `ContentNode` value, resolving the content node's activity through
`ContentNode::$root` and comparing it with `Activity::$rootContentNode`. That single extension covers
both remaining rules:

- the content node must belong to the comment's activity, and
- **category prototype trees are not commentable** — their root belongs to a `Category`, not an
  `Activity`, so `contentNode.root !== activity?.rootContentNode` holds for every one of them, and a
  comment with `activity === null` cannot carry a content node either. Keeping that impossible is what
  lets the "denormalise `activity` onto every anchor" guarantee stay total, and therefore what lets
  the dashboard badge stay one indexed query.

Add the `ContentNode` case to `AssertBelongsToSameActivityValidatorTest` in the same commit; the
validator now takes two value types, and the second one is the one with the tree walk in it.

`AssertBelongsToSameCamp` needs no change — it already handles `ContentNode` via
`BelongsToContentNodeTreeInterface` and `GetCampFromContentNodeTrait`.

### Prototype copy — same PR, not later

`api/src/Entity/ContentNode.php:274` copies `$prototype->data` verbatim, so the instant anchor spans
exist in stored HTML, a copied camp inherits `data-comment-id` marks with no comments behind them.

**The fork's `CommentAnchors::stripFromData()` is good enough, and it gets simpler here.** It
`array_walk_recursive`s every string in the JSON and regex-strips the anchor attribute, leaving the
span tags in place. Regex-on-HTML is normally a smell, but here it is defensible and arguably better
than the alternative:

- It strips **attributes, not tags**, so it stays correct for nested and overlapping anchor spans —
  which a tag-unwrapping regex would corrupt.
- Its input is HTMLPurifier-normalised output, not arbitrary web HTML: attribute quoting is
  predictable.
- The leftover span is genuinely inert, and invisible — the highlight is a decoration, not stored CSS
  (see "The tiptap mark"). Because tiptap drops unknown marks on parse, it disappears on the next edit
  anyway.
- The "proper" alternative — parsing each string with `DOMDocument` — is more code and runs in the
  camp-creation hot path, for no correctness gain on this constrained input.

The fork's version needs **two of its three lines**: because we do not store a `class` on the mark, the
second `preg_replace` stripping `class="comment-mark"` is deleted along with the multi-class problem it
would otherwise have had. What is left is one pattern over one attribute. Make it tolerant of single
quotes, and take `api/tests/Util/CommentAnchorsTest.php` from the fork with cases added for nested and
overlapping spans.

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
  showResolved: false, // phase 03's "Open" / "All" toggle
  commentsLoaded: false, // editors must not re-anchor before this
  activeCommentUri: null, // the focused thread
  anchors: [], // see below; set by CommentsList
  anchorGeneration: 0, // bumped when the set of mounted surfaces changes
})

export const anchorKey = (targetUri, path = null) => `${targetUri}#${path ?? ''}`

// host: { el?, resolve?: (anchorId) => Element|null, applyAnchor?, findSnippetRanges? }
export function registerAnchorSurface(key, host) // → unregister(); bumps anchorGeneration
export function resolveAnchor(comment) // → Element | null
export function focusAnchor(comment) //   panel → content
export function focusComment(commentUri) // content → panel
```

Keep the registry of hosts itself in a plain module-scope `Map` outside the `reactive()` — it holds
element references and callbacks, which have no business being reactive. Only the fields above are.

`anchorId` is deliberately **not** part of the key: one editor owns every mark id for its
`(uri, path)`. The registry resolves the surface; the surface resolves the id.

**`anchors` is one flat array of descriptors**, `{ commentUri, targetUri, anchorPath, anchorId,
anchorText, resolved }`, published by `CommentsList` once its collection resolves. Consumers filter it
themselves: an editor takes the entries matching its own `(uri, path)`. This deliberately replaces the
fork's four parallel structures (`highlightAnchorIds`, `allAnchorIds`, `anchorsByNode`,
`pendingAnchorIds`), which have to be kept mutually consistent by hand — one array with a `resolved`
flag expresses the same thing and cannot drift.

**Resolved threads must show their anchors under "All".** The panel's Open/All toggle
(`commentsState.showResolved`, phase 03) is the same switch that decides which anchors are visible in
the content: with **Open** selected only unresolved anchors are highlighted, and switching to **All**
makes the resolved ones appear too, in a **muted style** so it is obvious which threads are already
dealt with. Without that, "All" would list threads whose location you cannot see, which defeats the
reason for looking at them. Because highlighting is a decoration derived from `anchors` +
`showResolved` (below), this is a filter predicate, not a feature.

**Ordering — DOM order, not viewport position.** Phase 02 established the outer order: by activity in
programme position, then `createTime`. Within an activity this phase orders anchored threads by the
(DOM) document position of their anchor. The fork reads `getBoundingClientRect().top`; do not copy that.

Compare the resolved anchor **elements** with
[`Node.compareDocumentPosition`](https://developer.mozilla.org/en-US/docs/Web/API/Node/compareDocumentPosition)
instead:

```js
elA.compareDocumentPosition(elB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
```

This is strictly better on every axis that matters here:

- **It cannot jump while scrolling.** DOM order does not change when the page scrolls, so there is no
  reason to recompute on scroll at all. (Rect-based order is in fact also scroll-invariant — every
  anchor shifts equally — but only as long as nothing else moves; a lazily-rendered card or a
  collapsing section silently reorders the panel.)
- **It needs no layout read**, so no `requestAnimationFrame` batching, no forced reflow, no
  `ResizeObserver`.
- **It handles both levels with one comparator.** Marks are real DOM spans inside their editor, so
  comparing two anchors in the same rich text gives their in-text order for free — there is no separate
  "position inside a RichText" problem to solve.
- **It works for elements that are not on screen**, including `display: none` subtrees, where
  `getBoundingClientRect()` returns all zeroes and would sort everything to the top.

Anchors whose element does not resolve — a different activity, a collapsed content node, or nothing
mounted at all — do not get a document position. They fall back to `createTime`, after the resolved
ones. **In camp scope no editors are mounted at all**, so every anchored thread takes that path and the
panel is simply chronological within each activity group. That is the right answer rather than a
degradation: document order communicates nothing when the document is not next to the panel, and it
means camp scope needs no anchor machinery, no layout reads and no extra API data.

The reactivity is therefore one integer. The sorted list is a computed over `[comments,
anchorGeneration]`, where `anchorGeneration` is bumped by `registerAnchorSurface` / its unregister and
after a re-anchor. Editors mounting and unmounting is the only thing that can change the answer.

If a future surface ever needs to override this — an anchor host whose DOM order does not match its
logical order — the escape hatch is an optional `order` number on the host, consulted before the DOM
comparison. Do not build it until something needs it.

**De-anchored comments render inline, not in the orphan bucket.** A comment that still has its
`activity` but has lost its content-node anchor is not an orphan in phase 02's sense
(`orphanDescription !== null`, meaning the activity itself is gone). Render it immediately **above**
its activity's group, showing its `anchorText` snapshot as a quote, with the re-anchor action. Phase
02 designed the grouping with this slot in mind; this is where it gets filled.

### Registering a surface — one call each

A `commentAnchorMixin` (or `useCommentAnchor`) wraps register-on-mount / unregister-on-unmount:

- **Rich text** (`TiptapEditor.vue`, reached through `ApiRichtext`, which _already_ receives `uri`
  and `path`): one call plus
  `resolve: (id) => root.querySelector('[data-comment-id="' + id + '"]')`.
  **This single change lights up Notes, Storycontext, SafetyConsiderations, LearningObjectives,
  LearningTopics and every Storyboard cell at once**, because they all go through `api-richtext`
  with distinct `path`s. That is the whole payoff of reusing `uri` + `path`.
- **Whole content-node card** (`layout/ContentNodeCard.vue`): one call, `el` = the card root,
  `path: null`. One file covers every content type, including the ones with no rich text at all.
- **LA thematic-area option** (`LAThematicArea.vue`): one call per row in the `#selection` list,
  `path: 'data.options.<key>'`, `el` = the row.
- **Picasso schedule entry**: one call, target `scheduleEntry`, `path: null`. Needs the
  `scheduleEntry` FK column — postponed, see the open question below.

Every call site already knows what kind of thing it is anchoring to — `ContentNodeCard` is a content
node, on the picasso the only thing commentable is a schedule entry — so it just names the key:

```js
createComment({ contentNode: uri, anchorPath, anchorId, anchorText, textHtml })
```

`anchorKey(uri, path)` stays the one shared convention, because the registry genuinely needs a single
string key. That is the only thing that has to agree across surfaces.

### Creating and re-anchoring the non-text anchors

Text ranges have an obvious affordance — select, then a button in the bubble menu. The anchor types we
added over the fork need their own, and they are the reason the anchor model is generic in the first
place, so they are part of this phase rather than a follow-up:

- **A whole content-node card.** `ContentNodeCard.vue`'s toolbar already carries a `visible-on-hover`
  pencil button and an `IconWithTooltip`; add one `visible-on-hover` comment button beside them. One
  change, every content type — including MaterialList, Storyboard, LAThematicArea and anything added
  later, which is what makes it worth doing here instead of per component.
- **An LA thematic-area option.** The options are not standing checkboxes: `LAThematicArea.vue` renders
  an `e-select` whose `#item` rows live inside a transient dropdown, while the **selected** options are
  rendered as persistent `v-list-item` rows in the `#selection` slot. Anchor to the selection row, not
  the menu row: only a selected option can be commented on ("why did you tick this one?"), the row is
  visible without opening a menu, and a menu that closes cannot host a highlight. Hover affordance on
  the row, same as the card.
- **Re-anchoring these.** Re-anchoring is defined against a text selection, which a card or a checkbox
  does not have. For target-level anchors (`anchorId === null`) the action is therefore not
  "re-anchor to my selection" but a plain **PATCH of `contentNode` / `anchorPath`**, driven by clicking
  the comment affordance on the new target while the orphaned thread is focused in the panel. Same
  endpoint, same fields, different gesture — the panel picks the gesture based on whether the thread has
  an `anchorId`.
- **Losing a target-level anchor is the simple case.** There is no snippet to search for and no mark to
  reconcile: either the content node still exists (the anchor is intact by definition) or it was deleted
  and `contentNode` went to `NULL`. `anchorText` for these anchors holds the label rather than a
  sentence — the content node's `instanceName` or content-type name for a card, the translated option
  name for a checkbox — so an orphaned card comment still reads as "on _Notes_" and not as an empty
  quote.

### The tiptap mark

Start from the fork's `frontend/src/components/form/tiptap/CommentMark.js` (~344 lines) — see the
evaluation above. It pulls a corresponding amount of churn into `TiptapEditor.vue` (~290 lines in
the fork); review that diff rather than copying it wholesale, since our editor must call
`registerAnchorSurface` rather than the fork's `commentsController`.

Keep, verbatim, the three parts that encode behaviour we want and are easy to lose while
re-plumbing: `inclusive: false`, `excludes: ''` (so overlapping threads coexist instead of replacing
each other), and the `transformPasted` strip. Each is one line and each is a decision, not an
implementation detail — see the anchor-lifetime table above.

**Store no `class`, style with a decoration.** The fork's `renderHTML` emits
`<span class="comment-mark" data-comment-id="…">` and styles that class. Drop the class: `renderHTML`
emits the `data-comment-id` attribute and nothing else, and the visible highlight comes from a
ProseMirror **inline `Decoration`** over the marks the editor currently wants to show — exactly the
mechanism the fork already uses for drafts. Drafts then need no `--draft` class either; give their
decoration a `data-comment-draft` attribute and target that.

This is fewer moving parts, not more, and it removes three problems at once:

- **The purifier and the prototype-copy strip only ever deal with one attribute.** No `class` in stored
  HTML means no multi-class regex, and the second `preg_replace` in `CommentAnchors` disappears.
- **Resolved-vs-open styling becomes a filter.** The decoration set is derived from
  `commentsState.anchors` plus `showResolved`, so "muted highlights for resolved threads under All" is a
  predicate over data the panel already publishes — no attribute rewriting in the document.
- **Orphaned spans are invisible for free, so nothing has to strip them.** A `data-comment-id` with no
  matching comment simply gets no decoration. The fork instead runs a reconcile sweep that _removes_
  marks it cannot match, which mutates the user's document on load and is one loading race away from
  deleting valid anchors — the reason it needs a `commentsLoaded` guard around that sweep at all. Delete
  that sweep; keep the guard, which is still needed so re-anchoring does not run against an empty
  collection.

CSS then targets the decoration, and stored HTML carries no styling hooks whatsoever — which is also
why the print paths need no anchor-specific styling.

Also lift `frontend/src/helpers/randomUuid.js` from the fork — it extracts the `crypto.randomUUID`
polyfill currently inlined in `Storyboard.vue:89-108`, which the mark needs too. **Move its comment
across with it**, in particular the "should under no circumstances be used for security/cryptographic
purposes" warning and the link to <https://caniuse.com/mdn-api_crypto_randomuuid> explaining why the
polyfill exists at all. Extracting a shared helper is precisely the moment that warning stops being
obvious from context and starts mattering, since the next caller will not have read `Storyboard.vue`.
Anchor ids are another non-cryptographic use of it: they only have to be unique within one rich-text
field, and they are visible in the HTML anyway.

### Print — one new rule in the allowlist

The plan is **not** to strip anchor spans in the renderers. Checked both:

**Nuxt print (`print/components/generic/RichText.vue`): nothing to do.** It is
`v-html="DOMPurify.sanitize(richText)"` with default DOMPurify config (deliberately, per the
comment in the file) — `<span>`, `class` and `data-*` all survive, and grepping the repo for
`comment-mark` finds no CSS rule anywhere, in `typography.css`, `tailwind.css`, `print-preview.css`
or the Tailwind `tw-prose` styles. An unstyled inline span inherits everything and renders its text
identically. Every content-node component routes through this one file, so one place governs it.

**Client-side PDF (`frontend/src/pdf/campPrint/RichText.vue`): one new rule, and it stays an
allow-list.** This one is not a styling question. It parses with `html-parse-stringify` and dispatches
through a rule **allow-list** — `text`, `p`, `br`, `h1-h3`, `strong|b`, `em`, `u`, `s|strike`, `ul|ol`,
`li` — and a miss returns `null` **without recursing**, so `<p>foo <span data-comment-id="x">bar</span>
baz</p>` would render `foo ` and ` baz` with `bar` missing entirely.

Add a rule for the anchor span specifically, next to the others:

```js
{
  // Comment anchors are invisible in print: render the commented text, unstyled.
  shouldProcessNode: (node) =>
    node.type === 'tag' && node.name === 'span' && 'data-comment-id' in node.attrs,
  processNode: (node) => h('Text', {}, visitChildren(node.children, node)),
},
```

**Do not turn the allow-list into a passthrough.** The allow-list is what makes it
**impossible to ship a tiptap extension without implementing its print output**, and a whole missing
block is a bug someone notices, while silently unstyled text is a bug that reaches a printed camp
programme. Adding a rule per extension is the intended cost of adding an extension. Record it as a rule
for future work: **a new tiptap extension is not done until `campPrint/RichText.vue` renders it** — there
must be no stray tags.

`frontend/src/pdf/campPrint/RichText.vue` currently has **no unit test** (the only PDF test is the
snapshot-level `renderer/__tests__/vueRenderer.spec.js`, and no fixture contains a `<span>`). Add one
for the new rule — that an anchored range renders its text, in the right place, with the surrounding
marks intact. It is the cheapest place to lock this down, and it gives the next extension a test file to
add to.

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

A thread whose anchor is gone renders **above its activity's group** in the panel (phase 02 designed
the grouping with this slot in mind), showing its `anchorText` snapshot as a quote plus a **re-anchor**
action. Order of recovery:

1. **Automatic, exact and unique.** For a text anchor, `findSnippetRanges` finds the snapshot in the
   content node's editors; a single match re-applies the mark and the user never learns anything was
   wrong. This covers cut-paste and delete-retype. Zero or several matches fall through.
2. **Manual.** For a text anchor: select the new text, click re-anchor, and the thread PATCHes
   `contentNode` / `anchorPath` / `anchorId` / `anchorText`. For a target-level anchor (`anchorId ===
null`): click the comment affordance on the new card or option, as described above.

The panel must distinguish **"not on this page"** — an anchor in a different activity, or in a content
node not currently rendered — from **"lost"**, and must not offer re-anchor for the former. Getting this
wrong means offering to destroy a perfectly good anchor because its editor happens not to be mounted;
the test is whether the comment still has a `contentNode` that exists, not whether an element resolved.

Re-anchoring must not run before the comments collection has loaded, or it operates against a
momentarily empty set. Keep the fork's `commentsLoaded` flag on `commentsState`, set by `CommentsList`
once its collection resolves. Note that this is the only thing that guard is still for here — we do not
copy the fork's mark-stripping sweep (see "The tiptap mark").

### Dev data seeds

Phase 01 seeded the first comments; anchored comments need the same treatment, and for the same reason
— the toggle is on for `dev`, and an anchoring feature that nobody can see on `dev` gets reviewed by
nobody. Same dump-based procedure as phase 01 (`api/migrations/dev-data/README.md`): wipe the local DB
volume, create the comments **through the frontend**, run `./create-data-migration-dump.sh`, hand-edit
the new migration's `getDescription()`.

Seed one of each anchor shape, because each one exercises a different part of this phase:

- a text-range comment on a Notes field — the base case;
- two **overlapping** text ranges in one field — the `excludes: ''` case, and the only way stacked
  highlight styling ever gets looked at;
- a comment on one **storyboard cell**, which is the `anchorPath`-with-a-uuid-segment case;
- a comment on a whole **content-node card**;
- a comment on one **LA thematic-area option**;
- one **de-anchored** thread, made by anchoring a comment and then rewriting the sentence — so the
  orphan rendering and the re-anchor affordance are visible on `dev` without having to break something
  by hand;
- a **resolved** anchored thread, so the muted "All" highlight has a subject.

Keep the same two traps in mind as phase 01: the DB wipe is mandatory or IDs drift and the diff becomes
unreadable, and the e2e suite hard-codes dev-data IDs (`e2e/utils/constants.ts` plus the pinned ID lists
in `e2e/tests/9-behavior-tests/httpCache/`), so re-run the behavior tests afterwards.

## Files touched

```
api/src/Entity/Comment.php                                      modified (+4 columns, +docblocks)
api/src/Entity/ContentNode.php                                  modified (copyFromPrototype)
api/src/Util/CommentAnchors.php                                 new (from the fork, one attribute)
api/tests/Util/CommentAnchorsTest.php                           new (+nested, +overlapping)
api/src/Validator/Comment/AssertValidAnchor.php                 new
api/src/Validator/Comment/AssertValidAnchorValidator.php        new
api/tests/Validator/Comment/AssertValidAnchorValidatorTest.php  new
api/src/Validator/Comment/AssertBelongsToSameActivityValidator.php  modified (+ContentNode)
api/tests/Validator/Comment/AssertBelongsToSameActivityValidatorTest.php  +ContentNode cases
api/config/packages/exercise_html_purifier.yaml                 +3 lines
api/migrations/schema/VersionYYYYMMDDHHMMSS.php                 new
api/migrations/dev-data/data.sql                                regenerated (+anchored comments)
api/migrations/dev-data/Version<new>.php                        new (+ previous one gutted)
api/fixtures/comments.yml                                       +anchored fixtures
api/tests/Api/Comments/*.php                                    +anchor cases
api/tests/Api/ContentNodes/**                                   +data-comment-id survives purifier
api/tests/Api/SnapshotTests/__snapshots__/                      all three regenerated

frontend/src/components/comments/commentsState.js               +registry, +anchors, +flags
frontend/src/components/comments/__tests__/commentsState.spec.js   new
frontend/src/components/comments/CommentsList.vue               modified (publishes anchors)
frontend/src/mixins/commentAnchorMixin.js                       new
frontend/src/components/form/tiptap/CommentMark.js              new (from the fork, no class)
frontend/src/components/form/tiptap/TiptapEditor.vue            modified
frontend/src/components/form/api/ApiRichtext.vue                modified
frontend/src/components/activity/content/layout/ContentNodeCard.vue  modified (+comment button)
frontend/src/components/activity/content/LAThematicArea.vue     modified
frontend/src/helpers/randomUuid.js                              new (from the fork, +warning)
frontend/src/components/activity/content/Storyboard.vue         use randomUuid
frontend/src/components/comments/CommentThread.vue              +anchor quote, re-anchor
frontend/src/pdf/campPrint/RichText.vue                         +anchor-span rule
frontend/src/pdf/campPrint/__tests__/RichText.spec.js           new
frontend/src/locales/en.json                                    +keys

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

- **`data-comment-id` survives `CleanHTMLFilter`** — the keystone test, write it first, and keep it as
  the regression guard for the purifier config;
- `AssertValidAnchorValidatorTest` — the anchor-shape table: `anchorPath` without a target, `anchorId`
  without `anchorPath`, a reply carrying an anchor, and the valid combinations (target only, target +
  path, target + path + id, nothing at all);
- `AssertBelongsToSameActivityValidatorTest` — the new `ContentNode` cases: a content node of another
  activity, a content node of a category prototype tree, and the matching case;
- the same four rules once each through the API → 422 (the validator test covers the combinations; the
  API test proves they are wired up);
- an `anchorPath` that fails the regex → 422;
- a `contentNode` from a different camp → 422 "Must belong to the same camp.";
- PATCH re-anchoring an orphan to a different content node of the same activity → 200;
- deleting a content node sets `contentNode` to NULL and leaves the comment readable;
- **deleting a parent `ColumnLayout`** (DB cascade path, no processor) does the same — this is the
  case a remove-processor would have missed, and it is a tested, intended behaviour of the API (see
  the epic's "Known gaps");
- `CommentAnchorsTest` — nested and overlapping spans survive stripping intact;
- creating a camp from a prototype whose content contains anchor spans produces content with no
  `data-comment-id` and no comments;
- `commentsState.spec.js` — document-order sorting over registered surfaces, the `createTime` fallback
  for unresolved anchors, and that unregistering a surface bumps `anchorGeneration`;
- `RichText.spec.js` — an anchored range renders its text in place, with surrounding marks intact.

**Snapshots:** all three regenerated. Note that the four new docblocks alone change the OpenAPI
snapshot, so do not treat a docblock edit as a comment-only change.

## Verification

1. In an activity's Notes, select a sentence and add a comment. The text gains a highlight; a card
   appears in the panel quoting the selection.
2. Reload. The highlight is still there — this proves the purifier keeps `data-comment-id`.
3. Edit an unrelated paragraph in the same field and let it autosave. The highlight survives — this
   proves the Mark extension round-trips.
4. Click the card → the page scrolls to the sentence and it flashes. Click the highlight → the card
   activates in the panel.
5. Add a second, **overlapping** comment on part of the same sentence. Both highlights show; clicking
   the overlap focuses the smaller thread; deleting one leaves the other's highlight intact.
6. Insert a word in the middle of a commented sentence, then delete another word inside it. The
   highlight survives both. Type at each end of it: the highlight does not grow.
7. Select the commented sentence, cut it, and paste it into another paragraph of the same field. The
   pasted text carries the highlight again and the thread still points at it — this is the exact-match
   recovery, and the reason it exists.
8. Copy (not cut) a commented sentence and paste it elsewhere. The paste has **no** highlight and there
   is still exactly one anchor for the thread.
9. Add a comment on one storyboard cell, one whole content-node card, and one LA thematic-area option.
   Three separate anchored threads; each highlights its own surface.
10. Rewrite the commented sentence entirely. The thread moves above its activity's group, showing its
    snapshot as a quote. Select new text, click re-anchor; the thread reattaches.
11. Open the same activity from a **camp-scope** page. The anchored threads are listed
    chronologically, with no errors and no highlight machinery running.
12. Delete the whole content node, then (in another activity) delete the _parent column layout_ of a
    commented content node. Both threads survive, orphaned, still showing their snapshots.
13. Create a camp from a prototype whose activities contain anchored comments. The new camp's content
    contains no `data-comment-id` and no comments.
14. Print the camp both ways. In the Nuxt print and in the client-side PDF, the commented sentence
    renders **in full** — this is the regression the anchor-span rule prevents.
15. Resolve an anchored thread. Its highlight disappears from the text while the panel shows "Open".
    Switch to "All": the thread reappears in full **and so does its highlight**, muted.

## Open questions

- Ship the `scheduleEntry` FK in this migration, or wait for the picasso work? _Default: wait_ — one
  nullable column plus an index is a trivial later migration, and nothing in this phase needs it.
  What must **not** happen is bricking the way there:
  - `AssertValidAnchor` is written in terms of "an anchor target", not "a content node", so adding a
    second target type is one added condition in one validator with one test file — which is the point
    of combining those rules into a validator rather than scattering expressions;
  - `anchorKey(uri, path)` is already resource-agnostic, and `createComment` takes the payload key from
    the caller, so a schedule-entry surface adds no new indirection;
  - whoever adds it denormalises `activity` from the schedule entry, keeping the "every anchor inside an
    activity carries that activity" guarantee total;
  - the obvious first surface is **not** only the picasso: an activity's schedule entries are listed on
    the activity detail page too, so the same anchor would show there, with the list item as the
    highlighted surface. Do not design the picasso row as the only possible host.
- Take the MIT `@sereneinserenade/tiptap-comment-extension` instead of the fork's `CommentMark.js`?
  _Default: no_, see the evaluation above. Revisit if `CommentMark.js` proves hard to maintain.

## Done criteria

- [ ] `data-comment-id` survives a save through `CleanHTMLFilter`, proven by a test that stays in the
      suite.
- [ ] A comment can be anchored to a text range, a storyboard cell, a whole content-node card and an LA
      thematic-area option, using one registry call per surface type.
- [ ] Anchors survive mid-range edits, cut-paste and delete-retype; copy-paste creates no second anchor.
- [ ] Category content nodes are rejected as anchor targets by the API.
- [ ] Card ↔ anchor focus works in both directions, with scroll and highlight.
- [ ] Anchor ordering is DOM-order based, with no layout reads and no scroll listeners.
- [ ] Resolved anchors are hidden under "Open" and shown muted under "All".
- [ ] An orphaned thread shows its snapshot and can be re-anchored — automatically on an exact unique
      text match, manually otherwise, including for target-level anchors that have no text selection.
- [ ] Deleting a content node — including via parent cascade — orphans rather than deletes.
- [ ] Prototype copies carry no anchor attributes and no comments, including for nested/overlapping
      spans.
- [ ] Both print paths render commented text in full; the client PDF renderer is still an allow-list,
      with a rule and a test for the anchor span.
- [ ] Anchored comments exist in the dev data seeds, one per anchor shape.
- [ ] No float-positioning code was written, and no code strips marks out of user documents.
