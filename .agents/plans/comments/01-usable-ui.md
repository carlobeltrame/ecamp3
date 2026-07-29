# Phase 01 — Usable UI (roadmap steps 1, 2)

See [epic.md](epic.md) for the datamodel, the architecture rationale and the five decisions this
phase assumes are settled.

## Goal

A collaborator opens an activity, clicks a chat button, and gets a right-hand panel listing every
comment on that activity with author, avatar and timestamp. They can write a rich-text comment and
delete their own. On mobile the panel is a bottom sheet. Everything is translated, tested, and
gated on camp role. Then the feature toggle is switched on for staging.

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
| A count badge on the FAB                                  | see "Never block page render" below                  |
| An emoji picker                                           | never — native OS emoji input satisfies the MVP line |
| Turning the toggle on in production                       | after 02                                             |

## Backend changes

**One line.** No migration.

`GET /comments?camp=/camps/x` already works: the plain `GetCollection` plus the existing
`#[ApiFilter(SearchFilter::class, properties: ['camp', 'activity'])]`, scoped by
`CommentRepository::filterByUser`.

Per epic decision 2, drop `is_granted("CAMP_IS_PUBLIC", object)` from the item-level `Get` security
expression in `api/src/Entity/Comment.php`, and update the corresponding assertion in
`api/tests/Api/Comments/ReadCommentTest.php`. Do it now, before the feature is visible anywhere —
the item operation currently allows what `filterByUser` denies for collections, and every later
phase would otherwise have to answer "what does an anonymous user do here". Guests keep full access;
`CAMP_COLLABORATOR` includes the `guest` role. The epic records the read-only-public-camp use case
and the shapes it could take later.

This does not change any serialization group, so **no snapshot regeneration**.

## Frontend changes

### New files

**`frontend/src/components/comments/commentsState.js`** (~60 lines)

The only shared state. A module singleton, because the panel lives in `App.vue`, outside every
page's provide tree — provide/inject cannot reach it.

```js
export const commentsState = reactive({ open: false, scope: null })
export function setCommentScope({ camp, activity = null }) {}
export function clearCommentScope() {}
export function resetCommentsState() {} // tests only
```

`camp` and `activity` are hal-json-vuex entities, not IRIs, so `campRoleMixin` can consume `camp`
directly.

**`frontend/src/components/comments/CommentsPanel.vue`** (~110 lines)

Chrome only: the FAB, the drawer-versus-bottom-sheet choice, the title bar, the close button.
`mixins: [campRoleMixin]` with a `camp()` computed reading `commentsState.scope`. Renders
`<CommentsList>`. No props — it reads the singleton.

**`frontend/src/components/comments/CommentsList.vue`** (~90 lines)

Data and states: resolves the collection from the scope, loading skeletons, empty state, ordering,
the `v-for` of cards, and the composer. This is the main testable unit.
Props: `camp`, `activity` (nullable), `canWrite`. No events.

**`frontend/src/components/comments/CommentCard.vue`** (~90 lines)

Replaces `Comment.vue`. Avatar via the existing `components/user/UserAvatar.vue`, display name,
`$date(comment.createTime).format($t('global.datetime.dateTimeLong'))`, `<RichtextHtml>`, and
delete through the existing `components/prompt/PromptEntityDelete.vue`.
Props: `comment`, `active`. Emits: `activate`, `deleted`.

**`frontend/src/components/comments/CommentComposer.vue`** (~80 lines)

The new-comment editor, submit button, `saving` state and 422 surfacing.
**This is where today's bug is fixed** — see below. Clears after submit by bumping a `:key`.
Props: `camp`, `activity`. Emits: `created`.

**`frontend/src/components/generic/RichtextHtml.vue`** (~25 lines)

`v-html` of API-sanitised HTML plus tiptap-matching typography (lift the useful rules from
`Comment.vue:75-81`). Prop: `html`.

### Changed files

**`frontend/src/App.vue`** — four lines, between the `aside` router-view and `<v-main>`:

```html
<CommentsPanel v-if="featureComments" />
```

**`frontend/src/views/camp/activity/Activity.vue`** — net about −15 lines. Back to a bare
`<ScheduleEntry>`, plus an `immediate` watcher calling `setCommentScope` and `clearCommentScope` on
unmount. The `featureCommentsEnabled` computed moves to `App.vue`.

**`frontend/src/locales/en.json` and `de.json`** — roughly nine keys under `components.comments.*`,
mirroring the file tree convention. See the epic's Translations section: `en.json` is the Crowdin
source, `de.json` is hand-written alongside it by repo convention, and fr/it are fine to hand-write
if you know the Swiss scouting and J+S terminology. Reuse existing shared keys where they fit:
`global.button.delete`, `global.datetime.dateTimeLong`,
`components.prompt.promptEntityDelete.title`.

### Deleted files

`Comments.vue`, `CommentWrapper.vue`, `Comment.vue` — 265 lines.

### Details that are easy to get wrong

