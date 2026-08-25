# Phase 04 — Inline anchoring (roadmap step 7)

See [epic.md](epic.md) for the datamodel and decisions. Requires
[03-conversations.md](03-conversations.md).

This is a real future feature, not a speculative one — nothing in phases 01–03 may make it harder to
reach. It is still the largest phase by a wide margin, and it is the only step that breaks an
invariant the feature currently gets for free, so it stays gated on 01–03 being in production use.

## Goal

A comment points at the thing it is about: a selected sentence in a Notes field, one cell of a
storyboard, a whole content-node card, or later a schedule entry on the picasso. Clicking a card
scrolls to and highlights its anchor; clicking a highlight focuses its card. Anchors survive editing
around and inside them, and find themselves again after a cut-and-paste. When one is genuinely lost —
someone rewrote the sentence — the thread is not lost with it: it shows the stored snapshot of what it
was written against, and can be read, replied to and resolved like any other.

## The insight that keeps this small

The frontend already addresses every field inside every content node as `uri` + `path`, a lodash
path (`frontend/src/mixins/apiPropsMixin.js`, `ApiWrapper.vue:119,258`). Every surface the product
owner named is already reachable that way:

| surface                   | uri                            | path (already in the code)          |
| ------------------------- | ------------------------------ | ----------------------------------- |
| Notes rich text           | `/content_node/single_texts/x` | `data.html`                         |
| Storyboard cell           | `/content_node/storyboards/x`  | `data.sections[<uuid>].column2Html` |
| A whole content-node card | any content node               | — (null)                            |

So a storyboard cell is **not a new anchor type**: it is the same `contentNode` FK with a different
`anchorPath`. This is where the reference fork is inverted — it treats tiptap as the base case and
cannot express the others at all.

**`anchorPath` is deliberately not a rich-text feature**, even though every surface it addresses in this
phase happens to be one. It points at a **field of the target's payload**; `anchorId` is the extra level
that exists only when that field holds rich text. Keep that split clean, and do not let anything assume
"an anchor inside a content node means a text range".

### Where checklist items and material items would go: a foreign key, not `anchorPath`

Worth settling now, because it is the obvious next request and the answer is not the one the table above
suggests. A selected checklist and a material item are **not fields of a content node's payload** — they
are entities of their own, with their own per-camp URIs:

- `ContentNode\ChecklistNode::$checklistItems` is a `ManyToMany` to `ChecklistItem` through the
  `checklistnode_checklistitem` join table; a `ChecklistItem` belongs to a `Checklist`, which belongs to
  a camp.
- `MaterialItem::$materialNode` is a `ManyToOne` from the item to the node; the items are rows, not JSON.

Neither has a stable identifier inside the node's `data`, so neither can be addressed by `anchorPath`,
and `anchorId` is wrong for both — it is a mark id the editor mints, not an entity reference. They get
**their own nullable FK columns on `Comment`**, exactly like `scheduleEntry`: `checklistItem`,
`materialItem`. That is the "typed nullable foreign keys plus one generic `anchorPath`" model in the
epic doing what it was designed for.

The cost of each new anchor type is therefore one nullable column, one index, one condition in
`AssertValidAnchor`, and one `registerAnchorSurface` call — no migration of existing rows, no change to
anything already shipped. It is also why we are not tempted by a polymorphic `(targetType, targetId)`
pair: that saves a column per type and gives up every foreign key, every `ON DELETE SET NULL`, and the
orphaning behaviour that the whole design rests on.

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

| what the user does                        | what happens to the anchor                      |
| ----------------------------------------- | ----------------------------------------------- |
| Adds a word **inside** the anchored range | Survives; the new text joins the anchor         |
| Deletes a word inside the range           | Survives on the remaining text, as one run      |
| Types at either **edge** of the range     | Anchor does **not** grow (`inclusive: false`)   |
| Presses Enter in the middle of the range  | Survives, as **two DOM spans** with the same id |
| Reformats the range (bold, list, …)       | Survives; marks coexist                         |
| Deletes the whole range                   | **De-anchored** — thread keeps its `anchorText` |
| Copies the range and pastes it elsewhere  | Paste carries **no** anchor (`transformPasted`) |
| Cuts the range and pastes it back         | Mark is gone from the cut; see recovery below   |

Note that only the paragraph split produces more than one span. Deleting text inside the range — a
word, or a selection running out of the range and back — leaves a single run, because ProseMirror
merges adjacent text nodes carrying identical marks. Splitting the block is the one edit that cannot
merge, since the two halves end up in different paragraphs.

**So one anchor id can legitimately map to several elements, and every consumer must cope.** Use
`querySelectorAll`, scroll to the first, decorate all of them. This is not defensive coding for an
edge case; it is the normal result of pressing Enter.

