# Epic — Comments

Tracking issue: [ecamp/ecamp3#828](https://github.com/ecamp/ecamp3/issues/828)

Users want to leave feedback on a camp's programme. The target feel is Google Docs comments:
a right-hand panel of comment cards, later anchored to the thing they talk about, with a bottom
sheet on mobile. The backend already has a minimal `Comment` entity; the frontend has a
rudimentary, broken implementation that this epic replaces.

The whole feature stays behind the existing `VITE_FEATURE_COMMENTS` toggle, wired exactly like
`FEATURE_CHECKLIST`: on by default in local development, opt-in per deployed environment. Phase 01
turns it on for **`dev`**; `staging` (an exact copy of prod, with production data) and `prod` stay
off until phase 02 ships, because until comments are discoverable from the dashboard the first
production week generates "nobody replied to me" instead of usage.

## Who this is for

Beyond the camp team itself, a primary audience is **J+S coaches**: they read the planned programme,
give feedback, and set conditions and mandatory change requests that the camp must address to
qualify for federal subsidies. That audience drives two rules that run against eCamp's usual
"trust the planning team, avoid governance features" instinct:

- **Comments are traceable.** Nobody may edit or delete anybody else's comment — not even a camp
  manager. There is no edit history either, because there are no edits.
- **Resolving, not deleting, is how a comment goes away.** That is what phase 03's resolve feature
  is for.

## Phase files

| File                                                   | Roadmap steps | Backend work?                             |
| ------------------------------------------------------ | ------------- | ----------------------------------------- |
| [01-usable-ui.md](01-usable-ui.md)                     | 1, 2          | one-line security change                  |
| [02-finding-comments.md](02-finding-comments.md)       | 3, 4, 12      | none                                      |
| [03-conversations.md](03-conversations.md)             | 5, 6          | migration + first PATCH operation         |
| [04-inline-anchoring.md](04-inline-anchoring.md)       | 7             | migration + purifier + prototype-copy fix |
| [05-notifications.md](05-notifications.md)             | 8, 9, 11      | large; **not planned yet, deliberately**  |
| [06-cross-camp-overview.md](06-cross-camp-overview.md) | 13            | none                                      |

## Roadmap

The order comes from the issue and is fixed. "Where" says which phase file owns the step.

| #   | Step                                                          | Where          | Depends on                           |
| --- | ------------------------------------------------------------- | -------------- | ------------------------------------ |
| 1   | Usable create / read / delete UI                              | 01             | —                                    |
| 2   | Enable feature toggle                                         | 01             | 1                                    |
| 3   | Dashboard indicates activities with comments                  | 02             | 1                                    |
| 4   | A place for orphan and camp-level comments                    | 02 (the panel) | 1                                    |
| 5   | Comment threads                                               | 03             | 1                                    |
| 6   | Resolve / unresolve                                           | 03             | 5 (UI only; technically independent) |
| 7   | Anchor to other entities / precise anchors, re-anchor orphans | 04             | 5                                    |
| 8   | Personal notification bubble with read markers                | 05             | 3 (supersedes its badge)             |
| 9   | Mentions                                                      | 05             | a delivery channel                   |
| 10  | Multi-anchor + reference in comment text                      | **dropped**    | —                                    |
| 11  | Push notifications                                            | 05             | 8, 9                                 |
| 12  | Dashboard filter by has-comments                              | folded into 02 | 3                                    |
| 13  | Cross-camp comments overview                                  | 06             | 1                                    |

Two dependency edges people get wrong:

- **3 does not need 4.** They are siblings over the same `GET /comments?camp=X` query; either can
  ship first.
- **8 does not need 5.** Read markers are per-comment regardless of threading. But 8 _supersedes_
  step 3's badge semantics ("has comments" becomes "has unread comments"), which is exactly why
  step 3 should stay deliberately dumb.

### Scope calls

**Step 10 (multi-anchor) — dropped.** It is the only step that would force a join-table shape
(`CommentAnchor`) onto step 7's schema. Modelling for it costs an entity, a collection endpoint and
N+1 risk in every read path, forever, for something nobody has requested. If it ever happens it is
one migration plus one `INSERT … SELECT` — every comment has at most one anchor today, so the
backfill is unambiguous. Decide this _before_ step 7, not during.

**Step 12 (dashboard filter) — folded into phase 02.** Not obsoleted by step 3 (a badge is not a
filter). The filter widget is shared by the dashboard, the picasso and the print configs, but that
sharing makes it _cheaper_, not more expensive — see phase 02 for the measured cost and the one real
obstacle (`comments` is a hyperlink, not a scalar).

**Step 4 (orphan and camp-level comments) — no separate view.** The phase 01 panel already derives
its scope from the route, so it is activity-scoped on an activity page and **camp-scoped everywhere
else**. That camp-scoped panel _is_ the place: grouped by activity in programme order, with buckets
for camp-level comments and for orphans. One component instead of two, and camp-level creation and
orphan handling come for free. Phases 3, 4 and 12 still land as **separate commits** — see phase 02.

**One panel, two scopes.** Worth stating once because every later phase depends on it: the panel is
unfiltered when opened from the dashboard or picasso (camp scope) and filtered to one activity when
opened from an activity page. Phase 04 adds a third case inside activity scope — comments that keep
their activity but lose their content-node anchor render inline, just above that activity's group,
rather than in the orphan bucket.

**Ordering: first appearance in the visible programme, never by `number`.** Comments group by
activity; sections order by the activity's first still-visible schedule entry, comments within a
section by `createTime`. `ScheduleEntry::getNumber()` looks like the key and is not — it is computed
rather than a column, does not sort as a string, and does not encode a total order across categories
(`1.1`, `1.a` and `1.i` can coexist on one day, and style `-` yields `''`).

No comparator is needed: the schedule-entry list is already in programme order, so the position is
just the index at which each activity first appears. That makes it naturally filter-correct — hiding
an activity's first entry re-positions it by its next one, and hiding all of them drops it. Which in
turn means **the panel must know the page's filter state and, on the picasso, its period**; it reads
both from the route, the same way it reads camp and activity. Phase 02 adds
`common/helpers/programOrder.js`, deliberately generic so the material overview can reuse it; phase
04 orders within an activity by anchor position.

## Target datamodel

Anchors are **typed nullable foreign keys plus one generic `anchorPath`**.

The insight that keeps this small: the frontend already addresses every field inside every content
node as `uri` + `path` (a lodash path — see `frontend/src/mixins/apiPropsMixin.js` and
`ApiWrapper.vue`). A Notes body is `data.html`; a storyboard cell is
`data.sections[<uuid>].column2Html`. Those are **not** two anchor types — they are one `contentNode` FK
with two different `anchorPath` values. `anchorPath` addresses a **field of the payload**, and `anchorId`
is the further level that exists only when that field happens to hold rich text.

The other half of the model is the typed FKs, for anchor targets that are **entities rather than fields**:
`ScheduleEntry`, `ChecklistItem`, `MaterialItem`. **None of them is planned in any phase of this epic** —
they are the shapes the next requests will take, written down so phase 04 does not accidentally make them
expensive. Phase 04 ships `contentNode` and nothing else. Those entity targets have their
own per-camp URIs and no stable identity inside a content node's payload, so `anchorPath` cannot address
them — see phase 04. Each costs one nullable column, one index and one validator condition; none costs a
migration of existing rows.

```
comment
  camp           Camp             NOT NULL, ON DELETE CASCADE     exists
  activity       ?Activity        nullable, no DB cascade         exists
  author         User             NOT NULL, writable:false        exists
  textHtml       string           max 1024, HTMLPurifier          exists
  orphanDescription ?string       max 32, writable:false          exists
  parent         ?Comment         phase 03
  resolvedAt     ?datetime        phase 03
  resolvedBy     ?User            phase 03
  contentNode    ?ContentNode     ON DELETE SET NULL              phase 04
  anchorPath     ?string(128)     lodash path into the target     phase 04
  anchorId       ?string(36)      tiptap mark id                  phase 04
  anchorText     ?text            snapshot, max 255, write-once   phase 04
  scheduleEntry  ?ScheduleEntry   ON DELETE SET NULL              in the future
  checklistItem  ?ChecklistItem   ON DELETE SET NULL              in the future
  materialItem   ?MaterialItem    ON DELETE SET NULL              in the future
```

The granularity ladder falls out with no discriminator column:

| meaning                       | activity | contentNode              | anchorPath                          | anchorId |
| ----------------------------- | -------- | ------------------------ | ----------------------------------- | -------- |
| whole camp                    | null     | null                     | null                                | null     |
| orphaned                      | null     | null                     | kept                                | —        |
| whole activity (today)        | set      | null                     | null                                | null     |
| whole content-node card       | set      | set                      | null                                | null     |
| one storyboard section editor | set      | set                      | `data.sections[<uuid>].column2Html` | null     |
| text range                    | set      | set                      | `data.html`                         | `<uuid>` |
| schedule entry                | set      | null (+ `scheduleEntry`) | null                                | null     |
| one selected checklist item   | set      | null (+ `checklistItem`) | null                                | null     |
| one material item             | set      | null (+ `materialItem`)  | null                                | null     |

The last three rows are expressible but not built in phase 04. They are the shapes people will ask for
next, and the model already says how each would be stored — as a foreign key, never as an `anchorPath`.

Orphaned is unambiguous with existing columns: `orphanDescription !== null`. No `anchorLevel`
column.

Three rules that are easy to get wrong:

**Denormalise `activity` onto every anchor.** This is the single most valuable decision in the
model. It keeps `GET /activities/{id}/comments` and `Activity::$comments` working untouched, and
keeps "does this activity have comments" one indexed query instead of a tree walk.

**Category content nodes are not commentable.** Categories carry prototype content-node trees whose
nodes have `activity === null`; we do not need comments on those. That lets the anchor rule be
strict rather than permissive: `contentNode !== null` implies `activity !== null`. Enforce it as an
`Assert\Expression` in phase 04 rather than leaving it to convention.

**`contentNode` and `scheduleEntry` use `ON DELETE SET NULL`, with no remove-processor.** Content
nodes really are deleted by DB cascade — see "Known gaps" below — so a PHP processor
mirroring `ActivityRemoveProcessor` would silently miss the common case. Instead, `anchorText` (the
snapshot stored so a thread can be re-anchored) doubles as the "this used to be attached to «…»"
label. `orphanDescription` stays activity-only, as it is today. Schedule entries always belong to an
activity, so `SET NULL` there degrades a comment to activity-level, which is semantically right.

Deferred on purpose: `CommentAnchor` (see step 10 above) and any denormalised `commentCount` column.

## Frontend architecture

**One singleton panel in `App.vue`, not a wrapper around page content.**

```
App.vue
  <router-view name="navigation" />
  <router-view name="aside" />                 left drawer, unchanged
  <CommentsPanel v-if="featureComments" />     new
  <v-main><router-view /></v-main>
```

**The camp and activity come from the route, not pushed by the pages.** A page-pushed scope
(`setCommentScope` on mount, `clearCommentScope` on unmount) interleaves badly on a route change: the
incoming page sets the scope, then the outgoing page's unmount hook clears it, leaving the panel
empty on a page that should have comments.

Instead the panel uses the route helpers `router.js` already exports, which return **entities**:

```js
import { campFromRoute, activityFromRoute } from '@/router.js'
```

`campFromRoute` exists (`router.js:757-762`, alongside `periodFromRoute`, `checklistFromRoute`,
`materialListFromRoute`); `activityFromRoute` is added in the same shape in phase 01. The panel
cannot receive them as route-injected props — it lives in `App.vue`, not a named `router-view` — but
importing the helper is equivalent and is what every `props:` callback in `router.js` already does.

So there is exactly one writer (the route), pages contribute no code, `campRoleMixin` and the
collection query get entities directly, and any camp route can host the panel with no allow-list to
maintain. `commentsState` is then just `{ open: false }`.

Each page that wants to expose the panel drops a single `<CommentsToggleButton />` into its own
toolbar.

Why a singleton panel rather than the current `CommentWrapper.vue`, which wraps the page in a flex
row:

- `v-navigation-drawer app location="right"` makes Vuetify pad `v-main` itself. The content column
  narrows with no flex wrapper and no JS measuring, so the reference fork's measure-and-grow
  feedback loop (it grew the page every frame) is structurally impossible.
- The picasso owns its own full-height layout and cannot be wrapped. Camp-level, dashboard and
  cross-camp views need the same panel. With a singleton each costs one route-map entry and one
  toggle button.
- Today's `Comments.vue` is an _ancestor_ of the activity, so its `v-if="!comments._meta.loading"`
  blocks the whole page from rendering until the comments request resolves. A sibling panel cannot
  do that.

Shared state lives in a **module singleton** (`commentsState.js`), not provide/inject and not Vuex.
Provide/inject cannot work — the panel is outside every page's provide tree. Vuex is the wrong tool
for DOM-adjacent UI state, and Pinia is not installed.

**All comments UI state lives in that one module.** In phase 01 it is just `{ open: false }`, because
camp and activity come from the route helpers. Phase 04 grows it with the anchor registry, keyed by
`anchorKey(uri, path)` to mirror `apiPropsMixin`, plus the `commentsLoaded` and `activeCommentUri`
flags. Registering a new anchorable surface is one call; see
[04-inline-anchoring.md](04-inline-anchoring.md).

## Invariants to preserve

- **Comments are never copied by prototype.** Today this is free: `Comment` does not implement
  `CopyFromPrototypeInterface`. Phase 04 breaks the free part — see its Backend section.
- **Comments never appear in print.** Also free today: `frontend/src/pdf/` and `/print/` only walk
  the content-node tree, and `prepareInMainThread.js` uses an explicit allow-list that omits
  `comments`. Phase 04 must make sure anchor spans render harmlessly rather than eating text.
- **Max 1024 characters**, enforced by `Assert\Length` on `textHtml`.
- **Guests can comment.** `CAMP_COLLABORATOR` includes the `guest` role, which satisfies the MVP
  requirement "even as a guest".
- **Nobody edits or deletes somebody else's comment.** See "Who this is for" above.
- **No `v-html`, ever.** There is none in the frontend today and comments do not introduce it, even
  though the API sanitises `textHtml` with HTMLPurifier on write. Rich text already carries
  non-standard-HTML decorations (autolinking) and will carry more — mentions, comment anchors — all
  of which need an editor to render. Read-only text is rendered by a non-editable `TiptapEditor`, the
  same way the story overview page already does it (`components/story/StoryDay.vue:42-54`).
- **Exactly one role gate in the client: `isOutsider`.** External users — those who reach a camp only
  through its public flag — get no comments UI at all. Between collaborators, role makes no
  difference: guests may comment and, from phase 03, resolve, and nobody may touch another person's
  comment. Those rules are enforced by the API; do not reimplement them in Vue. Note the gate is
  `isOutsider`, **not** `ScheduleEntry.vue`'s `disabled` — that one is `!isContributor` and would shut
  guests out. `campRoleMixin.isOutsider` is currently broken; phase 01 fixes it.
- **The panel never blocks the page.** No scrim, no focus trap, no blocked scroll — users must be
  able to read and scroll the commented content while the panel is open. That rules out `temporary`
  drawers and default-configured bottom sheets.

## Translations

`crowdin.yml` declares `frontend/src/locales/en.json` the source for all ten locale files. The repo
convention, visible in filter commit `a78159439`, is to hand-write **`en.json` and `de.json`**
together and let Crowdin fill the rest. Hand-writing `fr.json` and `it.json` is fine for a
contributor fluent in the language who knows the Swiss scouting and J+S terminology; otherwise leave
them to Crowdin. `rm` falls back to `de` in `plugins/i18n/index.js`, so it never needs hand-editing.
The reference fork edits all five by hand — do not copy that.

## Settled decisions

These were open when this epic was drafted. All are now answered; they are recorded with their
reasoning so nobody re-litigates them per phase.

**1. Fetch comments by camp, never by activity. — decided: yes.**
`Comments.vue` currently calls `activities({id}).comments()`. Phase 01 switches to
`api.get().comments({ camp })` and groups client-side. That one call site is then unchanged by steps
3, 4, 5, 7 and 13, all of which need camp-wide comments, and it shares the hal-json-vuex cache with
the dashboard.

**Follow-up:** the activity subresource `GET /activities/{activityId}/comments` was added because
subresources are more easily cacheable. Once nothing uses it, **remove it** rather than leaving dead
API surface — but ship the feature first. Track it as a cleanup ticket after phase 02. If comment
caching later turns out to matter (see "Known gaps"), reintroducing a cacheable
camp-scoped subresource is the natural move, and it would be a different endpoint anyway.

**2. Remove `CAMP_IS_PUBLIC` from the item-level `Get`. — decided: remove, for now.**
This is the same pattern already used for other entities, and it follows from everything being
linked and embedded and normally fetched via the camp rather than the unfiltered root collection.
Today the item operation allows it but `filterByUser` does not, so it is inconsistent anyway.

Recorded for later, because it is a real use case and not a rejected one: public camps exist so
pre-planned programme can be published for others to copy, and read-only comments could be useful
context there. If a real need arises, the shape would be a mandatory `camp` filter on `/comments`,
or an opt-in `includePublic=true` query parameter — not a blanket re-allow. Posting from a public
camp would stay disallowed regardless.

**3. No editing, ever — decided: no edit.** See "Who this is for". No `editedAt`, no history, no
`textHtml` in any update group. Delete-and-repost is the only way to change a comment, and only its
author can do that.

**4. Deleting a root comment that has replies is refused. — decided: refuse.**
Cascading would let one author destroy other people's replies, which the traceability rule forbids.
**And there is no moderation delete**: a camp manager may not delete another person's comment
either. The reference fork adds both cascade and manager-delete; do not copy either.

**5. Inline anchoring (step 7) is real** — a genuine future feature, just not the highest priority.
Nothing in phases 01–03 may make it harder to reach. Concretely that means: the anchor model is
already designed (above), the panel is already mounted somewhere that can host anchored cards, and
`anchorPath` is already the addressing scheme. Phase 04 stays gated on 01–03 being in production
use, but it is not speculative.

## Known gaps to open issues for

Found while planning. Neither blocks this epic; both deserve their own issue.

**Content nodes are deleted by DB cascade, and the API does not enforce the UI's rule.**
`content_node.parentId` has `ON DELETE CASCADE` (`Version20211030082112.php:21`), `children` has
`cascade: ['persist']` only, and there is no remove processor. Cascade is deliberate and tested:
`api/tests/Api/ContentNodes/ColumnLayout/DeleteColumnLayoutTest.php::testDeleteColumnLayoutAlsoDeletesChildren`
asserts a child `SingleText` returns 404 afterwards. Roots are protected, by
`object.parent !== null` in the security expression.

But the frontend disables the delete menu item when a layout has children
(`MenuCardlessContentNode.vue`, `deletingDisabled()`, "Must be empty to delete"), and **nothing
enforces that server-side**. Any client — or the frontend working from a stale `allContentNodes`
cache — can `DELETE` a populated column layout and silently destroy the whole subtree, with no undo.
The two layers disagree. Either the rule is real and belongs in the security expression
(`object.children.count() === 0`) or a remove processor, or the cascade is the intended semantic and
the UI gate is just friction. **Open an issue; do not fix it in this epic.**

For our purposes the answer is settled either way: `ON DELETE SET NULL` on `Comment.contentNode` is
correct, because a processor-based approach would miss the cascade path.

**Cached responses for cascade-deleted descendants are not purged.**
`PurgeHttpCacheListener` only walks `$uow->getScheduledEntityDeletions()`, which contains just the
explicitly deleted node; cascaded descendants never enter the UnitOfWork. `gatherRelationTags()`
does read `children`, but emits `<childId>#parent`, not the plain `<childId>` tag that
`TagCollector::addCacheTagForResource()` puts on the child's own item response. So Varnish can serve
a 200 for a content node that no longer exists, and grandchildren are not reached at all. **Open an
issue.**

**`activityCount` is derived data living inside the filter object.** It is written by three watchers
in `frontend/src/components/print/config/DialogScheduleEntryFilter.vue:128,137,147`, defaulted in
`repairFilterConfig.js:11,59`, explicitly skipped in `ScheduleEntryFilters.vue:313`
(`key !== 'activityCount'`), implicitly skipped by `DialogScheduleEntryFilter.vue:109` `anyFilter`,
not reset by `resetFilter`, and consumed once in
`components/print/print-client/generatePdfMixin.js:41`. Phase 02 introduces a proper `context`
argument on `filterMatchScheduleEntry` for exactly this class of value — **open an issue to migrate
`activityCount` into it** and delete the two special cases. Not urgent: it is a number, so it survives
the JSON round-trips that would corrupt a Set, which is why phase 02 deliberately does not touch it.
Do it as its own change once `context` exists.

**`frontend/src/test/renderWithVuetify.js` is still Vue 2.** It calls `Vue.use(Vuetify)`,
`new Vuetify()` and uses the old `@vue/test-utils` `Wrapper` API, yet `views/camp/admin/__tests__/Admin.spec.js`
and a few `E*` specs still import it. The current helper is `frontend/tests/setupVuetify.js`. Nothing
in this epic uses the stale one — every new spec uses `setupVuetify.js` — but the leftover invites
new tests to copy the wrong pattern. **Open an issue to migrate the remaining importers and delete
it.** Not part of this epic.

**The activity view could start using the new `activityFromRoute` helper**, instead of getting passed only
the activityId. Check for reasons this was implemented this way before proceeding with an issue.

**Comment caching is future work.** `Comment` does not implement `CanGenerateTagsInterface`. That is
fine — caching is added one endpoint at a time, and comments needing their own development pass is
expected. Just do not assume the sidebar is cache-correct until that work happens.

**Pagination is globally disabled**, so a camp-wide comment fetch returns everything. In practice
comment counts are in the tens, at most around a hundred per camp, so this is a non-issue. Recorded
only so nobody rediscovers it as a surprise.

## Reference implementation

[BacLuc:feat/comments-google-docs](https://github.com/ecamp/ecamp3/compare/devel...BacLuc:ecamp3:feat/comments-google-docs)
implements threads, resolve and tiptap inline anchors. It is **inspiration, not a reference for how
this must be built** — it is content-node-only, does not generalise to schedule entries, checkboxes
or camp level, its print path is unhandled, and its delete semantics (cascade to replies, manager
moderation) contradict settled decision 4. Specific pieces worth lifting are named in the phase
files (`CommentUpdateProcessor` minus its `editedAt` listener, `CommentAnchors::stripFromData`,
`CommentMark.js`, `randomUuid.js`, the `findSnippetRanges` recovery, and the threading
`Assert\Expression`s as the starting point for our validators).

Because we copy files from it, the places where we deliberately differ are worth listing in one place —
each of them is easy to reintroduce by accident:

| the fork                                                   | us                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `Comment::$contentNode` join column `onDelete: 'cascade'`  | `set null` — the thread survives as an orphan (phase 04)         |
| `Comment::$parent` join column `onDelete: 'cascade'`       | deleting a root with replies is refused (decision 4)             |
| `Delete` also allows `CAMP_MANAGER`                        | author only — traceability (phase 03)                            |
| `PATCH` can edit `textHtml`, tracked by `editedAt`         | no editing, ever (decision 3)                                    |
| item `Get` allows `CAMP_IS_PUBLIC`                         | removed (decision 2, phase 01)                                   |
| `(contentNode === null) === (anchorId === null)`           | a content node alone is a valid whole-card anchor (phase 04)     |
| anchors are content-node-only, tiptap-only                 | typed FK + generic `anchorPath` (see the datamodel above)        |
| stores `class="comment-mark"`, sweeps unmatched marks away | no stored class, decoration-based highlight, no sweep (phase 04) |

Tiptap's own [Comments extension](https://tiptap.dev/docs/comments/getting-started/overview) is
**not an option** — see the evaluation in [04-inline-anchoring.md](04-inline-anchoring.md).
