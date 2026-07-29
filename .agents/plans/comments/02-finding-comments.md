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

| Not in this phase                                                        | Phase that does it                                |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| Unread state — the badge means "has comments", not "has unread comments" | 05 (step 8 supersedes this badge)                 |
| Replies, resolve                                                         | 03                                                |
| Re-anchoring an orphaned comment to a new activity                       | 04                                                |
| Cross-camp overview (step 13)                                            | not planned — see the epic's scope calls          |
| A `commentCount` column on Activity                                      | never, until the camp-wide fetch measurably hurts |

## Backend changes

**None required.**

`GET /comments?camp=/camps/x` is served by the plain `GetCollection` plus the existing
`SearchFilter`, scoped by `CommentRepository::filterByUser` (author, or any camp you have a
`UserCamp` for). Orphans come back in the same response with `activity: null` and
`orphanDescription` set.

**Optional, decide in this phase:** flip `Camp::$comments` (`api/src/Entity/Camp.php:462`) from
`readable: false` to a subresource link mirroring `Activity::$comments` — a
`CAMP_SUBRESOURCE_URI_TEMPLATE` constant, `#[Groups(['read'])]`, and a `uriTemplate`. About eight
lines, giving a cleaner client (`camp.comments()` instead of a filtered collection) and a
`_links.comments` on every camp. Costs a regeneration of all three snapshot files.
_Default: skip it._ The query filter already works and phase 01's code path is camp-scoped anyway.

## Frontend changes

### Step 3 — dashboard indicator

**`frontend/src/views/camp/Dashboard.vue`** — load the camp's comments once in `mounted()` alongside
the existing batch loads, group by activity IRI, and pass the counts down. Add `comments` to the
existing `loadingEndpoints` object so every consumer keeps the established skeleton contract
(`categories`, `periods`, `campCollaborations`, `progressLabels` are already in there).

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
  title from `orphanDescription` and a delete action.

The camp-level composer creates a comment with `activity` omitted — the backend already allows this
(`activity` is nullable, only `camp` is required).

This is not really a feature request. Activity deletion has produced orphan rows since
`ActivityRemoveProcessor` shipped, and there is no way to read or delete them. That is a
data-loss-shaped bug, and the reason this phase should not slip behind 03.

### Step 12 — dashboard filter

Roughly 30 lines, since step 3 already loaded the data:

- one chip in `frontend/src/components/dashboard/BooleanFilter.vue` usage inside
  `ScheduleEntryFilters.vue`;
- one predicate in `common/locales`-adjacent `common/helpers/filterMatchScheduleEntry.js`.

Ship it in the same PR as step 3, or drop it. It is not worth its own review cycle.

## Files touched

```
frontend/src/views/camp/Dashboard.vue                              modified
frontend/src/components/dashboard/ActivityRow.vue                  modified
frontend/src/components/dashboard/ScheduleEntryFilters.vue         modified  (step 12)
common/helpers/filterMatchScheduleEntry.js                         modified  (step 12)
frontend/src/views/camp/comments/CampComments.vue                  new
frontend/src/views/camp/navigation/NavigationCamp.vue              modified  (nav entry)
frontend/src/router.js                                             modified
frontend/src/locales/en.json                                       +keys
frontend/src/views/camp/comments/__tests__/CampComments.spec.js    new

api/src/Entity/Camp.php                                            optional, see above
```

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
docker compose exec print npm run test        # only if common/helpers changed
```

- `ActivityRow.spec.js` — badge appears with a count, is absent at zero, shows a skeleton while
  `loadingEndpoints.comments` is true.
- `CampComments.spec.js` — camp comments and orphans are separated; an orphan renders its
  `orphanDescription`.
- Step 12: extend the existing filter helper tests in `common/`.

**Snapshots:** none, unless the optional `Camp::$comments` change is taken — then all three files
under `api/tests/Api/SnapshotTests/__snapshots__/` must be regenerated, and
`api/tests/Api/Camps/ReadCampTest.php` updated.

**Note on `common/`:** it is shared with `/print`. If `filterMatchScheduleEntry.js` changes, run the
`print` checks too.

## Verification

1. Create comments on two of the three activities in a camp (dev fixtures).
2. Open the dashboard. Exactly those two rows carry a count badge; the counts are right. Reload with
   a throttled connection and confirm the badge cell shows a skeleton, not a flash of zero.
3. Toggle the "has comments" filter chip. Only the two rows remain.
4. Open the camp comments page. It is empty. Add a camp-level comment from there; it appears, and
   does **not** appear on any activity.
5. Delete one of the commented activities. Its comment moves to the orphan section of the camp
   comments page, labelled with the deleted activity's title. It no longer appears on the dashboard.
6. Delete the orphan from that page.
7. With `VITE_FEATURE_COMMENTS=false`: no badge, no filter chip, no nav entry, and the camp comments
   route is not registered.

## Open questions

- Take the optional `Camp::$comments` link, or keep using the query filter? _Default: keep the
  filter_, to avoid the snapshot churn for no functional gain.
- Should the camp comments page also list _all_ activity comments as a per-camp overview?
  _Default: no._ That is a smaller version of step 13; wait until someone asks.
- Should the dashboard badge count resolved threads once phase 03 lands? _Default: no_ — count open
  threads only, decided in 03.

## Done criteria

- [ ] Dashboard rows show a comment count badge, following the existing skeleton conventions.
- [ ] The "has comments" filter chip works and persists like the other dashboard filters.
- [ ] A camp-level comment can be created, read and deleted with no activity reference.
- [ ] Orphaned comments produced by activity deletion are visible and deletable.
- [ ] No new backend endpoint, no migration, no snapshot regeneration (unless the optional change is
      taken deliberately).
- [ ] `FEATURE_COMMENTS` enabled in production.
