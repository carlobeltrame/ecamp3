# Phase 01 — Usable UI (roadmap steps 1, 2)

See [epic.md](epic.md) for the datamodel, the architecture rationale and the settled decisions this
phase assumes.

## Goal

Anyone with access to a camp — including guests — opens an activity, clicks a comments button in the
activity toolbar, and gets a right-hand panel listing every comment on that activity with author,
avatar and timestamp. They can write a rich-text comment and delete their own. The page stays
scrollable and interactive while the panel is open. On mobile the panel is a non-blocking bottom
sheet. Everything is translated and tested. Then the toggle is switched on for the `dev` deployment.

Today none of that works: the composer is permanently disabled, the whole activity page waits for
the comments request, and every string is hardcoded German.

## Non-goals

| Not in this phase                                         | Phase that does it                                   |
| --------------------------------------------------------- | ---------------------------------------------------- |
| Any way to discover comments without opening the activity | 02                                                   |
| Camp-level comments, orphan comments                      | 02                                                   |
| A cross-camp overview                                     | 06                                                   |
| Replies, resolve/unresolve                                | 03                                                   |
| Anchoring to text ranges, checkboxes, schedule entries    | 04                                                   |
| Editing a comment                                         | never — see epic decision 3                          |
| A count badge on the toggle button                        | see "Never block page render" below                  |
| An emoji picker                                           | never — native OS emoji input satisfies the MVP line |
| A resizable drawer                                        | not built — it must be **scrollable**, not resizable |
| Enabling the toggle on `staging` or `prod`                | after 02 — they stay off by default                  |

## Exactly one role gate: external users

There is **no per-control permission logic and no read-only mode**. Once the settled decisions are in
place, camp role makes no difference between collaborators:

- guests may write comments (and, from phase 03, resolve them — a J+S coach is sometimes only a
  guest but still needs to sign off that a change request was addressed);
- nobody, not even a manager, may delete or edit someone else's comment.

All of that is enforced server-side. Do not reimplement it in the client.

The single exception is the **external user** — someone who reaches a camp only through its public
flag. For them the comments feature is switched off entirely: no toggle button, no panel, no
collection fetch. Otherwise they would see an empty panel with a working-looking composer whose POST
would 403.

**Gate on `isOutsider`, not on `ScheduleEntry.vue`'s `disabled`.** That `disabled`
(`ScheduleEntry.vue:23`) is `layoutMode || !isContributor`, and `isContributor` is
`isMember || isManager` — it excludes **guests**, who must be able to comment. `isOutsider` from
`campRoleMixin` is the signal that actually means "external user".

`CommentsPanel` and `CommentsToggleButton` each mix in `campRoleMixin` with a `camp()` computed from
`campFromRoute` (see below). Self-contained: no prop plumbing from the page, no interleaving.

### `isOutsider` is currently broken — fix it first

`frontend/src/mixins/campRoleMixin.js:24-28`:

```js
isOutsider() {
  return this.camp && typeof this._campCollaborations === 'function' && !this._campRole
},
```

`_campCollaborations` is a **computed returning an array** (`:42-48`), so
`typeof this._campCollaborations` is `'object'` and **`isOutsider` is always `false`** — for every
consumer, today. It was presumably meant to mirror the guard on line 44, i.e.
`typeof this.camp.campCollaborations === 'function'`, meaning "the camp resource has loaded far
enough to have collaborations".

Two existing consumers rely on it and are therefore silently inert:
`ScheduleEntry.vue:119,123,146,149` (`v-if="!isOutsider"` around the duplicate/delete menu items —
they stay visible for outsiders, though `:disabled="!isContributor"` keeps them harmless) and
`views/camp/navigation/desktop/NavTopbar.vue` (`:camp="isOutsider ? null : camp"`).

Fix it in this phase, since comments now depend on it. It is one line plus a unit test, and the
behaviour change is in the intended direction — those two consumers start correctly hiding things
from outsiders. **Check both while verifying**, and mention the fix in the PR description so it is
not mistaken for an unrelated drive-by.

