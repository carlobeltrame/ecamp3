# Epic — Comments

Tracking issue: [ecamp/ecamp3#828](https://github.com/ecamp/ecamp3/issues/828)

Users want to leave feedback on a camp's programme. The target feel is Google Docs comments:
a right-hand panel of comment cards, later anchored to the thing they talk about, with a bottom
sheet on mobile. The backend already has a minimal `Comment` entity; the frontend has a
rudimentary, broken implementation that this epic replaces.

The whole feature stays behind the existing `VITE_FEATURE_COMMENTS` toggle until phase 02 ships.

## Phase files

| File                                             | Roadmap steps | Backend work?                             |
| ------------------------------------------------ | ------------- | ----------------------------------------- |
| [01-usable-ui.md](01-usable-ui.md)               | 1, 2          | none                                      |
| [02-finding-comments.md](02-finding-comments.md) | 3, 4, 12      | none (one optional 8-line change)         |
| [03-conversations.md](03-conversations.md)       | 5, 6          | migration + first PATCH operation         |
| [04-inline-anchoring.md](04-inline-anchoring.md) | 7             | migration + purifier + prototype-copy fix |
| [05-notifications.md](05-notifications.md)       | 8, 9, 11      | large; **not planned yet, deliberately**  |

## Roadmap

The order comes from the issue and is fixed. "Where" says which phase file owns the step.

| #   | Step                                                          | Where               | Depends on                           |
| --- | ------------------------------------------------------------- | ------------------- | ------------------------------------ |
| 1   | Usable create / read / delete UI                              | 01                  | —                                    |
| 2   | Enable feature toggle                                         | 01                  | 1                                    |
| 3   | Dashboard indicates activities with comments                  | 02                  | 1                                    |
| 4   | A place for orphan and camp-level comments                    | 02                  | 1                                    |
| 5   | Comment threads                                               | 03                  | 1                                    |
| 6   | Resolve / unresolve                                           | 03                  | 5 (UI only; technically independent) |
| 7   | Anchor to other entities / precise anchors, re-anchor orphans | 04                  | 5                                    |
| 8   | Personal notification bubble with read markers                | 05                  | 3 (supersedes its badge)             |
| 9   | Mentions                                                      | 05                  | a delivery channel                   |
| 10  | Multi-anchor + reference in comment text                      | **dropped**         | —                                    |
| 11  | Push notifications                                            | 05                  | 8, 9                                 |
| 12  | Dashboard filter by has-comments                              | folded into 02      | 3                                    |
| 13  | Cross-camp comments overview                                  | **stub**, see below | —                                    |

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
filter), but it is roughly 30 lines once step 3 has already loaded the data: one chip in
`ScheduleEntryFilters.vue`, one predicate in `common/helpers/filterMatchScheduleEntry.js`. Same PR
as step 3, or dropped.

**Step 13 (cross-camp overview) — a stub, not a phase.** `GET /comments` with no parameters is
_already_ scoped to your camps by `CommentRepository::filterByUser`, so this is one view and zero
backend — cheaper than step 12. It is not obsoleted by 8 + 11: push notifies, an overview lets you
go looking. Do it the first time someone asks; budget about a day.

## Target datamodel

Anchors are **typed nullable foreign keys plus one generic `anchorPath`**.

The insight that keeps this small: the frontend already addresses every field inside every content
node as `uri` + `path` (a lodash path — see `frontend/src/mixins/apiPropsMixin.js` and
`ApiWrapper.vue`). An LA-thematic-area checkbox is `data.options.<key>`; a storyboard cell is
`data.sections[<uuid>].column2Html`; a Notes body is `data.html`. Those are **not** three anchor
types — they are one `contentNode` FK with three different `anchorPath` values. The only genuinely
new _entity_ on the entire roadmap is `ScheduleEntry`.

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
  anchorText     ?text            snapshot, max 255               phase 04
  scheduleEntry  ?ScheduleEntry   ON DELETE SET NULL              when picasso ships
