# Phase 02 — Finding comments (roadmap steps 3, 4, 12)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes discoverable without already knowing where it is. The dashboard shows which
activities have comments, clicking that badge takes you to the activity with the panel open (or, on
mobile, opens the panel filtered to it), and a general toggle opens the camp-scoped panel — which is
where **camp-level comments** and the **orphans that activity deletion already produces today and
that are currently unreachable in the UI** live. A filter narrows the dashboard to commented
activities, and the filtered view is shareable by URL so a coach can send the planning team a link
straight to their feedback.

Only after this ships is the toggle worth turning on in `staging` and `prod`.

## Status (2026-10-17)

- **Steps 3 and 4: done on `devel`** (PR #10454 and the follow-ups `c61b4e8cb` … `29170cd85`). The
  shipped version follows this file, with these differences from the text below: the badge is
  `CommentCountIcon` (count inside the bubble), not `CountBadge`; the desktop hint line sits at the
  **bottom** of the list, below the comments (`b15207be7`), not above it; detached comments got a more
  prominent treatment on the card (`29170cd85`).
- **Step 12: not on `devel`.** Three of the six commits on `comments-frontend-2` implement it and should
  be rebased onto `devel`: `f56cea710` (context argument), `f4373179a` (`querySyncHelper`) and
  `bd1bad55b` (the filter). The other three are superseded or contradict this file — see the epic's
  status table. When rebasing `bd1bad55b`, build `context.activitiesWithComments` from the comment-count
  `Map` that `Dashboard.vue` already holds on `devel`; do not bring back `20bd291c4`'s panel-side Set.
- **Rollout: open.** `dev` first (phase 01), then `staging` and `prod` once step 12 is in.

## The panel is camp-scoped here — no separate view

Roadmap step 4 asked for "a place to display orphan comments or comments on the camp itself". That
place is **the phase 01 panel**, not a new page. Phase 01 derives its scope from the route:
`campFromRoute` always resolves on a camp route, `activityFromRoute` only on an activity route. So
the panel is already:

- **activity-scoped** on the activity page — filtered to that activity;
- **camp-scoped** on the dashboard and (later) the picasso.

That falls out of phase 01's design at no cost, and it is strictly better than a standalone page:
one component, one set of behaviours, and camp-level comment creation and orphan handling come along
for free instead of being reimplemented.

### What camp scope contains: not everything, and it depends on the viewport

Phase 02 previously answered "should the camp panel list all the activity comments?" with "yes, that
is simply what the unfiltered panel is". **That answer is wrong on desktop**, and the reason is worth
writing down because it constrains later phases:

> **A comment's context is part of the comment.** "This is too long for the age group" means nothing
> next to a timestamp and an author; it means something next to the activity it is about. A flat list
> of every comment in a camp reads as a pile of fragments.

So:

| viewport                 | camp scope shows                                                |
| ------------------------ | --------------------------------------------------------------- |
| **Desktop** (`mdAndUp`)  | camp-level comments and orphans **only** — no activity comments |
| **Mobile** (`smAndDown`) | everything, one chronological list, in the fullscreen panel     |
| **Mobile, badge tapped** | one activity's comments — see the badge under step 3            |

Desktop can put the comment next to its context — so it insists on doing that, and activity comments
are read on the activity page, where the panel is activity-scoped and the programme is on screen next
to it. Mobile cannot: the panel is fullscreen (phase 01), the activity is not visible behind it
anyway, and forcing a user to walk activity by activity on a phone to find feedback would be worse than
a list. So mobile keeps the full list.

**The uses that a full desktop list would have served are separate features, deliberately not this
one.** Working through comments as a to-do list, or using them to navigate the camp, are real wants —
they are just not "the comments panel with no filter applied", and they get designed as their own
thing if and when they are asked for. Phase 06's cross-camp overview is the first of them.

### Say so, in the panel

A short list with no explanation looks like a bug, or like the camp has no feedback. So the **desktop**
camp-scoped panel carries a small muted line above the list, saying that comments on individual
activities live on those activities.

Three details that make it worth its space rather than boilerplate:

- **It carries the number**: "12 more comments are on individual activities." The panel already holds
  the whole camp's collection, so the count is a `.length` over the comments `scopedComments` filtered
  out — no extra request, no second predicate. From phase 03 it counts **open threads only**, the same
  rule the dashboard badges follow, so an all-resolved camp does not advertise a backlog.
- **It is hidden when the number is zero.** With nothing to explain, a standing notice is just noise —
  and it would otherwise appear in every new camp, which is the worst possible first impression of the
  feature.
- **It is text, not a link.** The way to reach those comments is the dashboard badges, which are on the
  page behind the drawer; a link here would either go to the page the user is already on, or invent a
  second navigation path to maintain.

Not shown on mobile, where the panel already lists everything, and not in activity scope, where the
question does not arise.

Consequences to build:

- The dashboard needs a **general toggle button** in its toolbar, not only the per-row badges.
- That toggle **carries a count**, drawn inside the speech-bubble icon by `CommentCountIcon`, the same
  component the per-row badges use. The number answers "how many comments will I see if I open the
  panel here" — which now means it is **viewport-dependent in camp scope**: on desktop it counts
  camp-level and orphan comments, on mobile everything. `scopedComments` is the single predicate
  deciding what the panel renders _and_ what the toggle counts, so they cannot disagree, and the
  viewport belongs in that one predicate rather than in two components. Show the button at zero too —
  an empty camp-level list is still where you go to write a camp-level comment.
- `CommentsList` renders **one chronological list** in every scope. What changes with scope is only
  which comments are in it. No grouping, no buckets, no ordering code.
- **A card shows a context label only when the list mixes contexts** — that is, in camp scope. In
  activity scope every comment shares one activity and the panel header already names it, so a label
  on every card is repetition, not information; the same goes for the mobile badge-filtered list,
  which _is_ activity scope. The one exception is an **orphan**, which always shows its
  `orphanDescription`: "the activity this was about is gone" is a fact about the comment, not about
  the list it happens to be in.
- Creating a comment from the camp-scoped panel omits `activity` — the backend already allows it
  (`activity` is nullable, only `camp` is required). On desktop this is now the panel's main job.
  **Except under the mobile badge filter**, where the composer posts to that activity — see step 3.
- Phase 04 needs nothing structural from this: a comment that kept its activity but lost its
  content-node anchor is just a card that additionally quotes its `anchorContext`, in its chronological
  place like every other.

## Non-goals

| Not in this phase                                               | Phase that does it                        |
| --------------------------------------------------------------- | ----------------------------------------- |
| Unread state — the badge means "has comments", not "has unread" | 05 (step 8 supersedes this badge)         |
| Replies, resolve                                                | 03                                        |
| De-anchored comments shown inline above their activity          | 04                                        |
| Any way to re-anchor or relocate a comment                      | never — see 04's "terminal"               |
| A picasso toggle button                                         | when the picasso work happens             |
| Cross-camp overview                                             | 06                                        |
| Any comments UI for external (public-camp) users                | never — gated on `isOutsider` in 01       |
| A "has comments" filter in the **print** configs                | never — deliberately omitted, see step 12 |
| A `commentCount` scalar or column on Activity                   | not built — see step 12                   |
| A standalone camp comments list with filters (vision K)         | 06 — its own list, not the panel          |

## Backend changes

**None.**

`GET /comments?camp=/camps/x` is served by the plain `GetCollection` plus the existing
`SearchFilter`, scoped by `CommentRepository::filterByUser` (author, or any camp you have a
`UserCamp` for). Orphans come back in the same response with `activity: null` and
`orphanDescription` set.

Do **not** flip `Camp::$comments` to a readable subresource link. The query filter already works,
phase 01's code path is camp-scoped anyway, and it would cost a regeneration of all three snapshot
files for no functional gain. (See also the epic's follow-up on removing the now-unused _activity_
subresource once the feature has shipped.)

## Ordering — chronological, like a chat

**Every list of comments, in every scope and on every viewport, is `createTime` ascending.** That is
what the API already returns (`Comment` has `order: ['createTime' => 'ASC']`), so this phase writes no
ordering code at all — and neither do 01 and 03.

Phase 04 is the one exception, and it is a narrow one: where an anchored comment's text is on screen
beside the panel, it orders those comments by their position in that document, falling back to
`createTime` for everything else. The rule underneath both decisions is the same — **order by something
the reader can see next to the panel; otherwise chronological** — which is exactly why programme order
is rejected below and document order is not.

Ascending rather than newest-first, for three reasons that reinforce each other:

- a thread of feedback **reads** in the order it was written, the way a chat does — reversing it makes
  a reply appear above the thing it replies to;
- with the composer at the bottom, a comment you just posted appears **directly above the input you
  typed it in**, which is the feedback that tells you it worked;
- it matches phase 01 and phase 03, which are ascending already, so there is one rule rather than a
  per-scope rule.

**The camp-scoped list is flat, not grouped.** Each card carries its own context instead — the activity
title, or nothing for a camp-level comment, or the deleted activity's title from `orphanDescription`
for an orphan. That is the same information the buckets would have conveyed, in the place where it is
actually needed: on the comment.

### What this deletes

An earlier draft ordered the camp list by **first appearance in the visible programme**: activity
groups sorted by their first still-visible schedule entry, which forced the panel to reconstruct the
dashboard's filter and the picasso's period from the route so its order could not disagree with the
page behind it. All of it is gone:

- `firstAppearanceByActivity` and its spec — not written. If the material overview ever wants programme
  ordering for material items, it writes it then, for itself.
- The panel no longer reads `processRouteQuery` or `periodFromRoute`, computes no
  `filteredScheduleEntries`, and needs no `context.activitiesWithComments`.
- The camp-level and orphan **buckets** — replaced by the per-card context label in camp scope.

**The panel also no longer filters its contents by the dashboard filter.** That rule existed because the
_order_ depended on the filter; with a chronological order the only remaining argument was "the panel
and the page should agree", and it does not survive contact with the actual UI: on mobile the panel is
fullscreen, so there is no visible dashboard to disagree with, and on desktop the panel does not show
activity comments at all. The toggle's count stays honest either way — it still answers "how many will
I see if I open this", which is now simply all of them.

If anyone is ever tempted to order comments by the programme after all, the one trap worth keeping:
**do not sort by `scheduleEntry.number`.** `Activity` has no number (it is computed on `ScheduleEntry`,
`api/src/Entity/ScheduleEntry.php:339-357`, not an ORM column); it does not sort as a string (unpadded
decimal days, roman suffixes); and it is not a total order at all — `getScheduleEntryNumber()` counts
within one `numberingStyle`, so `1.1`, `1.a` and `1.i` can coexist on a day, and style `-` yields `''`.
Read the index off the already-ordered schedule-entry list instead.

### Scrolling to the bottom after posting

Ascending order puts a new comment at the end of the list, which is off-screen in any list long enough
to scroll. So **after a successful POST and the collection reload, scroll the list to the bottom** —
on desktop and on mobile alike.

Concretely, in `CommentsList`: `await` the post, `await this.$nextTick()` so the reloaded collection has
rendered, then set the scroll container's `scrollTop` to its `scrollHeight`. It needs a `ref` on the
panel's scrollable body; phase 01 already established that the body scrolls rather than the drawer
growing, so the container exists.

The **composer stays sticky** at the bottom of the panel, so it is reachable at any scroll position and
the scroll is about seeing your comment land, not about reaching the input.

Opening the panel does **not** scroll to the bottom: with a sticky composer there is nothing to reach,
and starting at the oldest comment is the right reading order for feedback you have not read yet.
Revisit only if real camps produce lists long enough that people complain about the trip.

## Frontend changes

### Step 3 — dashboard indicator

**`frontend/src/views/camp/Dashboard.vue`** — load the camp's comments once in `mounted()` alongside
the existing batch loads and build a `Set` of activity IRIs that have comments. Add `comments` to the
existing `loadingEndpoints` object so every consumer keeps the established skeleton contract
(`categories`, `periods`, `campCollaborations`, `progressLabels` are already there). Add a
`<CommentsToggleButton />` to the dashboard toolbar.

**`frontend/src/components/dashboard/ActivityRow.vue`** — render
`components/dashboard/CountBadge.vue` in the title cell, next to the `router-link`, guarded the way
every other cell is:

```html
<CountBadge v-if="!loadingEndpoints?.comments && commentCount" :count="commentCount" />
```

Make the badge **clickable**, and this is the one place the two viewports genuinely diverge:

- **Desktop — navigate to the activity and open the panel there** (`commentsState.open = true` before
  the push; the singleton survives the route change). The desktop camp panel does not contain activity
  comments, and the reason it does not is the same reason the badge navigates: the feedback is only
  meaningful next to the activity it is about, and the drawer lets you see both.
- **Mobile — do not navigate. Open the panel filtered to that activity.** Navigating would mean the
  user opens the panel, closes it, and finds themselves on a different page than the one they were
  looking at — because the mobile panel is fullscreen, so the route change happens entirely out of
  sight. That is disorienting in a way the desktop drawer is not, and it is worth diverging over.

The mobile filter is **one field and one line of wiring**, because camp scope filtered to a single
activity is exactly activity scope:

```js
// commentsState.js — added by this phase
activityFilter: null,               // an activity entity, set only by the dashboard badge
export function openCommentsForActivity(activity) { … }   // sets both, in one action
```

```js
// CommentsPanel.vue
activity() {
  return activityFromRoute(this.$route) ?? commentsState.activityFilter
},
```

Everything downstream then works unchanged, because it already handles "the panel has an activity" —
and that is not only about what is displayed. `CommentComposer` takes `activity` as a prop (phase 01),
so **a comment written in the filtered panel is posted to that activity, not to the camp**, which is
what someone who tapped that activity's badge means. The context labels drop away for the same reason.
The filter is a **scope**, not a view filter: it decides what you write as well as what you read.
Getting that backwards — a display-only filter over a camp-level composer — would let someone answer an
activity's feedback and have the answer land nowhere near it.

Three rules that keep it from becoming a mode:

- **It lives exactly as long as one panel opening.** `CommentsPanel` watches `open` and clears
  `activityFilter` when it goes false — a watcher rather than a `closeComments()` helper, because
  `open` is also written directly by the dialog's `v-model` and every future close path would have to
  remember the helper. It is cleared by `resetCommentsState()` too, so a camp change cannot strand it.
- **The panel header names the activity**, or the user is looking at a filtered list with no
  explanation of why it is short. This matters more here than on desktop: the fullscreen panel has
  hidden the dashboard that would otherwise have supplied the context.
- **No filter control in the UI.** Not editable, no dropdown, no chip: closing the panel and reopening
  it from the toolbar toggle is how you get back to everything, and that is one tap. If a "show all"
  affordance is wanted later it is one button calling `activityFilter = null`.

Note the toggle button's count is unaffected — it still answers "what will I see if I open the panel
from here", and the filter does not exist until a badge is tapped.

**Keep the badge deliberately dumb.** It means "this activity has N comments". Step 8 changes the
semantics to "N unread", and anything cleverer built now gets rewritten then.

One forward-looking rule, decided in phase 03 so it is not re-argued: once resolve exists, the badge
counts **open threads only**, and disappears when every thread on an activity is resolved. Same for
the `hasComments` filter. That is the point of resolving — an addressed change request stops
demanding attention.

### Step 4 — camp-level and orphan comments

Covered by the camp-scoped panel above. Concretely, in `CommentsList.vue`:

- one chronological list of camp-level comments and orphans, with the deleted activity's title from
  `orphanDescription` on each orphan and a delete action for the comment's own author. That list is the
  whole desktop camp panel, and its camp-level comments need no label — they are what the list is;
- **on mobile only**, the activity comments join the same list. Now the list mixes contexts, so every
  card gets a label: the activity title, or an explicit camp-level one. Do not signal camp-level by the
  _absence_ of a label in a mixed list — an unlabelled card reads as an oversight, not as a statement;
- the composer creates camp-level comments — unless the mobile badge filter is set, in which case it
  posts to that activity.

Note this list is the **end of the line** for orphans: phase 04 deliberately does not
add a way to move an orphan to a replacement activity. They are readable, deletable by their author,
and — from phase 03 — resolvable. See phase 04's "De-anchored and orphaned threads are terminal".

This is not really a feature request. Activity deletion has produced orphan rows since
`ActivityRemoveProcessor` shipped, and there is no way to read or delete them. That is a
data-loss-shaped bug, and the reason this phase should not slip behind 03.

### Step 12 — dashboard filter, and URL persistence

The filter widget is shared, and that makes this **cheaper**, not more expensive. Two facts do the
work:

1. `common/helpers/filterMatchScheduleEntry.js` is a pure predicate where **every clause is written
   "absent ⇒ pass"**. A `hasComments` key that never appears in a print config is `undefined` there
   and the new clause short-circuits. Of the **26 call sites** (4 in the app, 4 in print config
   previews, and the rest in `frontend/src/pdf/campPrint/` and `print/components/`), most need zero
   changes.
2. Print reaches the filter UI through exactly one wrapper,
   `frontend/src/components/print/config/DialogScheduleEntryFilter.vue`. **One `hide-comments-filter`
   prop on that single line is the entire print omission.**

The picasso comes free: `CampProgram.vue:97` passes `:filter-fn="filterMatchScheduleEntry"` into
`ScheduleEntries.vue`, which tags each entry with `filterMatch`, and `PicassoEntry.vue` greys out
non-matching entries.

Note the component lives at `frontend/src/components/program/ScheduleEntryFilters.vue` — only the
leaf widgets (`BooleanFilter.vue`, `SelectFilter.vue`, `CountBadge.vue`) are under
`components/dashboard/`.

#### The derived data must not live in the filter object

The count comes from a `Set` of activity IRIs, and the filter object is **not** the place to put it.
`filter` is JSON-serialized across three boundaries — the URL query, `localStorage` via
`setLastPrintConfig` (`PrintConfigurator.vue:339`), and the nuxt print app's URL query
(`print/pages/index.vue:26`) — and `JSON.stringify(new Set([...]))` is `{}`. The filter would work in
the live dashboard and then **silently stop filtering** in the print preview and after any reload.
`repairFilterConfig`'s falsy check would not catch it either. That is a wrong-printout bug nobody
notices.

There is already precedent for the smell, and it has already been paid for: **`activityCount`** is a
derived value living in the filter object, written by three watchers in
`DialogScheduleEntryFilter.vue:128,137,147`, defaulted in `repairFilterConfig.js:11,59`, and
explicitly skipped in `ScheduleEntryFilters.vue:313` (`key !== 'activityCount'`). Do not copy it.

**Add an optional third argument instead.** Raw, serializable user selections stay in `filter`;
derived lookup data goes in `context`:

```js
const filterMatchScheduleEntry = (scheduleEntry, filter, context = {}) => {
  if (!filter) return true
  return (
    /* …existing clauses unchanged… */
    // The Set lives in `context`, not `filter`: `filter` is JSON-serialized into
    // localStorage and the print URL, and a Set becomes {}.
    !filter.hasComments ||
    !!context.activitiesWithComments?.has(scheduleEntry.activity()._meta.self)
  )
}
```

The default keeps most call sites at a zero diff. Weighed and rejected: a curried
`makeFilterMatcher(context)` forces all 26 sites to change for the same power, and predicate
registration is an extension point for one predicate.

**Do this as its own commit**, before the filter itself — it is a shared-helper signature change and
deserves to be reviewable on its own.

Do **not** retrofit `activityCount` out of the filter in the same breath. It is a number, it survives
JSON, and untangling its two special cases is unrelated work.

Easy to forget, and each one produces a quietly wrong UI:

- `repairFilterConfig.js` — add `if (typeof filter.hasComments !== 'boolean') filter.hasComments = false`.
- `ScheduleEntryFilters.vue:360` `resetFilter` and `:322` `showOnlyMyActivities` (getter **and**
  setter) enumerate filter keys explicitly — add the new keys or "only my activities" reports the
  wrong state.
- `DialogScheduleEntryFilter.vue:109` `anyFilter` hand-enumerates too.
- Every `filterFn` must thread `context` through, or the "(N)" counts next to the new option are
  wrong while the filter itself is right.
- `filteredPropertiesCount` (`:313`) counts truthy non-arrays, so it picks up `hasComments` for free.

#### URL persistence

Persisting is the point of the feature: a coach sends the planning team a link to a filtered
dashboard showing exactly the activities that need changes. (An earlier draft also used it to let the
panel reconstruct the filter from the route; that is gone — the panel ignores the dashboard filter,
see Ordering above.)

`frontend/src/helpers/querySyncHelper.js` needs two changes:

**1. Booleans.** Keep them out of the HAL machinery — a boolean is not an IRI. A `BOOL_PARAM_KEYS`
list plus one branch in `processRouteQuery` and one in `transformValuesToHalId`. Encode presence as
`'true'` and absence as omission; `hasComments: false` already falls out at the existing `!!value`
filter. **Beware `Boolean('false') === true`** — `isValidParamEntry` would otherwise wave
`?hasComments=false` through as truthy.

**2. `filterAndQueryAreEqual` — the one you must not skip.** It hard-codes
`['category', 'responsible', 'progressLabel']` plus `period`. If the user changes _only_
`hasComments`, the compared keys are unchanged, it returns `true`, `persistRouterState` returns
early, and **the URL never updates**. Silent, not a crash — an hour of debugging the wrong thing.
Derive the key list instead of hard-coding it, so the next filter cannot repeat the trap.

It is also the **only function in the module with no unit test** — `querySyncHelper.spec.js` has 40
cases across the other five functions and none for this one. Add them.

In `Dashboard.vue` and `CampProgram.vue`: add `hasComments: false` to the filter data, and
**collapse the four per-key string-path watchers into one** `filter: { deep: true, handler:
'persistRouterState' }`, which removes the per-key maintenance forever.

**The `day` filter stays unpersisted, deliberately.** It is not useful on the dashboard or the
picasso and is not shown there — `hide-day-filter` is set on all four instances; it exists for the
print config only (commit `a78159439`). So it needs no URL plumbing, and the panel never has to
reconstruct it. Worth knowing that it is _also_ currently swallowed by the
`filterAndQueryAreEqual` bug above, which the fix incidentally makes safe if it is ever exposed —
but exposing it is out of scope here.

## Commits

Land these as separate commits even though they share a phase file — the git history should show
which roadmap step each change served:

1. **`filterMatchScheduleEntry` context argument** — shared-helper signature change, reviewable alone.
2. **Step 4** — camp-scoped panel: the chronological list, context labels, camp-level and orphan comments,
   dashboard toggle button.
3. **Step 3** — camp-wide comment fetch, `CountBadge` on `ActivityRow`, click-to-open-and-scroll.
4. **Step 12** — the `hasComments` filter, plus the `querySyncHelper` work (booleans,
   `filterAndQueryAreEqual` + its missing tests). The panel does **not** become filter-aware.

2 and 3 can swap; 1 must come before 4. 2 and 3 are on `devel`; 1 and 4 are the remaining work.

## Files touched

```
frontend/src/views/camp/Dashboard.vue                              modified
frontend/src/views/camp/CampProgram.vue                            modified  (step 12)
frontend/src/components/dashboard/ActivityRow.vue                  modified
frontend/src/components/comments/CommentsList.vue                  modified  (labels, scroll-to-bottom)
frontend/src/components/comments/CommentCountIcon.vue              new       (count inside the bubble)
frontend/src/components/comments/scopedComments.js                 new       (which comments a scope shows)
frontend/src/components/comments/CommentsToggleButton.vue          modified  (count + aria-label)
frontend/src/components/comments/commentsState.js                  modified  (+activityFilter)
frontend/src/components/comments/CommentsPanel.vue                 modified  (filter header, clear on close)
frontend/src/components/program/ScheduleEntryFilters.vue           modified  (step 12)
frontend/src/components/program/repairFilterConfig.js              modified  (step 12)
frontend/src/components/print/config/DialogScheduleEntryFilter.vue modified  (step 12)
frontend/src/helpers/querySyncHelper.js                            modified  (step 12)
frontend/src/helpers/__tests__/querySyncHelper.spec.js             +filterAndQueryAreEqual cases
common/helpers/filterMatchScheduleEntry.js                         modified  (context arg + clause)
common/helpers/__tests__/filterMatchScheduleEntry.spec.js           modified
frontend/src/components/comments/__tests__/CommentsList.spec.js    modified
frontend/src/locales/en.json, de.json                              +keys
e2e/tests/5-cross-browser-tests/persistDashboardFilter.spec.ts     +cases
```

No new view, no new route, no nav entry — the panel is already mounted in `App.vue`.

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
docker compose exec print npm run test        # common/helpers is shared with /print
```

- `CommentsList.spec.js` — **desktop camp scope shows only camp-level comments and orphans**, with no
  activity comments; **mobile camp scope** shows everything; both are one list in `createTime`
  ascending order; activity scope is unchanged from phase 01. Plus: **posting scrolls the list to the
  bottom**, asserted on the container's `scrollTop`.
- Context labels: present on every card in the mobile camp list, **absent in activity scope and in the
  mobile badge-filtered list**, and present on an orphan in every scope that shows one.
- The desktop hint line: present with the right count when activity comments exist, **absent at zero**,
  and absent on mobile and in activity scope.
- With `activityFilter` set, the composer posts `activity` — not a camp-level comment.
- `ActivityRow.spec.js` — badge appears with a count, absent at zero, skeleton while
  `loadingEndpoints.comments` is true; **on desktop clicking it navigates and opens the panel**, **on
  mobile it opens the panel with `activityFilter` set and does not navigate**.
- `CommentsPanel.spec.js` — with `activityFilter` set the panel renders that activity's comments and
  names it in the header; **closing the panel clears the filter**, so the next open is unfiltered.
- `filterMatchScheduleEntry.spec.js` — the new clause passes when `hasComments` is absent (the print
  case), and passes/fails correctly with a `context.activitiesWithComments` Set. Also assert the
  helper still behaves when called with **two** arguments, which is how most call sites invoke it.
- `querySyncHelper.spec.js` — **`filterAndQueryAreEqual`, which has no tests today**: a
  `hasComments`-only change must report _not equal_. Plus boolean round-tripping and the
  `?hasComments=false` case.

**e2e** — extend `persistDashboardFilter.spec.ts`. Note the existing tests assert on chip label text,
which cannot distinguish a `BooleanFilter`'s on/off state (it toggles `variant`/`color`, not text);
assert the class, or the row count. Add **one test that asserts the URL directly**
(`expect(page).toHaveURL(/hasComments=true/)`) — the `filterAndQueryAreEqual` bug produces a page
that looks right until you reload, so a text-only assertion would pass against broken code.

**Snapshots:** none. No serialization group changes in this phase.

**`common/` is shared with `/print`.** Changing `filterMatchScheduleEntry.js` there means running the
`print` checks too — it is the only file this phase touches outside `frontend/`.

## Verification

1. Create comments on two of the three activities in a camp, one camp-level comment, and delete an
   activity that has a comment (to produce an orphan).
2. Open the dashboard. Exactly the two commented activities carry a count badge with the right
   counts. Reload throttled and confirm the badge cell shows a skeleton, not a flash of zero.
3. **On desktop**, click the general comments toggle. The panel shows the camp-level comments and the
   orphan (labelled with the deleted activity's title), oldest first — and **no activity comments at
   all**, but a line above the list saying how many there are and where they live. Resolve every
   activity comment (phase 03) and reopen the panel: the line is gone.
4. Add a camp-level comment from the panel. It appears **at the bottom, directly above the composer**,
   and the list has scrolled to it. Repeat on mobile with a list long enough to scroll.
5. Delete the orphan (as its author). It disappears.
6. **On desktop**, click an activity's count badge. You land on the activity page with the panel open
   on that activity's comments.
7. **On mobile** (narrow the viewport), click the same badge. The panel opens **fullscreen, filtered to
   that activity**, and the header names it. Write a comment there: it lands **on that activity**, not
   on the camp — confirm it appears on the activity page afterwards. You are still on the dashboard:
   close the panel and the dashboard is exactly where you left it, which is the whole reason mobile does
   not navigate. Open the panel again from the toolbar toggle: it is unfiltered, and the composer is
   back to camp-level.
8. **On mobile**, open the panel from the toolbar toggle. It lists every comment in the camp as one
   chronological list, each card naming the activity it belongs to, with camp-level and orphaned ones
   interleaved by time and labelled as such. Tap a dashboard badge instead: that list is one activity's
   comments and the labels are gone, because the header says it once.
9. **On mobile**, filter the dashboard by category and open the panel. Its contents are **unchanged** —
   the panel deliberately does not follow the dashboard filter — and the toggle's count matches what
   the panel shows.
10. Toggle the "has comments" filter. Only the two rows remain and the filtered-count indicator
    updates. **Reload — the filter survives.** Copy the URL into a fresh browser profile logged in as
    another collaborator and confirm they see the same filtered view.
11. Open the picasso with the same filter set. The commented entries stay normal, the rest are greyed
    out and undraggable. **This should require no picasso code.**
12. Open the print configurator and any print config's filter dialog. There is **no** "has comments"
    chip. Generate a PDF with another filter set — output unchanged from before this phase.
13. Save a print config with filters, reload the page, and reopen it. The filters survive — this is
    the JSON round-trip the `context` argument protects.
14. With `VITE_FEATURE_COMMENTS=false`: no badge, no toggle button, no filter chip, and the panel
    never appears.

## Open questions

None — see the decisions above.

## Done criteria

- [ ] The dashboard has a comments toggle that opens the camp-scoped panel.
- [ ] Camp-level and orphaned comments are visible, creatable and deletable from that panel. No
      standalone camp comments page was created.
- [ ] Desktop camp scope contains **no activity comments**; the badge navigates to the activity instead,
      and a hint line says how many comments are on activities — hidden when there are none.
- [ ] Mobile camp scope contains everything, and the badge opens the panel filtered to one activity
      **without navigating**, with the composer posting to that activity. The filter is cleared when
      the panel closes and on camp change.
- [ ] Every list is `createTime` ascending, in every scope and on both viewports — no ordering code in
      this phase, no grouping, no buckets. Cards carry a context label only where the list mixes
      contexts, plus always on an orphan.
- [ ] Posting a comment scrolls the list to the bottom, on desktop and on mobile, with the composer
      sticky.
- [ ] Dashboard rows show a comment count badge that opens and scrolls the panel when clicked.
- [ ] The count sits inside the speech-bubble icon, shared by the row badges and the toggle button,
      legible in the toggle's active (filled) state and present in its aria-label.
- [ ] The toggle's count equals the number of comments the panel shows in the current scope; the
      dashboard filter affects neither.
- [ ] No per-activity comment requests fire — the count comes from one camp-wide fetch.
- [ ] The "has comments" filter works on the dashboard and, with no extra code, on the picasso.
- [ ] The filter is absent from every print config, via the one-line `hide-comments-filter`.
- [ ] Derived data reaches the filter helper through the new `context` argument; nothing
      non-serializable was added to `filter`, and print configs still round-trip.
- [ ] The filter survives a reload and is shareable by URL; `filterAndQueryAreEqual` is fixed and
      finally has tests.
- [ ] Steps 3, 4 and 12 landed as separate commits, with the helper signature change first.
- [ ] No new backend endpoint, no migration, no snapshot regeneration.
- [ ] `FEATURE_COMMENTS = true` set on the `staging` and then `prod` GitHub Environments. `staging`
      carries production data, so treat enabling it there as the real go-live rehearsal and leave a
      gap before `prod`.