**Loading**: `_campRole` returns `null` while collaborations are still loading, which makes the fixed
`isOutsider` momentarily true. Do not treat that as "external" — the panel and button must render
nothing (or a skeleton) until collaborations have loaded, or every page load flashes the comments
button out of existence.

## Backend changes

**One line.** No migration.

`GET /comments?camp=/camps/x` already works: the plain `GetCollection` plus the existing
`#[ApiFilter(SearchFilter::class, properties: ['camp', 'activity'])]`, scoped by
`CommentRepository::filterByUser`.

Per epic decision 2, drop `is_granted("CAMP_IS_PUBLIC", object)` from the item-level `Get` security
expression in `api/src/Entity/Comment.php`, and update the corresponding assertion in
`api/tests/Api/Comments/ReadCommentTest.php`. Do it now, before the feature is visible anywhere —
the item operation currently allows what `filterByUser` denies for collections. Guests keep full
access; `CAMP_COLLABORATOR` includes the `guest` role. The epic records the read-only-public-camp
use case and the shapes it could take later.

This changes no serialization group, so **no snapshot regeneration**.

## Frontend changes

### Camp and activity come from the route, not from the pages

The obvious design — each page calls `setCommentScope` on mount and `clearCommentScope` on unmount —
**is broken**, and not subtly: on a route change the incoming page sets the scope and then the
outgoing page's unmount hook fires and clears it, leaving the panel empty on a page that should have
comments. Guarding the clear with a token would work, but there is a simpler answer.

**Derive it from the route, using the helpers `router.js` already has.** `campFromRoute(route)` is
exported at `router.js:757-762` and returns the **entity**, or `undefined` when the route has no
`campId`:

```js
export function campFromRoute(route) {
  if (!route.params.campId) {
    return undefined
  }
  return apiStore.get().camps({ id: route.params.campId })
}
```

`periodFromRoute`, `checklistFromRoute` and `materialListFromRoute` follow the same shape. There is
no `activityFromRoute` yet — the activity route passes a raw `activityId`
(`router.js:527-530`) — so **add one alongside the others**, same shape, same file. That is a useful
helper on its own, not comments-specific.

The panel then imports both and computes them directly. No scope object, no ids, no new abstraction:

```js
import { campFromRoute, activityFromRoute } from '@/router.js'
// ...
computed: {
  camp() { return campFromRoute(this.$route) },       // campRoleMixin consumes this
  activity() { return activityFromRoute(this.$route) },
}
```

It cannot be route-injected as props — the panel lives in `App.vue`, not in a named `router-view` —
but importing the helper is exactly equivalent and is what every `props:` callback in `router.js`
already does.

Consequences, all good:

- No interleaving is possible — there is exactly one writer, and it is the route itself.
- `Activity.vue` goes back to a bare `<ScheduleEntry>` with **zero** comment code.
- Entities, not ids, so `campRoleMixin` and the collection query consume them directly.
- Adding the picasso or the camp page later needs no code at all: they already have `campId`, so
  `campFromRoute` resolves and the panel works. They only need a toggle button.
- `commentsState` shrinks to nothing but `{ open: false }`.
- Nothing extra is exported for testing — `router.js` already exports these, and existing specs
  already `vi.mock('@/router.js', …)`.

The panel renders whenever `camp` is defined and `commentsState.open` is true. It is deliberately not
restricted to an allow-list of route names: any camp route can host it, which is what makes phase 02
and the picasso free.

### New files

**`frontend/src/components/comments/commentsState.js`** (~15 lines)

The module singleton and the home for all comments UI state. Provide/inject cannot reach the panel —
it lives in `App.vue`, outside every page's provide tree — and Vuex is the wrong tool for a drawer's
open state. In this phase it holds one boolean, because everything else comes from the route; phase
04 grows it with the anchor registry.

```js
export const commentsState = reactive({ open: false })
```

**`frontend/src/components/comments/CommentsPanel.vue`** (~130 lines)

Layout and controls only: the drawer-versus-bottom-sheet choice, the title bar and the close button.
`camp()` / `activity()` computed from `campFromRoute` / `activityFromRoute`, and
`mixins: [campRoleMixin]` consuming that same `camp()`. Renders nothing when the route has no camp,
when the user `isOutsider`, or while collaborations are still loading. No props — the route and the
singleton are its only inputs.