```

The granularity ladder falls out with no discriminator column:

| meaning                       | activity | contentNode              | anchorPath                          | anchorId |
| ----------------------------- | -------- | ------------------------ | ----------------------------------- | -------- |
| whole camp                    | null     | null                     | null                                | null     |
| whole activity (today)        | set      | null                     | null                                | null     |
| whole content-node card       | set      | set                      | null                                | null     |
| one storyboard section editor | set      | set                      | `data.sections[<uuid>].column2Html` | null     |
| one LA checkbox               | set      | set                      | `data.options.<key>`                | null     |
| text range                    | set      | set                      | `data.html`                         | `<uuid>` |
| schedule entry                | set      | null (+ `scheduleEntry`) | null                                | null     |
| orphaned                      | null     | null                     | kept                                | —        |

Orphaned is unambiguous with existing columns: `orphanDescription !== null`. No `anchorLevel`
column.

Two rules that are easy to get wrong:

**Denormalise `activity` onto every anchor inside an activity's content-node tree.** This is the
single most valuable decision in the model. It keeps `GET /activities/{id}/comments` and
`Activity::$comments` working untouched, and keeps "does this activity have comments" one indexed
query instead of a tree walk. Content nodes in `Category` prototype trees legitimately have
`activity = null`; the column is already nullable.

**`contentNode` and `scheduleEntry` use `ON DELETE SET NULL`, with no remove-processor.** Content
nodes are deleted by DB cascade (`ContentNode.parent` is `onDelete: CASCADE`), so a PHP processor
mirroring `ActivityRemoveProcessor` would silently miss the common case — deleting a parent
`ColumnLayout` wipes descendants without any processor running. Instead, `anchorText` (the snapshot
stored so a thread can be re-anchored) doubles as the "this used to be attached to «…»" label.
`orphanDescription` stays activity-only, as it is today. Schedule entries always belong to an
activity, so `SET NULL` there degrades a comment to activity-level, which is semantically right.

Deferred on purpose: `CommentAnchor` (see step 10 above) and any denormalised `commentCount` column
(derive counts client-side from the camp-wide fetch until it measurably hurts).

## Frontend architecture

**One singleton panel in `App.vue`, not a wrapper around page content.**

```
App.vue
  <router-view name="navigation" />
  <router-view name="aside" />                 left drawer, unchanged
  <CommentsPanel v-if="featureComments" />     new
  <v-main><router-view /></v-main>
