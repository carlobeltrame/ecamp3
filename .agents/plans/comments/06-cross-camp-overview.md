# Phase 06 — Comment overviews: cross-camp and in-camp (roadmap step 13, vision J/K)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

People have already asked for this. It is numbered last in the roadmap but it is **the cheapest
phase in this epic** — one view, zero backend — so schedule it whenever it is convenient rather than
strictly after 04. It is not obsoleted by phase 05: push notifies you, an overview lets you go
looking.

## Goal

From outside any single camp, a user sees every comment addressed to them across all their camps —
so a J+S coach's change request on a camp you had not opened this week does not go unnoticed, and so
you can work through feedback in one pass instead of camp by camp.

### Also in-camp — vision points J and K

The vision discussion in #828 added two wants that the panel deliberately does not serve (see phase 02,
"What camp scope contains"), and that this list does:

- **J** — "to work through feedback/tasks, the user should see the whole list of comments of their
  responsibilities";
- **K** — "camp managers and J+S coaches need to be able to list all comments and to be able to filter
  by various criteria (resolved, period, detached)".

Both are the same list as the cross-camp one, narrowed to one camp. So build **one view with a camp
filter**, reachable two ways: the top-level route (all camps) and an in-camp route
(`/camps/:campId/:campShortTitle/comments`, camp filter preset and hidden), linked from the camp
navigation. Not a second component.

Filters, all client-side over the one fetch:

| filter                     | source                                                                                                        | available from  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| camp                       | `comment.camp()`                                                                                              | this phase      |
| not authored by me         | `comment.author()`                                                                                            | this phase      |
| on my responsibilities (J) | `activity.activityResponsibles` → `campCollaboration.user`, as the dashboard's "only my activities" does      | this phase      |
| period (K)                 | the activity has a schedule entry in that period; in-camp only                                                | this phase      |
| detached (K)               | orphaned (`orphanDescription`, or the epic's predicate once context snapshots land); from 04 also de-anchored | this phase / 04 |
| resolved (K)               | phase 03's `resolvedAt` on the thread root                                                                    | after 03        |

Three rules worth fixing now:

- **Camp-level comments and orphans have no period.** They pass the period filter only when it is empty;
  do not invent a period for them. (The core meeting allows a period anchor later; when it exists, it is
  the period those comments get.)
- **The in-camp route is a camp route, so the panel could open over it.** Do not put a
  `CommentsToggleButton` on that page: the list already is the comments, and two lists side by side is
  confusing. The panel's route-derived scope otherwise stays untouched.
- The context rule from the epic still holds: every row shows **what it is about** (activity, camp,
  or the detached description) and links to it, so the list is a to-do list that navigates, not a pile
  of fragments.

## Non-goals

| Not in this phase                               | Where                                     |
| ----------------------------------------------- | ----------------------------------------- |
| Unread state / read markers                     | 05 (step 8)                               |
| Notifications of any kind                       | 05                                        |
| Comments on camps you are not a collaborator of | never — `filterByUser` decides            |
| A second, per-camp component                    | not built — same view, camp filter preset |

## Backend changes

**None.**

`GET /comments` with no parameters is already exactly this endpoint.
`CommentRepository::filterByUser` (applied by `FilterByCurrentUserExtension`) restricts the
collection to `author = current_user OR camp IN (SELECT camp FROM view_user_camps WHERE user =
current_user)`. The `GetCollection` operation's security is `is_authenticated()`.

Two consequences worth knowing before building the UI:

- The response includes comments the user **authored**, even in camps they have since left. That is
  probably desirable here; confirm it reads sensibly.
- Once epic decision 2 lands (removing `CAMP_IS_PUBLIC` from the item `Get`), public-camp comments
  are consistently excluded — `filterByUser` already excluded them from collections.

Pagination is globally disabled, so this returns every comment across every camp the user belongs
to in one response. At the real volumes (tens per camp, at most around a hundred) that is fine.
Revisit only if someone with dozens of camps reports a slow page.

## Frontend changes

A single view, reachable from the top-level (non-camp) navigation, listing comments grouped by camp
and then by activity.

**`frontend/src/views/comments/CommentsOverview.vue`** (new) — fetch `api.get().comments()`, group
by `comment.camp()`, then by `comment.activity()` (with a bucket for camp-level and one for
orphans), and render each entry as a link into the activity, where phase 01's panel takes over.
Reuse `CommentCard.vue` as-is rather than building a second card — it already takes a `comment` prop
and gates its own delete control on authorship, which is the right behaviour here too.

Note this view is **not** a camp route, so `campFromRoute` yields nothing and the phase 01 drawer
never appears over it. That is intended: this is a standalone list, not the panel.

**It is therefore compatible with — and unaffected by — phase 01's camp-change reset.** Navigating here
makes `camp` undefined, which closes the panel and clears `commentsState`; nothing on this view reads
that module. This view keeps its own local state (grouping, filters, the "Open"/"All" choice), because
it is the one place that shows several camps at once and a singleton scoped to "the current camp" cannot
describe it.

Worth being precise about "several camps at once", since it is the one assumption the singleton rests
on: people genuinely do work across two camps — copying activities out of last year's camp is a normal
thing to do — but eCamp has no way to show two camps in one tab, and separate tabs get separate module
instances. This view is the first thing that spans camps, and it does so without the panel.

**`frontend/src/router.js`** — a top-level route beside the existing non-camp routes, added inside
the `getEnv().FEATURE_COMMENTS ? [...] : []` spread-conditional pattern (`router.js:24-36`).

**Navigation** — an entry in the top-level navigation, gated the same way.

Sorting: newest first is the useful default here, unlike the in-camp panel which reads
chronologically. Once phase 03 lands, hide resolved threads behind the same "Open" / "All" toggle.

Filtering worth having from the start, because the list is otherwise long: **by camp**, and **not
authored by me** (the "what do I need to respond to" view). Both are client-side over the single
fetch. Do not build a date filter until asked.

## Files touched

```
frontend/src/views/comments/CommentsOverview.vue                new
frontend/src/views/comments/__tests__/CommentsOverview.spec.js  new
frontend/src/router.js                                          modified
frontend/src/components/navigation/...                          modified (nav entry)
frontend/src/components/comments/CommentCard.vue                reused as-is (no change expected)
frontend/src/locales/en.json, de.json                           +keys
```

Estimate: about a day, roughly 200 lines including the test.

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
```

- `CommentsOverview.spec.js` — grouping by camp then activity; camp-level and orphan buckets appear;
  the "not authored by me" filter excludes own comments; empty state; loading skeletons.

**Snapshots:** none. No backend change.

## Verification

1. As a user who is a collaborator in two camps, comment in both, and have another user comment in
   one of them.
2. Open the overview. Both camps appear, grouped, with all three comments.
3. Apply "not authored by me". Only the other user's comment remains.
4. Click through. It lands on the activity, and the comments panel opens on the right thread.
5. Add a camp-level comment and delete an activity that has a comment. Both the camp-level bucket
   and the orphan bucket appear correctly.
6. Log in as a user with no camps. The overview shows the empty state, not an error.
7. With `VITE_FEATURE_COMMENTS=false`: the route is not registered and the nav entry is absent.

## Open questions

- Should the overview span **all** camps or only current and future ones? The roadmap says "all (or
  all future)". _Default: all_, with a client-side filter, because "future" needs period data this
  view does not otherwise load.
- Should comments the user authored be shown at all? _Default: yes_, but with the "not authored by
  me" filter available and possibly on by default.
- Once phase 05 exists, does this view become the natural landing page for a notification click?
  Likely yes — keep the route stable and deep-linkable.

## Done criteria

- [ ] A user sees comments from all their camps in one view, grouped by camp and activity.
- [ ] Camp-level and orphaned comments have their own buckets.
- [ ] "Not authored by me" filtering works client-side over a single fetch.
- [ ] Clicking a comment lands on the right activity with the panel open.
- [ ] The same view is reachable inside a camp, filtered to it, with period, detached, "on my
      responsibilities" and (after 03) resolved filters.
- [ ] No backend change, no migration, no snapshot regeneration.
