# Phase 02 — Finding comments (roadmap steps 3, 4, 12)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes discoverable without already knowing where it is. The dashboard shows which
activities have comments and lets you filter to them, and a camp-level page collects the comments
that belong to no activity — including the **orphans that activity deletion already produces
today and that are currently unreachable in the UI**. Only after this ships is the toggle worth
turning on in production.

All three steps read the same `GET /comments?camp=X` collection that phase 01 already fetches, which
is why they share a phase: splitting them means writing that fetch three times.

## Non-goals

| Not in this phase                                               | Phase that does it                        |
| --------------------------------------------------------------- | ----------------------------------------- |
| Unread state — the badge means "has comments", not "has unread" | 05 (step 8 supersedes this badge)         |
| Replies, resolve                                                | 03                                        |
| Re-anchoring an orphaned comment to a new activity              | 04                                        |
| Cross-camp overview                                             | 06                                        |
| A "has comments" filter in the **print** configs                | never — deliberately omitted, see step 12 |
| URL-persisting the new filter                                   | not built — see step 12                   |
| A `commentCount` scalar or column on Activity                   | not built — see step 12                   |

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

## Frontend changes

### Step 3 — dashboard indicator

**`frontend/src/views/camp/Dashboard.vue`** — load the camp's comments once in `mounted()` alongside
the existing batch loads, group by activity IRI into a `Set`/`Map`, and pass counts down. Add
`comments` to the existing `loadingEndpoints` object so every consumer keeps the established
skeleton contract (`categories`, `periods`, `campCollaborations`, `progressLabels` are already
there).

**`frontend/src/components/dashboard/ActivityRow.vue`** — render
`components/dashboard/CountBadge.vue` in the title cell, next to the `router-link`. Guard it the way
every other cell is guarded:

```html
<CountBadge v-if="!loadingEndpoints?.comments && commentCount" :count="commentCount" />
```

Clicking the row already navigates to the activity; phase 01's panel then shows the comments. Do not
add a second click target.

**Keep the badge deliberately dumb.** It means "this activity has N comments". Step 8 changes the
semantics to "N unread", and anything cleverer built now gets rewritten then.

### Step 4 — camp-level and orphan comments

A camp-level view modelled on `frontend/src/views/camp/checklistOverview/`:

- a route under `/camps/:campId/...`, added to `router.js` inside the existing
  `getEnv().FEATURE_COMMENTS ? [...] : []` spread-conditional pattern (see `router.js:24-36`);
- an entry in the camp navigation;
- two sections: **camp comments** (`activity === null && orphanDescription === null`) and
  **orphaned comments** (`orphanDescription !== null`), the latter showing the deleted activity's
  title from `orphanDescription` and a delete action for the comment's own author.

The camp-level composer creates a comment with `activity` omitted — the backend already allows this
(`activity` is nullable, only `camp` is required).

This is not really a feature request. Activity deletion has produced orphan rows since
`ActivityRemoveProcessor` shipped, and there is no way to read or delete them. That is a
data-loss-shaped bug, and the reason this phase should not slip behind 03.

### Step 12 — dashboard filter

The filter widget is shared, and that turns out to make this **cheaper**, not more expensive. Two
facts do the work:

1. `common/helpers/filterMatchScheduleEntry.js` is a pure `(scheduleEntry, filter) => bool` where
   **every clause is written "absent ⇒ pass"**. A `hasComments` key that never appears in a print
   config is `undefined` there and the new clause short-circuits. Of the **20 call sites** (4 in the
   app, 4 in print config previews, 8 in `frontend/src/pdf/campPrint/`, 8 in `print/components/`),
   **16 need zero changes**.
2. Print reaches the filter UI through exactly one wrapper,
   `frontend/src/components/print/config/DialogScheduleEntryFilter.vue`. **One `hide-comments-filter`
   prop on that single line is the entire print omission.**

The picasso comes free: `CampProgram.vue:97` passes `:filter-fn="filterMatchScheduleEntry"` into
`ScheduleEntries.vue`, which tags each entry with `filterMatch`, and `PicassoEntry.vue` greys out
non-matching entries. Nothing to add.