```

Pages opt in with two calls:

```js
setCommentScope({ camp, activity }) // on mount / route change
clearCommentScope() // on unmount
```

Why this and not the current `CommentWrapper.vue`, which wraps the page in a flex row:

- `v-navigation-drawer app location="right"` makes Vuetify pad `v-main` itself. The content column
  narrows with no flex wrapper and no JS measuring, so the reference fork's measure-and-grow
  feedback loop (it grew the page every frame) is structurally impossible.
- The picasso owns its own full-height layout and cannot be wrapped. Camp-level and dashboard views
  need the same panel. With a singleton each costs about six lines.
- Today's `Comments.vue` is an _ancestor_ of the activity, so its `v-if="!comments._meta.loading"`
  blocks the whole page from rendering until the comments request resolves. A sibling panel cannot
  do that.

Shared state lives in a **module singleton** (`commentsState.js`), not provide/inject and not Vuex.
Provide/inject cannot work — the panel is outside every page's provide tree. Vuex is the wrong tool
for DOM-adjacent UI state, and Pinia is not installed.

From phase 04 the same module carries the anchor registry, keyed by `anchorKey(uri, path)` to mirror
`apiPropsMixin`. Registering a new anchorable surface is one call; see
[04-inline-anchoring.md](04-inline-anchoring.md).

## Invariants to preserve

- **Comments are never copied by prototype.** Today this is free: `Comment` does not implement
  `CopyFromPrototypeInterface`. Phase 04 breaks the free part — see its Backend section.
- **Comments never appear in print.** Also free today: `frontend/src/pdf/` and `/print/` only walk
  the content-node tree, and `prepareInMainThread.js` uses an explicit allow-list that omits
  `comments`. Phase 04 must strip anchor spans in both renderers.
- **Max 1024 characters**, enforced by `Assert\Length` on `textHtml`.
- **Guests can comment.** `CAMP_COLLABORATOR` includes the `guest` role, which satisfies the MVP
  requirement "even as a guest".
- **Only `frontend/src/locales/en.json` is hand-edited.** `crowdin.yml` declares it the source for
  all ten locale files. The reference fork edits de/en/fr/it/rm by hand; that is wrong for this
  repo.

## Decisions that must be settled before phase 01

Each has a proposed default so nobody stalls.

**1. Fetch comments by camp, never by activity. — default: yes.**
`Comments.vue` currently calls `activities({id}).comments()`. Switch to
`api.get().comments({ camp })` and group client-side, in phase 01. That one call site is unchanged
by steps 3, 4, 5, 7 and 13, all of which need camp-wide comments, and it shares the hal-json-vuex
cache with the dashboard. Keep the activity subresource on the API — it is harmless and already
tested — just stop using it. Reversing this later means rewriting the panel three times.

**2. Remove `CAMP_IS_PUBLIC` from the item-level `Get`. — default: remove. Needs product sign-off.**
Today an anonymous visitor to a public camp can fetch a comment by URL but cannot list them
(`filterByUser` excludes them). That is inconsistent, and planning notes are exactly what people
assume is internal. Every later step has to answer "what does an anonymous user do here" and the
answer is always "nothing". One line in `Comment.php`, one assertion in `ReadCommentTest.php`.
Guests keep full access. Much harder to walk back after launch than before.

**3. No editing, ever — delete and repost. — default: no edit.**
Keeps phase 03's PATCH resolve-only, and keeps phase 05's read markers tractable: "has this user
seen comment X" gains no "…in which version" clause. The 1024-character limit reinforces it. If the
answer is "maybe later", `editedAt` must go into phase 03's migration or you pay for a second one.

**4. Deleting a root comment that has replies is refused, not cascaded. — default: refuse.**
The reference fork uses `onDelete: cascade` from `parent`, which lets an author delete their root
comment and silently destroy everyone else's replies. In the same breath: camp managers may delete
anyone's comment (`or is_granted("CAMP_MANAGER", object)`, one line). Both are cheap now and are
migrations-plus-support-tickets later.

**5. Is inline anchoring (step 7) real? — default: yes, but only after 01–03 are in production use.**
It is roughly three times phases 01–03 combined, and it is the only step that breaks the "comments
are structurally invisible to print and prototype" invariant: `span[data-comment-id]` goes _inside_
stored content-node HTML, so it must be allowlisted in `exercise_html_purifier.yaml`, stripped in
the prototype-copy path, and stripped in **both** `frontend/src/pdf/` and `/print/`. The reference
fork covers neither renderer. If the answer is no, most of phase 04 disappears.

## Loose ends to check during phase 01

- `Comment` does not implement `CanGenerateTagsInterface` (only `Day` and `ScheduleEntry` do). Check
  `api/src/HttpCache/PurgeHttpCacheListener.php` and confirm a new comment invalidates the cached
  `/comments?camp=…` response behind Varnish. A stale sidebar is the classic first bug report.
- Pagination is globally disabled (`api/config/packages/api_platform.yaml:30`), so a camp-wide fetch
  ships the entire comment history in one response. Fine now; revisit past roughly a thousand
  comments per camp.

## Reference implementation

[BacLuc:feat/comments-google-docs](https://github.com/ecamp/ecamp3/compare/devel...BacLuc:ecamp3:feat/comments-google-docs)
implements threads, resolve and tiptap inline anchors. It is **inspiration, not a reference for how
this must be built** — it is content-node-only, does not generalise to schedule entries, checkboxes
or camp level, and its print path is unhandled. Specific pieces worth lifting verbatim are named in
the phase files (`CommentUpdateProcessor`, `CommentAnchors::stripFromData`, `CommentMark.js`, and
the threading `Assert\Expression`s).