**The composer bug.** `Comments.vue:34-37` passes Vue-2 idioms to a Vue-3 component:

```html
<e-richtext :value="newComment" @input="onInput" />
```

`ERichtext` takes `modelValue` and emits `update:modelValue` (`components/form/base/ERichtext.vue:38`,
forwarded through `VTiptapEditor`). So `onInput` never fires, `newComment` stays `''`, and
`:disabled="newComment.length === 0"` is permanently true. Commit `162063690` fixed only the
read-only instance on line 13. Use `:model-value` / `@update:model-value`. **Cover this with a unit
test** — it is a silent regression class.

**Layout and `order`.** `NavTopbar` is a `v-app-bar` (default order 0);
`components/navigation/SideBar.vue:6` uses order `0` / `-1`. Give the comments drawer `:order="1"`
so the top bar keeps full width and the drawer sits under it. `NavBottombar` is
`v-bottom-navigation app` — never give the drawer `location="bottom"`, they fight over the same
Vuetify layout slot.

Breakpoints, following the house pattern at `views/camp/CampProgram.vue:79,117`
(`$vuetify.display.mdAndUp` inline versus `<v-bottom-sheet>`):

- wide (keep today's 1360px, but as a **named constant**, not the current inline literal — it is the
  only pixel literal in the repo): `permanent` drawer. At exactly that width the left
  `SideBarProgram` (256–350px) plus a 320px right drawer already leaves the activity card under
  750px, so do not lower it.
- tablet: `temporary` overlay drawer.
- `smAndDown`: `v-bottom-sheet` with an inner scroll container capped around 60vh and the composer
  pinned at the bottom. Not a route — that loses the page underneath and makes back-button
  semantics odd next to the FAB.

The FAB stays `v-fab app :order="1" location="right bottom"` inside `CommentsPanel`, so
`v-bottom-navigation` clears it automatically. Hide it when the drawer is permanent and open; the
drawer's own close button takes over.

**`v-html` justification.** There is currently zero `v-html` in the frontend, and mounting a full
ProseMirror instance per card — which is what `Comments.vue:11-20` does today — is absurd in a list.
Concentrate the single `v-html` in `RichtextHtml.vue` with
`eslint-disable-next-line vue/no-v-html` and a comment stating the invariant:

> `v-html` is only ever used for API fields annotated `#[InputFilter\CleanHTML]`, which
> HTMLPurifier sanitises server-side on write (`api/src/InputFilter/CleanHTMLFilter.php`, config
> `api/config/packages/exercise_html_purifier.yaml`).

Input-side purification at the API is the real trust boundary and HTMLPurifier's profile is a strict
allow-list — no `script`, no `on*`, no `javascript:` URIs. Client-side DOMPurify would be
defence-in-depth against a purifier misconfiguration, but it is a new dependency of roughly 20 kB;
skip it unless security review asks. Concentrating the render path in one component means there is
then exactly one file to change — and it is also where phase 04's `span[data-comment-id]` will need
to survive.

**Permissions.** `isContributor` gates the composer, matching the API's
`securityPostDenormalize: is_granted("CAMP_COLLABORATOR")` on POST. Guests and public-camp viewers
get a read-only list. Delete keeps the author check from `Comment.vue:48-53`, mirroring
`security: 'object.author === user'`. Note `campRoleMixin` requires a `camp` computed on the
component — supply it from `commentsState.scope`, not by injection (the page is unreachable from
`App.vue`).

**Never block page render.** The panel is a sibling of `<v-main>`, not an ancestor of the page, so
today's bug cannot recur. Loading state is skeletons _inside_ the panel:
`v-skeleton-loader type="list-item-two-line"` twice, the convention at `ScheduleEntry.vue:165,277`.
Additionally, only touch the collection once the panel has been opened for the first time —
hal-json-vuex fetches on property access, so an eager read would fire a request on every activity
view. **Consequence: no count badge on the FAB in this phase.** A badge forces the eager fetch back;
discovery is phase 02's job.

**Rich text.** `TiptapEditor.vue:184-201` already configures Bold, Italic, Underline, Strike,
BulletList, OrderedList, HardBreak, History, Placeholder and `AutoLinkDecoration.js` — that covers
the MVP list (link, list, bold, italic, strikethrough) with no change. Emoji: native OS input. There
is no emoji picker anywhere in `frontend/src` (twemoji is PDF-render-only); do not build one.

### Toggle (step 2)

Three lines, mirroring `FEATURE_CHECKLIST` exactly. Note that
`.helm/ecamp3/templates/frontend_configmap.yaml` currently does **not** emit `FEATURE_COMMENTS`, and
`getEnv()` short-circuits to `window.environment` when present — so the feature is already off on
every deployed environment, and on by default in dev.

Flip it on **staging** at the end of this phase, on **production** only after phase 02. With 01
alone a comment is invisible unless you happen to open that exact activity; the first production
week would generate "nobody replied to me" instead of usage.

## Files touched