That same property answers what happens when a **manipulated client** posts duplicate anchor ids into a
rich-text field: nothing special. The highlight appears twice and scrolling goes to the first, which is
already the paragraph-split behaviour. There is no privilege attached to an anchor id and the purifier
keeps only the attribute, so this is a cosmetic self-inflicted oddity, not a vulnerability — and there
is nothing to validate server-side, since the id lives inside the HTML rather than in a column we
control. Two properties keep it contained, and both are free:

- an editor only decorates ids drawn from `commentsState.anchors` **filtered to its own `(uri, path)`**,
  so pasting a foreign comment's id into some other content node highlights nothing at all;
- the panel is driven by the comment collection, never by what it finds in the document, so a
  fabricated id cannot make a thread appear, move between activities, or change what it points at.

Two edits deserve explicit design decisions.

**Copy-paste must not duplicate anchors.** The fork's `transformPasted` handler strips comment marks
from every pasted slice, which is Google Docs' behaviour and the only sane one: a comment thread has
exactly one anchor (step 10 is dropped), so a second highlight for the same thread would make
"scroll to the anchor" ambiguous and "delete the thread" leave a stray highlight behind. Keep it.

**Cut-paste and delete-retype recover automatically, by exact text match only.** Because the mark
travels with neither, both leave the thread de-anchored even though the text is still there — which
would feel broken. The fork already solves this and it is worth taking:
`findSnippetRanges(doc, anchorText)` locates the stored snapshot in the document and re-applies the
mark **only when it matches exactly once** across that content node's editors
(`commentsController.reanchorContentNode`). Zero matches or two or more leave the thread de-anchored
for good, because guessing would attach the thread to the wrong sentence — see "De-anchored and
orphaned threads are terminal".

This is exact substring matching, not fuzzy matching — deterministic, no scoring, no thresholds, and
it is the difference between "cut and paste a paragraph and your comments follow" and "cut and paste
a paragraph and you silently lose every comment on it".

Two consequences to be aware of when implementing it:

- Re-anchoring **writes to the document**, so it can trigger an autosave shortly after an activity is
  opened. Only do it when the comments collection has loaded and only for open threads (the fork's
  `commentsLoaded` guard plus its `hasAnchor` short-circuit), so the common case — nothing orphaned —
  performs no write at all.