**`frontend/src/components/comments/CommentsToggleButton.vue`** (~35 lines)

The button a page drops into its own toolbar. One line per page, so the picasso and camp pages cost
nothing later. Copy the shape of `components/activity/TogglePaperSize.vue` — tooltip, `variant="text"
icon`, `aria-label`. Same `campRoleMixin` gate as the panel, so the two can never disagree. Renders
nothing when `FEATURE_COMMENTS` is off.

**`frontend/src/components/comments/CommentsList.vue`** (~90 lines)

Data and states: fetches the collection for the given camp, filters to the activity, loading
skeletons, empty state, ordering, the `v-for` of cards, and the composer. The main testable unit.
Props: `camp`, `activity` (nullable) — entities, passed down by the panel. No events.

**`frontend/src/components/comments/CommentCard.vue`** (~90 lines)

Replaces `Comment.vue`. Avatar via `components/user/UserAvatar.vue`, display name,
`$date(comment.createTime).format($t('global.datetime.dateTimeLong'))`, the read-only editor
described below, and delete through the existing `components/prompt/PromptEntityDelete.vue`.
Props: `comment`, `active`. Emits: `activate`, `deleted`.

**`frontend/src/components/comments/CommentComposer.vue`** (~80 lines)

The new-comment editor, submit button, `saving` state and error surfacing. Clears after submit by
bumping a `:key`. Props: `camp`, `activity`. Emits: `created`.

### Changed files

**`frontend/src/App.vue`** — four lines, between the `aside` router-view and `<v-main>`:

```html
<CommentsPanel v-if="featureComments" />
```

**`frontend/src/components/activity/ScheduleEntry.vue`** — add `<CommentsToggleButton />` to the
existing `#title-actions` slot next to `<TogglePaperSize>` (`ScheduleEntry.vue:106`), and a matching
`v-list-item` inside the existing `mdi-dots-vertical` overflow menu (`ScheduleEntry.vue:108-161`) for
mobile. That desktop-button-plus-menu-item pairing is the established pattern —
`views/camp/CampProgram.vue:14-38,62-70` does exactly this for its filter toggle.

**`frontend/src/views/camp/activity/Activity.vue`** — net about −25 lines. Back to a bare
`<ScheduleEntry>`. The `featureCommentsEnabled` computed moves to `App.vue`.

**`frontend/src/mixins/campRoleMixin.js`** — one-line `isOutsider` fix, see above.

**`frontend/src/components/form/tiptap/TiptapEditor.vue`** — two small upstream fixes, see below.

**`frontend/src/locales/en.json` and `de.json`** — roughly nine keys under `components.comments.*`,
mirroring the file tree convention. See the epic's Translations section. Reuse existing shared keys
where they fit: `global.button.delete`, `global.datetime.dateTimeLong`,
`components.prompt.promptEntityDelete.title`.

### Deleted files

`Comments.vue`, `CommentWrapper.vue`, `Comment.vue` — 265 lines.

### Rendering comment text: a read-only tiptap editor, never `v-html`

**No `v-html`.** There is zero `v-html` in the frontend today and this phase does not introduce it,
regardless of the API sanitising `textHtml` server-side. The rich text already contains
non-standard-HTML decorations (autolinking via `AutoLinkDecoration.js`) and will contain more later —
user mentions, comment anchors — all of which need an editor to render at all. Use the same component
in both modes, exactly as the story overview page already does
(`components/story/StoryDay.vue:42-54`, `:readonly="!editMode"` + `variant="plain"`).

Use `TiptapEditor` **directly**, not `ERichtext`/`ApiRichtext`:

```vue
<TiptapEditor
  :key="comment._meta.self"
  :model-value="comment.textHtml"
  :with-extensions="true"
  :editable="false"
/>
```

- `:with-extensions="true"` is **mandatory** — with it false, `TiptapEditor.vue:184-201` loads only
  Document/Paragraph/Text/Placeholder, and bold, italic, underline, strike, lists, hard breaks and
  autolinks are silently stripped from the rendered output.
