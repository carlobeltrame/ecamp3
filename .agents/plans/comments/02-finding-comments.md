# Phase 02 — Finding comments (roadmap steps 3, 4, 12)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes discoverable without already knowing where it is. The dashboard shows which
activities have comments, clicking that badge opens the comments panel scrolled to them, and a
general toggle opens the same panel unfiltered — showing every comment in the camp, including
camp-level ones and the **orphans that activity deletion already produces today and that are
currently unreachable in the UI**. A filter narrows the dashboard to commented activities, and the
filtered view is shareable by URL so a coach can send the planning team a link straight to their
feedback.

Only after this ships is the toggle worth turning on in `staging` and `prod`.

## The panel is camp-scoped here — no separate view

Roadmap step 4 asked for "a place to display orphan comments or comments on the camp itself". That
place is **the phase 01 panel**, not a new page. Phase 01 derives its scope from the route:
`campFromRoute` always resolves on a camp route, `activityFromRoute` only on an activity route. So
the panel is already:

- **activity-scoped** on the activity page — filtered to that activity;
- **camp-scoped** on the dashboard and (later) the picasso — unfiltered, showing everything in the
  camp.

That falls out of phase 01's design at no cost, and it is strictly better than a standalone page:
one component, one set of behaviours, and camp-level comment creation and orphan handling come along
for free instead of being reimplemented. It also answers the question phase 02 previously left open
("should the camp page list all activity comments?") — yes, because that is simply what the
unfiltered panel is.

Consequences to build:

- The dashboard needs a **general toggle button** in its toolbar, not only the per-row badges.
- `CommentsList` needs **grouping** when `activity` is undefined: by activity in programme order,
  plus a bucket for camp-level comments (`activity === null && orphanDescription === null`) and one
  for orphans (`orphanDescription !== null`).
- Creating a comment from the camp-scoped panel omits `activity` — the backend already allows it
  (`activity` is nullable, only `camp` is required).
- Phase 04 extends the same structure: comments that kept their activity but lost their content-node
  anchor render inline, immediately above that activity's group, rather than in the orphan bucket.
  Design the grouping with that slot in mind; do not build it yet.

## Non-goals

| Not in this phase                                               | Phase that does it                        |
| --------------------------------------------------------------- | ----------------------------------------- |
| Unread state — the badge means "has comments", not "has unread" | 05 (step 8 supersedes this badge)         |
| Replies, resolve                                                | 03                                        |
| Re-anchoring, de-anchored comments shown inline                 | 04                                        |
| A picasso toggle button                                         | when the picasso work happens             |
| Cross-camp overview                                             | 06                                        |
| Any comments UI for external (public-camp) users                | never — gated on `isOutsider` in 01       |
| A "has comments" filter in the **print** configs                | never — deliberately omitted, see step 12 |
| A `commentCount` scalar or column on Activity                   | not built — see step 12                   |
| A standalone camp comments page                                 | never — see above                         |

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

## Ordering — first appearance in the visible programme

Comments group by activity; the activity **sections** are ordered by the start of the activity's
**first still-visible schedule entry**, and comments within a section by `createTime`.

**Do not sort by `scheduleEntry.number`.** Three reasons, in increasing severity:

1. `Activity` has no number at all — it is computed on `ScheduleEntry`
   (`api/src/Entity/ScheduleEntry.php:339-357`, not an ORM column, so it cannot be `ORDER BY`ed
   server-side either).
2. It does not sort as a string: the day part is unpadded decimal (`'10.1' < '2.1'`) and the
   suffix may be roman (`'ix' < 'v'`).
3. **It does not encode a total order at all.** `getScheduleEntryNumber()` counts only within the
   same `numberingStyle` (`ScheduleEntry.php:300-303`), so one day can legitimately contain `1.1`,
   `1.a` and `1.i` all meaning "first of its kind". Categories with style `-` get `''`.

**And do not write a comparator either** — none is needed, which is the good news. An activity has
many schedule entries and the dashboard shows all of them, so "the activity's position" is the
position of its first one. But the schedule-entry list is already in programme order: the API sorts
it (`Period.php:98-100`), the dashboard flattens periods in API order and `filteredScheduleEntries`
(`Dashboard.vue:234-238`) preserves that order, and `Object.values` over `keyBy(..., '_meta.self')`
is insertion-ordered because IRI keys are never integer-like.

So the ordering is just **index of first appearance** in that already-ordered list:

```js
// common/helpers/programOrder.js
// Given schedule entries already in programme order — optionally filtered — return a Map
// from activity IRI to its position, based on where the activity first appears.
export function activityProgramOrder(scheduleEntries) {
  const order = new Map()
  scheduleEntries.forEach((entry) => {
    const uri = entry.activity()._meta.self
    if (!order.has(uri)) order.set(uri, order.size)
  })
  return order
}
```

That is deliberately reusable beyond comments: the same Map orders **material items in programme
order** in the material overview, which has the same "reference an activity, show it in programme
sequence" problem. Keep it a pure function over a list so it has no idea what it is ordering for.

### The filter changes the order, so the panel must know about it

This is the subtle part. If the user filters out the first day, an activity whose first schedule entry
was on that day is now positioned by its _second_ entry — so activity sections can reorder, and an
activity whose every entry is filtered out should not appear in the panel at all. Passing an
unfiltered list would produce an order that silently disagrees with what the dashboard shows.

Therefore the panel needs the **same filter state and the same period scope** as the page behind it.
It gets both the way it already gets camp and activity — **from the route**:

- the dashboard and picasso filters are URL-persisted, so `processRouteQuery(this.$route.query)`
  (`frontend/src/helpers/querySyncHelper.js:104`) reconstructs the filter the user set;
- the picasso is period-scoped by its route path, and **`periodFromRoute` already exists**
  (`router.js:764-769`) — restrict to that period's schedule entries when the route has a `periodId`.

Then the panel computes its own `filteredScheduleEntries` with the existing
`filterMatchScheduleEntry`, feeds them to `activityProgramOrder`, and orders its groups. It already
holds every comment in the camp, so the `context.activitiesWithComments` Set the `hasComments` clause
needs costs nothing extra. hal-json-vuex caches the schedule entries the dashboard already fetched,
so this is recomputation, not refetching.

Two consequences worth being explicit about:

- **The panel respects the filter for content, not only for order.** If a coach filters the dashboard
  to one category, the panel shows that category's comments. Anything else makes the badge counts and
  the panel disagree. Camp-level and orphan comments have no schedule entry and are therefore never
  filtered out — they always show.
- Keeping this route-derived means no page pushes state into `commentsState`, so the interleaving
  problem phase 01 avoided stays avoided.

**Phase 01 needs none of this**: it is activity-scoped, so every comment shares one activity and the
order degenerates to `createTime`, which the API already returns.

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

Make the badge **clickable**: it opens the panel (`commentsState.open = true`) and scrolls that
activity's group into view, highlighting it briefly — reuse whatever `focusComment`-style scroll and
flash treatment phase 04 will formalise, or the plainest `scrollIntoView({ block: 'center' })` plus a
CSS flash for now. Do not navigate; the point is to read the feedback without leaving the overview.

**Keep the badge deliberately dumb.** It means "this activity has N comments". Step 8 changes the
semantics to "N unread", and anything cleverer built now gets rewritten then.

One forward-looking rule, decided in phase 03 so it is not re-argued: once resolve exists, the badge
counts **open threads only**, and disappears when every thread on an activity is resolved. Same for
the `hasComments` filter. That is the point of resolving — an addressed change request stops
demanding attention.

### Step 4 — camp-level and orphan comments

Covered by the camp-scoped panel above. Concretely, in `CommentsList.vue`:

- group by activity when `activity` is undefined, ordered by `activityProgramOrder`;
- a **camp comments** bucket and an **orphaned comments** bucket, the latter showing the deleted
  activity's title from `orphanDescription` and a delete action for the comment's own author;
- the composer creates camp-level comments when no activity group is targeted.

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
dashboard showing exactly the activities that need changes. It is also what lets the panel
reconstruct the filter from the route (see Ordering above).

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
2. **Step 4** — camp-scoped panel: `programOrder.js`, grouping, camp-level and orphan buckets,
   dashboard toggle button.
3. **Step 3** — camp-wide comment fetch, `CountBadge` on `ActivityRow`, click-to-open-and-scroll.
4. **Step 12** — the `hasComments` filter, plus the `querySyncHelper` work (booleans,
   `filterAndQueryAreEqual` + its missing tests), and making the panel filter-aware.

2 and 3 can swap; 1 must come before 4. Note the panel only becomes filter-aware in commit 4 — until
then it orders by the unfiltered programme, which is correct because there is no filter yet.

## Files touched