- Do **not** copy the fork's client-side `reconcileCommentMarks()` sweep, which _removes_ marks from
  the open document when it cannot match them to a loaded comment. See "The tiptap mark" below: with
  decoration-based styling there is nothing to strip, and a sweep that deletes marks it does not
  recognise is one loading race away from destroying valid anchors. (This is a different thing from the
  backend's `CommentAnchors::stripFromData` during copying, which we _do_ take — see "Prototype copy".)

## `anchorText` — a snapshot, frozen at creation

**It is not updated when the anchored content changes.** Editing inside the range leaves the stored
snapshot exactly as it was when the comment was written. Three reasons, in order of weight:

- **It matches the traceability rule.** Comment text cannot be edited, so the quote it refers to must
  not silently mutate either. "This sentence is wrong" plus a quote of a sentence that has since been
  fixed is a true record; the same comment shown against the corrected sentence is a false one.
- **It would let anyone rewrite anyone's comment.** PATCH is open to every collaborator, so a field
  that tracked the content would mean every person editing an activity continuously rewriting the quoted
  text inside other people's comments. That is exactly what decision 3 forbids.
- **It costs writes.** A refresh would have to PATCH on every autosave of the surrounding field.

The live position is carried by the **mark**, which _does_ follow every edit. The snapshot's job is to
survive the mark's death, not to track it.

Nothing else updates it either, because **no anchor field is writable after creation** — see
"De-anchored and orphaned threads are terminal". `anchorText` is `#[Groups(['read', 'create'])]` along
with the rest, which makes the freeze an API guarantee rather than a frontend convention.

Consequence to accept knowingly: after enough editing the snapshot stops matching the text, so the
exact-match recovery above will not fire and the thread stays de-anchored for good. That is correct
behaviour rather than a limitation — if the sentence no longer exists, the thread genuinely is about
something that is gone, and the honest thing is to show what it was written against and let a human read
it and resolve it.

### Producing it

**Text ranges:** `editor.state.doc.textBetween(from, to, '\n')` — ProseMirror's own plain-text
extraction, and the same shape the fork's `docTextWithPositions` produces, which is what makes
`findSnippetRanges` able to match it later. Do not build the string from the DOM or from the HTML: any
other extraction risks disagreeing with the matcher about whitespace at block boundaries, and a matcher
that never matches fails silently.

Truncate to the column's 255 characters, **without an ellipsis** — an appended `…` would be searched for
literally and would break recovery for every long anchor. Recovery then re-attaches to the first 255
characters of the original range, which is the sane degradation. The panel elides the quote visually
instead, in CSS.

Server-side, `#[InputFilter\CleanText]` strips unicode control characters only — it does **not** strip
markup. So `anchorText` is plain text by construction of the client, and the panel must render it as
text (not through the rich-text renderer), which is what makes a client that posts markup there
uninteresting.

**Content-node anchors** have no text range, so their snapshot is a **label**:
`contentNode.instanceName` when the user has given the card a custom title, otherwise the translated
content-type name. That is what the card actually shows in its toolbar
(`ContentNodeCard.vue`'s `instanceOrContentTypeName`), so an orphaned thread reads "on _Vorbereitung_"
or "on _Notes_" instead of quoting an empty string. Same freeze rule: renaming the card later does not
rewrite existing comments.

## Non-goals

| Not in this phase                                   | Where                                   |
| --------------------------------------------------- | --------------------------------------- |
| Google-Docs float-aligned card positioning          | not built — see below                   |
| One comment anchored to several things at once      | dropped (step 10), see the epic         |
| Fuzzy / scored re-anchoring                         | not built — exact unique match only     |
| Manual re-anchoring of a de-anchored thread         | not built — see "terminal" below        |
| Moving an orphan to a replacement activity          | not built — same reason                 |
| Keeping `anchorText` in sync with edited content    | never — see above                       |
| Anchors inside a content node other than rich text  | later — the model already allows it     |
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
#[Groups(['read', 'create'])]
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
#[Groups(['read', 'create'])]
#[ORM\Column(type: 'string', length: 128, nullable: true)]
public ?string $anchorPath = null;

/**
 * The id of the comment mark (span[data-comment-id]) in the anchored rich text that
 * ties this thread to a range of text. Null when the comment is about a whole field
 * or a whole content node rather than a text range.
 */
#[Assert\Length(max: 36)]
#[ApiProperty(example: '1a2b3c4d-....')]
#[Groups(['read', 'create'])]
#[ORM\Column(type: 'string', length: 36, nullable: true)]
public ?string $anchorId = null;

/**
 * A plain-text snapshot of the anchored content, taken when the comment was written and
 * not updated afterwards. For a text range this is the commented text, for a whole
 * content node its title. Shown as a quote in the comments panel, and used to find the
 * right place again after the content was edited. Null for comments about a whole
 * activity or camp.
 */
#[InputFilter\Trim]
#[InputFilter\CleanText]
#[Assert\Length(max: 255)]
#[ApiProperty(example: 'the sentence that was commented on')]
#[Groups(['read', 'create'])]
#[ORM\Column(type: 'text', nullable: true)]
public ?string $anchorText = null;
```

**None of the four is in the `update` group**, and neither is `activity`. Phase 04 adds no writable
field: an anchor is set when the comment is created and never changed afterwards, because the only
recovery path is automatic and writes to the _document_, not to the comment. See "De-anchored and
orphaned threads are terminal" below for why manual re-anchoring is not built, and what that buys.

The `Patch` operation therefore stays exactly as phase 03 left it — `resolved` and nothing else.

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
here to also accept a `ContentNode`. Do it the way `AssertBelongsToSameCampValidator` does, because it
is the same problem one level down: it does not switch on concrete classes, it asks whether the value
implements one of two **interfaces** and delegates the awkward case to a trait
(`GetCampFromContentNodeTrait::getCampFromInterface`). Mirror that exactly:

- `App\Entity\BelongsToActivityInterface` with `getActivity(): ?Activity`, implemented by `Comment`
  (and, for free when the time comes, by `ScheduleEntry`, which already has the property);
- `App\Util\GetActivityFromContentNodeTrait::getActivityFromInterface()`, which returns
  `$subject->getActivity()` for the first interface and, for a `BelongsToContentNodeTreeInterface`,
  looks up `Activity` by `rootContentNode` — the same query `GetCampFromContentNodeTrait` already makes,
  minus its `Category` fallback;
- the validator itself then reads like the camp one: resolve both sides through the trait, compare
  `getId()`, and raise a violation when they differ **or when either is null**.

Dropping the `Category` branch is not an omission, it is the rule: a content node in a category
prototype tree resolves to no activity, so it can never match, and the "categories are not commentable"
rule needs no separate expression. That single extension covers both remaining rules:

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

Take the fork's file and **delete its second `preg_replace`**, the one stripping `class="comment-mark"`:
we do not store a class on the mark, so that line has nothing to match and the multi-class problem it
would have had disappears with it. What remains is a single pattern removing a single attribute. Make it
tolerant of single quotes, and take `api/tests/Util/CommentAnchorsTest.php` from the fork with cases
added for nested and overlapping spans.

**One hook covers every copy path**, which is worth knowing before someone goes looking for others:
`copyFromPrototype` is called by `CampCreateProcessor` (camp from prototype),
`ActivityCreateProcessor` (creating _or_ copying an activity — every activity is built by copying its
category's content tree), `CategoryCreateProcessor` and `ChecklistCreateProcessor`. Stripping inside
`ContentNode::copyFromPrototype` therefore covers all of them, including the case that will come up most
often in practice: **copying an activity within a camp does not carry the original's anchor
attributes.**

Comments themselves stay excluded from prototype copies by omission (`Comment` does not implement
`CopyFromPrototypeInterface`). Keep it that way.

### Should the server clean dead anchors out of rich text on save? Cheap, but no

Since the client no longer sweeps (see "The tiptap mark"), the honest alternative is not
"client-side versus server-side" but "server-side versus nothing". Worth pricing, because the answer is
not obvious and the hook already exists.

**It would be cheap.** `SingleTextPersistProcessor::onBefore()` already receives the whole `SingleText`
entity and already runs `CleanHTMLFilter` over `$data['html']`; `StoryboardPersistProcessor` is the same
shape. A cleanup there is one indexed query —
`SELECT anchor_id FROM comment WHERE content_node_id = :id AND anchor_id IS NOT NULL` — plus one regex
pass to drop every `data-comment-id` not in that set. Sub-millisecond, on an already-parsed string, in a
processor that runs anyway.

**Do it anyway? No.** Three reasons, in order:

- **Nothing observable improves.** With decoration-based styling, an attribute with no comment behind it
  renders as plain text and is invisible in the editor, in the Nuxt print and in the PDF. The only thing
  the pass buys is tidier stored HTML.
- **It imposes an ordering constraint on comment creation.** Today's draft flow is commit-the-mark →
  autosave → POST the comment. Under a server-side cleanup, an autosave that wins the race against the
  POST would delete the brand-new mark, and — unlike the fork's `pendingAnchorIds` hack — the client
  could not paper over it, because the deletion happens on the server. The frontend would have to POST
  the comment first and only then apply the mark. That is arguably the better order, but it is a
  coupling that has to hold forever.
- **It is a destructive operation on the hottest write path in the app.** Every autosave of every rich
  text would gain a branch that deletes something. The cost of getting it subtly wrong is losing anchors;
  the cost of not having it is invisible cruft.

Recorded, with the design, so nobody has to re-derive it: if stored anchors ever do need collecting, this
is where and how, and it needs the comment-before-mark ordering as a prerequisite.

### What if a comment's `anchorId` is never cleared?

It never is — that is the design, not a failure mode. When the anchored text is deleted, **nothing writes
to the comment**: it keeps its `anchorId`, `anchorPath`, `contentNode` and `anchorText`, and the frontend
concludes "de-anchored" from the mark's absence, not from a null column. Which means:

- there is no write on page load, so opening an activity can never mutate comments;
- the recovery information survives, which is the whole point — a comment with its `anchorId` cleared
  could not be re-anchored automatically when its text comes back from an undo or a paste;
- a comment whose content node was **deleted** does get `contentNode = NULL` from the FK, and that is the
  database doing it, not the client.

So the two states are "the mark is there" and "the mark is not there right now", and the second one is
recoverable by definition. The failure the question implies — a comment stuck pointing at something that
no longer exists — is exactly the state the panel is designed to display and offer a repair for.

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
  activityFilter: null, // phase 02's mobile badge filter
  showResolved: false, // phase 03's "Open" / "All" toggle
  commentsLoaded: false, // editors must not re-anchor before this
  activeCommentUri: null, // the focused thread
  anchors: [], // see below; set by CommentsList
  anchorGeneration: 0, // bumped when the set of mounted surfaces changes
})

export const anchorKey = (targetUri, path = null) => `${targetUri}#${path ?? ''}`

// host: { el?, resolveAll?: (anchorId) => Element[], applyAnchor?, findSnippetRanges? }
export function registerAnchorSurface(key, host) // → unregister(); bumps anchorGeneration
export function resolveAnchor(comment) // → Element[] (one id can have several — see above)
export function focusAnchor(comment) //   panel → content
export function focusComment(commentUri) // content → panel
```

**Everything in this module is scoped to one camp, so it must be reset when the camp changes.** The
module is a singleton, and `anchors` / `commentsLoaded` / `activeCommentUri` are all statements about a
particular camp's comments; carrying them into the next camp means the new camp briefly renders the old
one's anchors, and `commentsLoaded === true` lets re-anchoring run against them. Reset rather than
key-by-camp: a per-camp map has to be evicted anyway and gives nothing back, since eCamp cannot show two
camps in one tab.

Phase 01 created `resetCommentsState()` and the `watch` on `camp` in `CommentsPanel` that calls it, and
phase 03 added `showResolved` to it. This phase adds the rest:

```js
export function resetCommentsState() {
  commentsState.open = false // phase 01
  commentsState.activityFilter = null // phase 02
  commentsState.showResolved = false // phase 03
  commentsState.commentsLoaded = false
  commentsState.activeCommentUri = null
  commentsState.anchors = []
  commentsState.anchorGeneration++
}
```

Two details that are easy to get wrong. `anchorGeneration` is **incremented, not zeroed** — it is a
change signal, and resetting it to 0 can make a stale computed think nothing changed. The registry `Map`
of hosts is **not** cleared here: hosts unregister themselves on unmount, and clearing the map from
under components that are still mounted would leave them unable to unregister cleanly. The camp change
unmounts them anyway.

The test for the reset itself belongs in phase 01, where the watcher is introduced; what this phase adds
is a case asserting the new fields are included.

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

**Ordering — DOM order, not viewport position.** This is the one place in the feature that orders by
anything other than `createTime`, and it is allowed for the reason phase 02's programme ordering was
not: the anchored text is on screen **next to the panel**, so its order is something the reader can
see, while the programme is somewhere else entirely. Within an activity, this phase orders anchored
threads by the DOM position of their anchor; everything else keeps `createTime`. The fork reads
`getBoundingClientRect().top`; do not copy that.

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

So the activity-scope order is a two-tier list:

1. **anchored comments whose anchor resolves**, in document order;
2. **everything else**, `createTime` ascending, below them — comments that never had an anchor, and
   de-anchored ones whose anchor is gone.

Tier 2 is where a de-anchored comment belongs, and "at the bottom" is a real answer rather than a
shrug: it has no position in the document to sort into, so any place among the anchored comments would
be a position the reader cannot verify against anything on screen. At the bottom it is visibly outside
the ordering, which is exactly what it is.

Two things fall out of tier 2 that are worth keeping: plain activity-level comments — the majority in
most activities — sit **directly above the composer**, so a newly written one appears where the chat
rule says it should; and a de-anchored comment sits among them rather than jumping when an unrelated
edit changes the document.

Comments whose element does not resolve for a **transient** reason — a different activity, nothing
mounted yet — take the same path, which is harmless because they are not on screen to be misplaced. **In camp scope no editors are mounted at all**, so every anchored thread takes that path and the
panel is simply chronological — which is what phase 02's camp lists are anyway. That is the right
answer rather than a degradation: document order communicates nothing when the document is not next to
the panel, and it means camp scope needs no anchor machinery, no layout reads and no extra API data.

Since phase 02, that case is also **mobile-only**: desktop camp scope contains no activity comments at
all, so it has no anchored threads to order in the first place. The fallback exists for the fullscreen
mobile list, and for the moment during load before surfaces have registered.

**The reactivity is one integer, and it does have to cover in-document moves.** Dragging a sentence to
another paragraph inside an editor changes DOM order without mounting or unmounting anything, so
`anchorGeneration` cannot only be bumped by `registerAnchorSurface`. Bump it in four places:

- `registerAnchorSurface` and its `unregister` — surfaces appearing and disappearing;
- the editor's `onUpdate` — every document change, which covers text drag-and-drop, paragraph splits,
  deletions and re-anchoring in one hook;
- after a re-anchor applies a mark, if that does not already go through `onUpdate`;
- when the `layoutMode` flag flips — see below. Dragging content-node cards reorders surfaces in the DOM
  without mounting anything or touching any document, so this is the one reorder nothing else catches.

The sorted list is then a computed over `[comments, anchorGeneration]`. Bumping on every keystroke
sounds expensive and is not: the computed re-runs a `compareDocumentPosition` sort over the handful of
anchors in one activity, with no layout reads and nothing to invalidate downstream. If it ever shows up
in a profile, debounce the `onUpdate` bump — the editor already debounces its autosave, so there is a
precedent and a number to copy.

If a future surface ever needs to override this — an anchor host whose DOM order does not match its
logical order — the escape hatch is an optional `order` number on the host, consulted before the DOM
comparison. Do not build it until something needs it.

**A de-anchored comment is still an ordinary card**, quoting its `anchorText` snapshot instead of
scrolling anywhere when clicked. One that kept its `activity` but lost its content-node anchor is not
an orphan in phase 02's sense (`orphanDescription !== null`, meaning the activity itself is gone), so
it stays in that activity's list. Where in the list depends on the scope, and both answers come from
the ordering rule above: **at the bottom in activity scope**, with the unanchored comments, because it
has no document position to sort into; and in its plain chronological place in camp scope, where
nothing is ordered by document position anyway.

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
  Those two are the surfaces this phase ships. Three more are designed for and deliberately not built,
  each one `registerAnchorSurface` call plus its FK column when the time comes:

- **Schedule entry** — target `scheduleEntry`, `path: null`, hosted by the picasso row _and_ by the
  activity page's schedule-entry list. Postponed; see the open question below.
- **A selected checklist item** — target `checklistItem`, hosted by the row in `ChecklistNode`'s list.
- **A material item** — target `materialItem`, hosted by the row in `MaterialNode`'s list.

An earlier draft also anchored **individual LA thematic-area options**; dropped, because commenting on
the whole LA thematic-area card says the same thing and the options are not standing checkboxes —
`LAThematicArea.vue` renders an `e-select` whose rows live inside a transient dropdown, so a per-option
anchor would need a host that is only sometimes in the DOM, for the least valuable of the three
sub-content-node anchors. The two entity-backed rows above are the ones people will actually ask for.

**In layout mode, anchors are hidden — but surfaces stay registered, and so does the panel.** While the
user rearranges cards, `ContentNodeCard` renders its body `pointer-events-none user-select-none` and the
content components pass `:disabled="layoutMode || disabled"` down (see `Notes.vue`), so highlights and
comment affordances would compete with the drag handles and the delete buttons. Suppress those: no
decorations, no comment buttons, and no snippet recovery — that last one writes to the document, and
layout mode is the one place the user is certain not to be editing prose.

**Do not unregister the surfaces to achieve that.** Disabled is not unmounted — the editors still render
and the mark spans are still in the DOM — so the surfaces can still resolve their anchors, and they must
keep doing so. If entering layout mode unregistered everything, no anchor would resolve, every anchored
thread would fall back to `createTime`, and the panel would visibly re-sort on the way in and re-sort
back on the way out. A list that shuffles itself because you started dragging a card is exactly the kind
of thing that reads as a bug. Registration tracks whether the surface is **in the DOM**; layout mode is a
question about what is **visible and interactive**, and conflating the two produces this.

So gate the visuals on `layoutMode` explicitly — it is one condition in the decoration plugin and one on
each affordance — rather than trying to get it for free from unregistration.

The one thing that does need a nudge: dragging cards around reorders surfaces in the DOM without
mounting anything, so **bump `anchorGeneration` when `layoutMode` flips**. One watcher, and the panel
picks up the new card order once, on the way out, instead of never.

Do not hide the panel either. It is a global drawer, so hiding and restoring it on every layout-mode
toggle is a visible jolt for no gain, and a panel that keeps working while you rearrange cards is useful:
"which cards have feedback on them" is a reasonable thing to consult while deciding where to put them.

Every call site already knows what kind of thing it is anchoring to — `ContentNodeCard` is a content
node, on the picasso the only thing commentable is a schedule entry — so it just names the key:

```js
createComment({ contentNode: uri, anchorPath, anchorId, anchorText, textHtml })
```

`anchorKey(uri, path)` stays the one shared convention, because the registry genuinely needs a single
string key. That is the only thing that has to agree across surfaces.

### Creating a comment on a whole content node

Text ranges have an obvious affordance — select, then a button in the bubble menu. Card-level anchors
need their own, and it is one button: `ContentNodeCard.vue`'s toolbar already carries a
`visible-on-hover` pencil and an `IconWithTooltip`, so add a `visible-on-hover` comment button beside
them. One change covers every content type, including MaterialList, Storyboard, LAThematicArea and
anything added later — which is why this belongs in the layout component rather than in each content
type.

Losing a card-level anchor is the simple case: there is no snippet to search for and no mark to
reconcile. Either the content node still exists — in which case the anchor is intact by definition — or
it was deleted and `contentNode` went to `NULL`.

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
  matching comment simply gets no decoration. The fork instead runs `reconcileCommentMarks()` in the
  editor, which _removes_ marks it cannot match to a loaded comment — mutating the open document, and one
  loading race away from deleting valid anchors, which is why it needs a `commentsLoaded` guard in the
  first place. Delete that sweep; keep the guard, which is still needed so re-anchoring does not run
  against an empty collection.

  To be explicit, since these are two different things with similar names: we **drop** the fork's
  client-side sweep over the live document, and we **keep** its backend
  `CommentAnchors::stripFromData()`, so copies of an activity or a camp carry no anchor attributes. See
  "Prototype copy" above.

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

### De-anchored and orphaned threads are terminal — recovery is automatic or not at all

A thread whose anchor is gone renders at the bottom of the activity's list (see Ordering above),
showing its `anchorText` snapshot as a quote instead of pointing anywhere. There is exactly one way
back:

**Automatic, exact and unique.** For a text anchor, `findSnippetRanges` looks for the snapshot in the
content node's editors; a single match re-applies the mark and the user never learns anything was wrong.
This is what covers cut-paste and delete-retype, which is the whole reason it exists. Zero or several
matches leave the thread de-anchored, permanently.

The important property: it re-applies a **mark in the document** and PATCHes nothing. It is not an edit
to anybody's comment, so it needs no permission rule and no writable anchor fields. It does need write
access to the content node, so it does not happen for a guest — their editors are read-only — and the
thread stays de-anchored until somebody who can edit opens the activity.

That also settles a question about its scope: the search is deliberately confined to the comment's
**own** content node's editors. Searching the whole activity would let text cut from Notes and pasted
into Storycontext take its comment along — but the comment's `contentNode` would then be wrong and would
need a PATCH, which is exactly the write we are avoiding. Same-node only, and therefore free.

**No manual re-anchoring, no reattach UI, no moving an orphan to a replacement activity.** An earlier
draft designed all three. They are dropped:

- Every one of them is a way for one person to change what somebody else's comment is about, which is
  the thing "comments are traceable" exists to prevent. Guarding it properly means an authorship rule, a
  `previous_object` check for the orphan case, and two writable-field groups that nothing else needs.
- They are UI-expensive for how rarely they fire: a hover-highlight targeting mode, an activity picker,
  and a second gesture for narrowing to a text range — for a state that the automatic recovery already
  removes in the common cases.
- The feature already has an answer for a comment that no longer applies, and it is the one the epic is
  built around: **resolve it**. A de-anchored thread is readable, replyable, resolvable and deletable by
  its author. Nothing is lost, because `anchorText` still says what it was written against.

Concretely, phase 04 therefore adds **no writable field at all**: `contentNode`, `anchorPath`, `anchorId`
and `anchorText` are all `read, create`, and the `Patch` operation stays exactly as phase 03 left it —
resolve and reopen. If manual re-anchoring is ever wanted, it is a later phase that adds the fields to
the `update` group and the rules with them.

One timing detail survives from that design and still matters: "no mark found" only means de-anchored
once the comments have loaded **and** the surface has registered, or the panel flashes a quote treatment
at every anchored thread during load. Both are already tracked — `commentsState.commentsLoaded`, and the
presence of a host under the anchor's key — so the test is those two conditions plus a failed lookup,
never a bare failed lookup. Keep the fork's `commentsLoaded` flag, set by `CommentsList` once its
collection resolves; guarding the recovery pass and this check is all it still does.

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
- a comment on a whole **content-node card**, one with a custom `instanceName` so the label form of
  `anchorText` is visible;
- one **de-anchored** thread, made by anchoring a comment and then rewriting the sentence — so the
  quoted-snapshot rendering is visible on `dev` without having to break something by hand;
- a **resolved anchored thread**, so the muted "All" highlight has a subject;
- a **resolved single comment with no replies**, which is the common case in practice and the one that
  shows whether a resolved thread reads sensibly without the visual crutch of replies under it.

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
api/src/Util/GetActivityFromContentNodeTrait.php                 modified (+content-node branch)
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
frontend/src/helpers/randomUuid.js                              new (from the fork, +warning)
frontend/src/components/activity/content/Storyboard.vue         use randomUuid
frontend/src/components/comments/CommentThread.vue              +anchor quote
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
- **PATCH of any anchor field is a no-op** — `contentNode`, `anchorPath`, `anchorId`, `anchorText` and
  `activity` all come back unchanged, because none of them is in the `update` group. One test over the
  five, so that adding a field to that group later cannot pass unnoticed;
- deleting a content node sets `contentNode` to NULL and leaves the comment readable;
- **deleting a parent `ColumnLayout`** (DB cascade path, no processor) does the same — this is the
  case a remove-processor would have missed, and it is a tested, intended behaviour of the API (see
  the epic's "Known gaps");
- `CommentAnchorsTest` — nested and overlapping spans survive stripping intact;
- creating a camp from a prototype whose content contains anchor spans produces content with no
  `data-comment-id` and no comments — and the same for **copying an activity**, which is the path users
  actually take;
- `commentsState.spec.js` — document-order sorting over registered surfaces, the `createTime` tier
  **below** it holding unanchored and de-anchored comments, that unregistering a surface bumps `anchorGeneration`, and that
  `resetCommentsState()` clears the anchors and `commentsLoaded` while _incrementing_ the generation;
- entering layout mode does **not** change the panel's order — the regression test for the
  unregister-everything mistake;
- `CommentMark.spec.js` — one anchor id resolving to **two spans** after a paragraph split, and a
  document containing a duplicate id rendering without error;
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
9. Put the cursor in the middle of a commented sentence and press Enter. The highlight continues across
   both paragraphs, the panel still shows one thread, and clicking the card scrolls to the first half.
10. Edit inside a commented range, then look at the panel: **the quote has not changed**. It still shows
    what was written at the time, which is the point.
11. Add a comment on one storyboard cell and one on a whole content-node card. Two separate anchored
    threads; each highlights its own surface. The card thread's quote is the card's title.
12. Switch the activity to **layout mode**. All highlights and comment buttons disappear, and the panel
    keeps listing the same threads **in the same order** — it must not re-sort. Drag a commented card to
    a different column, leave layout mode: the highlights return and the panel now reflects the new card
    order.
13. Drag a commented sentence to a different paragraph of the same field. The highlight moves with it and
    the panel **reorders** to match, without a reload.
14. Rewrite the commented sentence entirely. The thread moves to **the bottom of the list**, among the
    unanchored comments, showing its snapshot as a quote — and **no repair affordance of any kind**.
    Reply to it and resolve it: both work normally. That is the whole intended handling of this state.
15. On **desktop**, open the panel from the dashboard. It shows camp-level comments and orphans only —
    **no activity comments**, and no anchor machinery running. Narrow the viewport to mobile: the panel
    is fullscreen and now also lists the activity comments, in one chronological list.
16. Navigate from this camp to another camp. The panel closes and shows nothing from the previous camp;
    no stale highlight appears in the new camp's activities.
17. Delete the whole content node, then (in another activity) delete the _parent column layout_ of a
    commented content node. Both threads survive, orphaned, still showing their snapshots and still
    resolvable.
18. Create a camp from a prototype whose activities contain anchored comments, and **copy an activity**
    that has them. Neither copy contains a `data-comment-id` or a comment.
19. Print the camp both ways. In the Nuxt print and in the client-side PDF, the commented sentence
    renders **in full** — this is the regression the anchor-span rule prevents.
20. Resolve an anchored thread. Its highlight disappears from the text while the panel shows "Open".
    Switch to "All": the thread reappears in full **and so does its highlight**, muted.

## Open questions

- Ship the `scheduleEntry` FK in this migration anyway, on the grounds that it is nearly free? _Default:
  no._ Nothing in this epic plans a picasso anchor — there is no phase waiting on it — and one nullable
  column plus an index is a trivial migration whenever someone does want it. What must **not** happen is
  bricking the way there:
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
  - the same reasoning covers `checklistItem` and `materialItem` — see "Where checklist items and
    material items would go". Whoever adds the second FK sets the pattern the third and fourth follow.
- Take the MIT `@sereneinserenade/tiptap-comment-extension` instead of the fork's `CommentMark.js`?
  _Default: no_, see the evaluation above. Revisit if `CommentMark.js` proves hard to maintain.

## Done criteria

- [ ] `data-comment-id` survives a save through `CleanHTMLFilter`, proven by a test that stays in the
      suite.
- [ ] A comment can be anchored to a text range, a storyboard cell and a whole content-node card, using
      one registry call per surface type.
- [ ] Anchors survive mid-range edits, paragraph splits, cut-paste and delete-retype; copy-paste creates
      no second anchor, and one id resolving to several elements is handled everywhere.
- [ ] `anchorText` is never rewritten at all; no anchor field is in the `update` group, and the `Patch`
      operation is unchanged from phase 03.
- [ ] Panel order follows the document through in-editor moves, not only through mounts.
- [ ] Category content nodes are rejected as anchor targets by the API.
- [ ] Card ↔ anchor focus works in both directions, with scroll and highlight.
- [ ] Anchor ordering is DOM-order based, with no layout reads and no scroll listeners.
- [ ] Resolved anchors are hidden under "Open" and shown muted under "All"; nothing is highlighted in
      layout mode, and entering layout mode does not reorder the panel.
- [ ] A de-anchored thread recovers automatically on an exact unique text match, and otherwise stays
      de-anchored at the bottom of the activity's list — readable, replyable and resolvable, with no
      repair UI anywhere.
- [ ] Nothing writes to a comment when its anchored text is deleted; `anchorId` is never cleared.
- [ ] Comments state is cleared when the camp changes.
- [ ] Deleting a content node — including via parent cascade — orphans rather than deletes.
- [ ] Copies carry no anchor attributes and no comments — camp from prototype **and** activity copy,
      including nested and overlapping spans.
- [ ] Both print paths render commented text in full; the client PDF renderer is still an allow-list,
      with a rule and a test for the anchor span.
- [ ] Anchored comments exist in the dev data seeds, one per anchor shape.
- [ ] No float-positioning code was written, and no code strips marks out of user documents.