```
frontend/src/components/comments/commentsState.js          new
frontend/src/components/comments/CommentsPanel.vue         new
frontend/src/components/comments/CommentsList.vue          new
frontend/src/components/comments/CommentCard.vue           new
frontend/src/components/comments/CommentComposer.vue       new
frontend/src/components/generic/RichtextHtml.vue           new
frontend/src/components/comments/__tests__/commentsState.spec.js      new
frontend/src/components/comments/__tests__/CommentsList.spec.js       new
frontend/src/components/comments/__tests__/CommentComposer.spec.js    new
frontend/src/App.vue                                       +4
frontend/src/views/camp/activity/Activity.vue              -15
frontend/src/locales/en.json, de.json                      +9 keys
api/src/Entity/Comment.php                                 -1 (CAMP_IS_PUBLIC on item Get)
api/tests/Api/Comments/ReadCommentTest.php                 modified
frontend/src/components/comments/Comments.vue              deleted
frontend/src/components/comments/CommentWrapper.vue        deleted
frontend/src/components/comments/Comment.vue               deleted

.helm/ecamp3/templates/frontend_configmap.yaml             +1
.helm/ecamp3/values.yaml.gotmpl                            +1
.helm/ecamp3/env.example.yaml                              +1
```

Net roughly +450 lines of source. (The reference fork's panel rewrite is about 1900 frontend lines
plus a schema migration.)

## Tests

```bash
docker compose exec frontend npm run test:unit
docker compose exec frontend npm run lint
docker compose exec api composer test tests/Api/Comments/ReadCommentTest.php
docker compose exec api composer cs-fix
docker compose run --rm prettier npm run lint:check   # for the .helm and root YAML changes
```

Unit tests, in `__tests__/` next to the code, using `/tests/setupVuetify.js` (**not** the stale
Vue-2 `src/test/renderWithVuetify.js`):

- `commentsState.spec.js` (~60 lines) — scope set/clear, `open` toggling, `resetCommentsState`.
- `CommentsList.spec.js` (~90) — loading skeletons, empty state, ordering, composer hidden for a
  guest/outsider, delete button only on own comments.
- `CommentComposer.spec.js` (~60) — **the model-value regression**: typing enables the submit
  button and the POST body carries the typed HTML.

No hal-json-vuex mocking factory exists; hand-roll plain objects with `_meta`, `items` and relation
functions. `api/__tests__/ApiWrapper.spec.js` is the closest existing example.
`tests/setup.js` already patches `document.elementFromPoint` for tiptap's Placeholder extension,
which the composer test needs.

**Snapshots:** none. No serialization group changes in this phase.

**e2e:** optional. If added, `e2e/tests/9-behavior-tests/comments.spec.ts` covering
create → see → delete.

## Verification

Dev environment, `VITE_FEATURE_COMMENTS` unset (defaults to `true`):

```bash
docker compose up -d
```

1. Open an activity as a camp member. The activity content renders **immediately** — before any
   comments request resolves.
2. Click the chat FAB. The drawer opens on the right; `v-main` narrows, the page does not grow or
   jitter.
3. Type a comment with bold text and a bullet list. The submit button enables as soon as you type.
   Submit. The comment appears with your avatar, display name and timestamp.
4. Reload. The comment is still there and renders as HTML, not escaped text.
5. Delete it via the hover delete button; confirm the prompt appears.
6. Narrow the window below `md`. The panel becomes a bottom sheet; the bottom navigation is not
   covered by the FAB.
7. Log in as a camp **guest**. The list is visible, the composer is not.
8. Log in as an unrelated user and open the same activity by URL. No comments, no composer.
9. Open a comment's item URL directly as an anonymous visitor to a **public** camp. It is now denied
   (this is the `CAMP_IS_PUBLIC` removal).
10. Set `VITE_FEATURE_COMMENTS=false` and reload. No FAB, no drawer, activity page unchanged.

## Open questions

- Should the drawer be resizable? _Default: no._ Add if users complain about 320px.
- Caching: `Comment` does not implement `CanGenerateTagsInterface`, so a new comment probably does
  not invalidate a cached `/comments?camp=…` response behind Varnish. Per the epic, comment caching
  is accepted future work — caching is added one endpoint at a time. Just confirm during this phase
  whether it bites in a deployed environment, and open a ticket if so. Do not fix it here.

## Done criteria

- [ ] A member can create, read and delete a comment on an activity, end to end, in dev.
- [ ] A guest can read but not write; an outsider sees nothing.
- [ ] The activity page renders before the comments request resolves.
- [ ] No comments request fires until the panel is opened for the first time.
- [ ] No hardcoded strings; keys added to `en.json` and `de.json`.
- [ ] `CAMP_IS_PUBLIC` removed from the item-level `Get`, with `ReadCommentTest` updated.
- [ ] `Comments.vue`, `CommentWrapper.vue` and `Comment.vue` are deleted.
- [ ] `npm run test:unit` and `npm run lint` pass in the `frontend` container.
- [ ] `FEATURE_COMMENTS` is emitted by the Helm configmap and enabled on staging only.