Note the component lives at `frontend/src/components/program/ScheduleEntryFilters.vue` — only the
leaf widgets (`BooleanFilter.vue`, `SelectFilter.vue`, `CountBadge.vue`) are under
`components/dashboard/`.

**Reference point:** commit `a78159439` "Add filter by date" was 261 insertions across 14 files —
but that is the _maximal_ case, because `day` had to be added _to_ print and needed grouping changes
in the PDF period components. Omitting print skips the bottom six files, roughly 170 lines.

**Estimated cost: ~55 lines across 10 files.**

| File                                                                 | ~Lines | What                                                                                                                            |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `common/helpers/filterMatchScheduleEntry.js`                         | +5     | new clause, same absent-⇒-pass shape                                                                                            |
| `common/helpers/__tests__/filterMatchScheduleEntry.spec.js`          | +6     | mock field + `it.each` rows                                                                                                     |
| `frontend/src/components/program/ScheduleEntryFilters.vue`           | +22    | `<BooleanFilter>` block, `hideCommentsFilter` prop, `modelValue` default, `resetFilter()`, `showOnlyMyActivities` getter+setter |
| `frontend/src/views/camp/Dashboard.vue`                              | +1     | `hasComments: false` in `data().filter`                                                                                         |
| `frontend/src/views/camp/CampProgram.vue`                            | +1     | same                                                                                                                            |
| `frontend/src/components/print/config/DialogScheduleEntryFilter.vue` | +1     | `hide-comments-filter` — the whole print omission                                                                               |
| `frontend/src/locales/en.json`, `de.json`                            | +2     | see the epic's Translations section                                                                                             |
| Dashboard + CampProgram data plumbing                                | +15    | see the obstacle below                                                                                                          |

**Deliberately not touched:** `repairFilterConfig.js` and its 460-line spec, `repairPrintConfig.js`
and its spec, all six `print/config/*Config.vue`, all eight `frontend/src/pdf/campPrint/**` and all
eight `print/components/**` — omitting the key keeps it `undefined` in print configs.
`frontend-old/` is never touched (see CLAUDE.md).

**The one real obstacle, and it is not in the filter plumbing.** `comments` is a **hyperlink, not a
scalar**, on the Activity payload (`Activity.php:182-193`, asserted by
`ReadActivityTest.php:67`). Every other filter dimension is already in memory; this one is not, and
`filterMatchScheduleEntry` is **synchronous**. So `scheduleEntry.activity().comments().items.length`
would fire one lazy GET per activity, inside a computed that re-runs on every filter keystroke — 200
requests in a 200-activity camp.

Use step 3's camp-wide prefetch: build a `Set` of activity IRIs that have comments, and pass it in.
The helper's signature is `(scheduleEntry, filter)`, so the `Set` has to ride inside the `filter`
object — which is also the object serialized into the URL and, for other filters, into print config
JSON. That is a smell; contain it by keeping the key out of both serialization paths (below). The
alternative — adding a `commentCount` scalar to the API — just moves the cost to the backend, where
`$this->comments->isEmpty()` on a lazy collection is one query per activity unless you add
`fetch: 'EXTRA_LAZY'` or denormalise a counter. **Not worth it at these volumes.**

**Do not URL-persist this filter.** `frontend/src/helpers/querySyncHelper.js` assumes HAL-URI
strings and arrays in five places: `urlParamKeys`, `URL_PARAM_TO_HAL_TYPE`,
`transformValuesToHalId` (which silently _drops_ a bare `true`), `transformQueryParam` and
`filterAndQueryAreEqual` (which would judge a `hasComments`-only change "equal" and never write it).
A partial change silently no-ops. The precedent is already set: **the existing `day` filter is
deliberately not URL-persisted** — it is absent from `urlParamKeys` and has no watcher. Follow it.
Persisting would add roughly 35 lines across `querySyncHelper.js`, its spec, two watchers, and
`e2e/tests/5-cross-browser-tests/persistDashboardFilter.spec.ts`. Revisit only if users ask.