```
frontend/src/views/camp/Dashboard.vue                              modified
frontend/src/views/camp/CampProgram.vue                            modified  (step 12)
frontend/src/components/dashboard/ActivityRow.vue                  modified
frontend/src/components/comments/CommentsList.vue                  modified  (grouping)
frontend/src/components/comments/commentsState.js                  modified  (focus an activity group)
frontend/src/components/program/ScheduleEntryFilters.vue           modified  (step 12)
frontend/src/components/program/repairFilterConfig.js              modified  (step 12)
frontend/src/components/print/config/DialogScheduleEntryFilter.vue modified  (step 12)
frontend/src/helpers/querySyncHelper.js                            modified  (step 12)
frontend/src/helpers/__tests__/querySyncHelper.spec.js             +filterAndQueryAreEqual cases
common/helpers/filterMatchScheduleEntry.js                         modified  (context arg + clause)
common/helpers/__tests__/filterMatchScheduleEntry.spec.js           modified
common/helpers/programOrder.js                                     new       (activityProgramOrder)
common/helpers/__tests__/programOrder.spec.js                      new
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

- `programOrder.spec.js` — `activityProgramOrder`: an activity with several schedule entries takes the
  position of its first; **removing that first entry from the input list re-positions the activity by
  its next one** (the filter case, and the whole reason this is not a comparator); an activity whose
  every entry is absent does not appear in the Map at all; a duplicate activity is not double-counted.
- `CommentsList.spec.js` — camp scope groups by activity in programme order; camp-level and orphan
  buckets appear, are separated, and are **never** filtered out; activity scope still renders a flat
  list.
- `ActivityRow.spec.js` — badge appears with a count, absent at zero, skeleton while
  `loadingEndpoints.comments` is true, and clicking it opens the panel.
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

**`common/` is shared with `/print`.** Changing `filterMatchScheduleEntry.js` or adding a helper
there means running the `print` checks too.

## Verification

1. Create comments on two of the three activities in a camp, one camp-level comment, and delete an
   activity that has a comment (to produce an orphan).
2. Open the dashboard. Exactly the two commented activities carry a count badge with the right
   counts. Reload throttled and confirm the badge cell shows a skeleton, not a flash of zero.
3. Click the general comments toggle. The panel opens **unfiltered**: every camp comment, grouped by
   activity in programme order, plus the camp-level bucket and the orphan bucket (labelled with the
   deleted activity's title).
4. Add a camp-level comment from the panel. It lands in the camp bucket and on no activity.
5. Delete the orphan (as its author). It disappears.
6. Click an activity's count badge. The panel opens scrolled to that activity's group, briefly
   highlighted. You did **not** navigate away from the dashboard.
7. Click through to the activity page. The same panel now shows only that activity's comments.
8. Check a camp whose categories use different numbering styles, and one using style `-` (blank
   numbers). The panel's activity order matches the dashboard's row order exactly.
9. **Find an activity with schedule entries on two different days**, and comment on it. Filter the
   dashboard by category so that its _first_ entry is hidden but a later one is not. The panel's
   activity order still matches the dashboard's remaining row order — this is the reordering case
   `activityProgramOrder` exists for.
10. Filter so that **every** schedule entry of a commented activity is hidden. That activity's group
    disappears from the panel, while the camp-level and orphan buckets stay.
11. Toggle the "has comments" filter. Only the two rows remain and the filtered-count indicator
    updates. **Reload — the filter survives.** Copy the URL into a fresh browser profile logged in as
    another collaborator and confirm they see the same filtered view **and the same panel contents**.
12. Open the picasso with the same filter set. The commented entries stay normal, the rest are greyed
    out and undraggable. **This should require no picasso code.** Open the panel there and confirm it
    shows only the displayed period's activities.
13. Open the print configurator and any print config's filter dialog. There is **no** "has comments"
    chip. Generate a PDF with another filter set — output unchanged from before this phase.
14. Save a print config with filters, reload the page, and reopen it. The filters survive — this is
    the JSON round-trip the `context` argument protects.
15. With `VITE_FEATURE_COMMENTS=false`: no badge, no toggle button, no filter chip, and the panel
    never appears.

## Open questions

None — see the decisions above.

## Done criteria

- [ ] The dashboard has a comments toggle that opens the panel **unfiltered** for the whole camp.
- [ ] Camp-level and orphaned comments are visible, creatable and deletable from that panel. No
      standalone camp comments page was created.
- [ ] Activity sections are ordered by first appearance in the **visible** programme, so they match
      dashboard row order even when a filter hides an activity's first schedule entry, and even for
      categories with numbering style `-`. Not by the `number` string, and not by a comparator.
- [ ] The panel reconstructs the filter and the picasso's period from the route, so its contents and
      order never disagree with the page behind it. Camp-level and orphan comments are never filtered
      out.
- [ ] `activityProgramOrder` is a pure function over an ordered list, reusable for the material
      overview later.
- [ ] Dashboard rows show a comment count badge that opens and scrolls the panel when clicked.
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