- Going direct skips a `VField` (chrome, outline, loader) and a vee-validate `ValidationField` per
  card, which `ERichtext` would mount for nothing in read-only mode. Nothing to un-style: no outline,
  no label, no underline, no min-height — only a 6px `padding-top` on `div.editor`
  (`TiptapEditor.vue:335`).
- Autolinks work read-only and are actually **better** there: `AutoLinkDecoration.js:45-47` omits the
  ctrl-click `onclick` handler when not editable, so a plain single click opens the link natively.
- Drop `variant`, `density`, `solo`, `auto-grow`, `label`, `hide-details` — all inert on this
  component. The `.v-input__slot` / `.v-text-field` CSS in today's `Comments.vue:106-118` is Vuetify-2
  leftover and matches nothing in Vuetify 3.

**Two upstream fixes to `TiptapEditor.vue`, both tiny, both needed once editors appear in a list.**
These are the "resolve them correctly" the reference fork's ProseMirror troubles call for:

1. **`editor.destroy()` is never called.** `beforeUnmount` (`TiptapEditor.vue:295-299`) removes the
   three document listeners but leaks the ProseMirror `EditorView` and its plugin state on every
   unmount. Harmless when there is one editor per field; a real leak in a list whose cards come and
   go. One line.
2. **The bubble menu mounts even when not editable.** It is `v-if="withExtensions"`
   (`TiptapEditor.vue:10`), not gated on `editable`; only `shouldShow` returns false
   (`:257`). So every read-only card creates a `BubbleMenu` and a floating-ui instance for nothing.
   Add `&& editable` to the `v-if`.

Also budget for the remaining known cost: **three `document`-level listeners per instance**
(`TiptapEditor.vue:290-293`) driving the ctrl-hover link cursor, each doing a reactive write on every
keystroke. With a realistic panel of a few dozen comments that is acceptable; if a camp with a
hundred comments in one activity ever shows up, the fix is to gate those listeners on `editable` too.
Do not pre-optimise with virtual scrolling.

### The composer

Today's composer is permanently disabled because `Comments.vue:34-37` passes Vue-2 idioms to a Vue-3
component:

```html
<e-richtext :value="newComment" @input="onInput" />
```

`ERichtext` takes `modelValue` and emits `update:modelValue`
(`components/form/base/ERichtext.vue:38`, forwarded through `VTiptapEditor`), so `onInput` never
fires. Commit `162063690` fixed only the read-only instance on line 13. The rewrite uses
`:model-value` / `@update:model-value`. No dedicated regression test for this — it disappears with
the file.

The composer keeps `ERichtext` (editable mode wants the toolbar and validation); only the read-only
cards go direct to `TiptapEditor`.

### Drawer behaviour — pushes content, never blocks

The page must stay interactive and scrollable while the panel is open. Later phases depend on it:
you read the commented content while writing about it.

```vue
<v-navigation-drawer
  v-model="commentsState.open"
  location="right"
  width="320"
  :mobile="false"
  :order="2"
/>
```

- **No `temporary`.** `temporary` adds a scrim, traps focus and blocks page scroll. Today's
  `CommentWrapper.vue:14-30` passes `permanent` **and** `temporary` together; `temporary` wins, which
  is exactly the bug being removed.
- **No `permanent`** either — the panel must be dismissible.
- **`:mobile="false"` is load-bearing.** Vuetify 3.12.10 silently downgrades a drawer to
  temporary-plus-scrim below `mobileBreakpoint` unless you say otherwise.
- Drop `app`, `clipped` and `floating` — Vuetify-2 leftovers, no-ops in v3.
- `:order="2"` keeps it after the app bar (order 0) and the `aside` `SideBar` (order 0 / −1). See
  `components/navigation/SideBar.vue:2-15`.
- **Scrollable, not resizable**: the drawer content is a flex column with the composer pinned at the
  bottom and the card list in its own `overflow-y: auto` region. A drawer that cannot scroll is
  useless after five comments.

A drawer that pushes `v-main` also makes the old `width > 1360` flex-column branch unnecessary —
Vuetify handles the layout offset, with no measuring, which is why the fork's grow-every-frame loop
cannot happen here.