Ship step 12 in the same PR as step 3 — it is meaningless without step 3's data.

## Files touched

```
frontend/src/views/camp/Dashboard.vue                              modified
frontend/src/views/camp/CampProgram.vue                            modified  (step 12)
frontend/src/components/dashboard/ActivityRow.vue                  modified
frontend/src/components/program/ScheduleEntryFilters.vue           modified  (step 12)
frontend/src/components/print/config/DialogScheduleEntryFilter.vue modified  (step 12, 1 line)
common/helpers/filterMatchScheduleEntry.js                         modified  (step 12)
common/helpers/__tests__/filterMatchScheduleEntry.spec.js          modified  (step 12)
frontend/src/views/camp/comments/CampComments.vue                  new
frontend/src/views/camp/navigation/NavigationCamp.vue              modified  (nav entry)
frontend/src/router.js                                             modified
frontend/src/locales/en.json, de.json                              +keys
frontend/src/views/camp/comments/__tests__/CampComments.spec.js    new
```

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
docker compose exec print npm run test        # common/helpers is shared with /print
```

- `ActivityRow.spec.js` — badge appears with a count, is absent at zero, shows a skeleton while
  `loadingEndpoints.comments` is true.
- `CampComments.spec.js` — camp comments and orphans are separated; an orphan renders its
  `orphanDescription`.
- `filterMatchScheduleEntry.spec.js` — the new clause passes when `hasComments` is absent
  (the print case), passes/fails correctly when set.

**Snapshots:** none. No serialization group changes in this phase.

**`common/` is shared with `/print`.** Changing `filterMatchScheduleEntry.js` means running the
`print` checks too, even though print does not use the new key.

## Verification

1. Create comments on two of the three activities in a camp (dev fixtures).
2. Open the dashboard. Exactly those two rows carry a count badge; the counts are right. Reload with
   a throttled connection and confirm the badge cell shows a skeleton, not a flash of zero.
3. Toggle the "has comments" filter chip. Only the two rows remain, and the filtered-count indicator
   updates.
4. Open the picasso with the same filter set. The two commented entries stay normal; the rest are
   greyed out and undraggable. **This should require no picasso code.**
5. Open the print configurator and any print config's filter dialog. There is **no** "has comments"
   chip.
6. Generate a PDF with a filter set. Output is unchanged from before this phase.
7. Reload the dashboard with the filter active. The filter resets (not URL-persisted) — expected,
   matching the `day` filter.
8. Open the camp comments page. Add a camp-level comment from there; it appears, and does **not**
   appear on any activity or on the dashboard badge.
9. Delete one of the commented activities. Its comment moves to the orphan section, labelled with
   the deleted activity's title, and disappears from the dashboard badge.
10. With `VITE_FEATURE_COMMENTS=false`: no badge, no filter chip, no nav entry, and the camp comments
    route is not registered.

## Open questions

- Should the camp comments page also list _all_ activity comments as a per-camp overview?
  _Default: no._ That is a camp-scoped version of phase 06; wait until someone asks.
- Does the dashboard badge count resolved threads once phase 03 lands? _Default: no_ — count open
  threads only. Decide in 03.
- Does the `Set`-inside-`filter` smell justify a small refactor of `filterMatchScheduleEntry`'s
  signature? _Default: no_ — 20 call sites, and the key is confined to two components.

## Done criteria

- [ ] Dashboard rows show a comment count badge, following the existing skeleton conventions.
- [ ] The "has comments" filter works on the dashboard and, with no extra code, on the picasso.
- [ ] The filter is absent from every print config, via the one-line `hide-comments-filter`.
- [ ] No per-activity comment requests fire — the count comes from one camp-wide fetch.
- [ ] A camp-level comment can be created, read and deleted with no activity reference.
- [ ] Orphaned comments produced by activity deletion are visible and deletable by their author.
- [ ] No new backend endpoint, no migration, no snapshot regeneration.
- [ ] `FEATURE_COMMENTS` enabled in production.