**Mobile (`smAndDown`).** A 320px drawer on a 360px viewport is a full-screen overlay whatever you do,
and `v-bottom-sheet` is a `v-dialog` variant that blocks scroll and traps focus by default — nothing
in the repo currently overrides that. Use a bottom sheet capped at ~60vh with the blocking turned
off:

```vue
<v-bottom-sheet v-model="commentsState.open" :scrim="false" scroll-strategy="none" :retain-focus="false">
```

The top ~40% of the page stays visible, scrollable and tappable. **Verify these three props behave as
intended in 3.12.10 — this is the one part of the plan with no in-repo precedent.** If they do not, the
fallback is a full-width right drawer with `:mobile="false"`, accepting that a phone cannot show both
at once.

### Never block page render

The panel is a sibling of `<v-main>`, not an ancestor of the page, so today's
`v-if="!comments._meta.loading"` bug cannot recur. Loading state is skeletons _inside_ the panel:
`v-skeleton-loader type="list-item-two-line"` twice, the convention at `ScheduleEntry.vue:165,277`.

Only touch the collection once the panel has been opened for the first time — hal-json-vuex fetches
on property access, so an eager read would fire a request on every activity view. **Consequence: no
count badge on the toggle button in this phase.** A badge forces the eager fetch back; discovery is
phase 02's job.

## Toggle rollout (step 2)

The Helm configmap does not emit `FEATURE_COMMENTS` at all today, and `getEnv()` short-circuits to
`window.environment` when present — so comments are currently off in all four deployed environments
and on by default in local dev.

**Mirror `FEATURE_CHECKLIST` exactly**, including the `| default false` on both hops. Opt-in per
environment, consistent with the two existing toggles, and safe: Helm's `default` treats `false` as
empty, so `| default false` is a no-op on a real `false` while `| default true` would silently flip it
back on and make the toggle impossible to switch off.

```yaml
# .helm/ecamp3/values.yaml.gotmpl, after line 25
  comments: {{ .Environment.Values | getOrNil "FEATURE_COMMENTS" | default false }}

# .helm/ecamp3/templates/frontend_configmap.yaml, after line 33
      FEATURE_COMMENTS: {{ .Values.featureToggle.comments | default false }},

# .helm/ecamp3/env.example.yaml — local-deploy sample only
  "FEATURE_COMMENTS": true,
```

### Per-environment settings

Per-environment values are **GitHub Environment variables**, not files —
`.helm/ecamp3/env.yaml` is gitignored and assembled in CI from `toJSON(secrets) + toJSON(vars)` for
the environment named by the deploy job
(`.github/workflows/reusable-ecamp3-deployment.yml:35-37,78-102`).

- **`dev`** (deploys `devel`, `.github/workflows/deployment-devel.yml:36-39`): set
  `FEATURE_COMMENTS = true`. Check the current state first with
  `gh api repos/ecamp/ecamp3/environments/dev/variables`.
- **Feature-branch / PR review apps**: covered by the separate variable set that applies to all new
  review-app deployments — no per-PR action, and nothing to do in this plan.
- **`staging`** and **`prod`**: nothing to do. The `| default false` chain leaves them off until
  phase 02.

Local development needs nothing: `VITE_FEATURE_COMMENTS` is unset and `environment.js:25` already
defaults it to `true`.

## Files touched

```
frontend/src/components/comments/commentsState.js               new
frontend/src/components/comments/CommentsPanel.vue              new
frontend/src/components/comments/CommentsToggleButton.vue       new
frontend/src/components/comments/CommentsList.vue               new
frontend/src/components/comments/CommentCard.vue                new
frontend/src/components/comments/CommentComposer.vue            new
frontend/src/components/comments/__tests__/CommentsPanel.spec.js    new
frontend/src/components/comments/__tests__/CommentsList.spec.js     new
frontend/src/App.vue                                            +4
frontend/src/router.js                                          +7 (activityFromRoute)
frontend/src/components/activity/ScheduleEntry.vue              +12
frontend/src/mixins/campRoleMixin.js                            +1 (isOutsider fix)
frontend/src/mixins/__tests__/campRoleMixin.spec.js             new
frontend/src/components/form/tiptap/TiptapEditor.vue            +2 (destroy, bubble-menu gate)
frontend/src/views/camp/activity/Activity.vue                   -25
frontend/src/locales/en.json, de.json                           +9 keys
frontend/src/components/comments/Comments.vue                   deleted
frontend/src/components/comments/CommentWrapper.vue             deleted
frontend/src/components/comments/Comment.vue                    deleted

e2e/tests/9-behavior-tests/comments.spec.ts                     new

api/src/Entity/Comment.php                                      -1 (CAMP_IS_PUBLIC on item Get)
api/tests/Api/Comments/ReadCommentTest.php                      modified

.helm/ecamp3/templates/frontend_configmap.yaml                  +1
.helm/ecamp3/values.yaml.gotmpl                                 +1
.helm/ecamp3/env.example.yaml                                   +1
```

Net roughly +450 lines of source. (The reference fork's panel rewrite is about 1900 frontend lines
plus a schema migration.)

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
docker compose exec api composer test tests/Api/Comments/ReadCommentTest.php
docker compose exec api composer cs-fix
docker compose run --rm prettier npm run lint:check   # .helm and root YAML
```

Unit tests, in `__tests__/` next to the code, using `/tests/setupVuetify.js` (**not** the stale
Vue-2 `src/test/renderWithVuetify.js` — see the epic's Known gaps for the cleanup ticket):

- `router.spec.js` (or the existing router spec, if there is one) — **`activityFromRoute`**: returns
  the entity for a route carrying `activityId`, `undefined` when the param is absent, and does not
  throw on a malformed one. Mirror whatever `campFromRoute` is tested with; if it has no test today,
  add one for both while you are there.
- `CommentsPanel.spec.js` — the route wiring: with `vi.mock('@/router.js', …)` returning a camp and
  an activity the panel renders; with no camp it renders nothing; with `isOutsider` it renders
  nothing; while collaborations load it renders nothing rather than flashing.

`commentsState.js` holds one boolean in this phase and needs no test of its own. It is still the home
for all comments UI state — phase 04 grows it with the anchor registry.

- `CommentsList.spec.js` — loading skeletons, empty state, ordering, delete button present only on
  own comments and absent on others'.
- `campRoleMixin.spec.js` — **the `isOutsider` fix**: true for a user with no collaboration in a
  loaded camp, false for guest/member/manager, and **false (not true) while collaborations are still
  loading**. This is a shared mixin with two other consumers, so it deserves the test regardless of
  comments.

No hal-json-vuex mocking factory exists; hand-roll plain objects with `_meta`, `items` and relation
functions. `api/__tests__/ApiWrapper.spec.js` is the closest existing example. `tests/setup.js`
already patches `document.elementFromPoint` for tiptap's Placeholder extension, which any test
mounting an editor needs.

**e2e — required, not optional.** `e2e/tests/9-behavior-tests/comments.spec.ts`: open an activity,
open the panel, write a comment, see it, reload, delete it. This is the only test that exercises the
real drawer against real Vuetify layout, which is where this phase's risk actually is.

**Snapshots:** none. No serialization group changes.

## Verification

Dev environment, `VITE_FEATURE_COMMENTS` unset (defaults to `true`):

```bash
docker compose up -d
```

1. Open an activity as a camp member. The content renders **immediately** — before any comments
   request resolves. Confirm in the network tab that no `/comments` request fired at all.
2. Click the comments button in the activity toolbar. The drawer opens on the right and `v-main`
   narrows. The page does not grow or jitter.
3. **With the drawer open**: scroll the activity, click into a content node, select text. Everything
   still works — there is no scrim.
4. Type a comment with bold text, a bullet list and a bare URL. The submit button enables as soon as
   you type. Submit. The comment appears with your avatar, display name and timestamp, the URL is an
   autolink, and a single click on it opens a new tab.
5. Add fifteen comments. The card list scrolls inside the drawer; the composer stays pinned at the
   bottom; the page behind still scrolls independently.
6. Reload. Everything is still there and renders as rich text, not escaped markup.
7. Delete your own comment via its delete button; confirm the prompt appears.
8. Log in as a camp **guest**. You can read the list **and write a comment** — no read-only mode.
9. As a different member, confirm there is no delete control on somebody else's comment.
10. Narrow the window below `md`. The toggle moves into the overflow menu; the panel becomes a bottom
    sheet at ~60vh; **the page above it still scrolls**; the bottom navigation is still reachable.
11. Log in as an unrelated user and open a **public** camp's activity by URL. **No comments button,
    no panel, and no `/comments` request at all** — this is the `isOutsider` gate. Watch the initial
    load closely: the button must not appear and then vanish while collaborations resolve.
12. Still as that user, check the two other `isOutsider` consumers now behave: the duplicate/delete
    items in the activity overflow menu (`ScheduleEntry.vue:119-149`) are hidden rather than merely
    disabled, and `NavTopbar` passes no camp to `UserMeta`.
13. Open a comment's item URL directly as an anonymous visitor to a **public** camp. Denied (the
    `CAMP_IS_PUBLIC` removal).
14. Navigate activity → dashboard → a different activity, quickly. The panel always shows the right
    activity's comments and never goes blank — this is the interleaving bug that deriving camp and
    activity from the route prevents.
15. Set `VITE_FEATURE_COMMENTS=false` and reload. No toggle button, no drawer, activity page
    unchanged.
16. Render the Helm chart with `"FEATURE_COMMENTS": true` in a local `.helm/ecamp3/env.yaml`
    (`./.helm/ecamp3/deploy.sh diff`) and confirm the configmap emits `FEATURE_COMMENTS: true,`; remove
    the key and confirm it emits `false`.

## Open questions

- Do `:scrim="false"` / `scroll-strategy="none"` / `:retain-focus="false"` behave as intended on
  `v-bottom-sheet` in Vuetify 3.12.10? No in-repo precedent — verify early. Fallback: a full-width
  right drawer on mobile.
- Caching: `Comment` does not implement `CanGenerateTagsInterface`, so a new comment probably does
  not invalidate a cached `/comments?camp=…` response behind Varnish. Per the epic this is accepted
  future work. Confirm during this phase whether it bites on `dev`, and open a ticket if so. Do not
  fix it here.

## Done criteria

- [ ] A member **and a guest** can each create, read and delete their own comment on an activity, end
      to end, in dev.
- [ ] No delete control appears on another person's comment.
- [ ] An external user of a public camp gets no toggle button, no panel and no `/comments` request,
      with no flash of the button during load.
- [ ] `campRoleMixin.isOutsider` is fixed and unit-tested, and its two other consumers were checked.
- [ ] The activity page renders before the comments request resolves, and no request fires until the
      panel is first opened.
- [ ] The page stays scrollable and interactive with the panel open, on desktop and mobile.
- [ ] The drawer content scrolls; the composer stays reachable with many comments.
- [ ] Comment text renders through a read-only `TiptapEditor`; **no `v-html` anywhere**.
- [ ] `TiptapEditor` calls `editor.destroy()` on unmount and does not mount a bubble menu when not
      editable.
- [ ] Rapid route changes never leave the panel showing the wrong activity or nothing.
- [ ] The panel gets its camp and activity from `campFromRoute` / `activityFromRoute` in `router.js`
      — entities, not ids — with `activityFromRoute` added there and unit-tested. No comments-specific
      route abstraction and no test-only export.
- [ ] The e2e spec passes.
- [ ] No hardcoded strings; keys added to `en.json` and `de.json`.
- [ ] `CAMP_IS_PUBLIC` removed from the item-level `Get`, with `ReadCommentTest` updated.
- [ ] `Comments.vue`, `CommentWrapper.vue` and `Comment.vue` are deleted.
- [ ] `FEATURE_COMMENTS` is emitted by the Helm configmap, wired exactly like `FEATURE_CHECKLIST`
      (`| default false` on both hops), and set to `true` on the **`dev`** GitHub Environment.
      `staging` and `prod` stay off by default.
