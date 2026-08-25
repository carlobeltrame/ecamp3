# Phase 03 — Conversations (roadmap steps 5, 6)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes a conversation. Anyone in the camp can reply to a comment, and any collaborator
can mark a thread resolved — which takes it out of the default view, so the panel stops growing
forever. Resolved threads stay fully readable under an "All" toggle and can be reopened.

Resolve is not a nicety here. Because nobody may delete or edit anybody else's comment
(see the epic's "Who this is for"), resolving is the **only** way an addressed J+S condition or
change request stops cluttering the panel. That is why step 6 ships with step 5 rather than later.

Steps 5 and 6 ship together because they touch the same table, the same serialization groups and the
same panel code. Apart, that is two migrations, two snapshot regenerations and two reworks of
`CommentsList.vue`.

## Non-goals

| Not in this phase                                  | Phase that does it                                 |
| -------------------------------------------------- | -------------------------------------------------- |
| Editing a comment's text                           | never — epic decision 3                            |
| Nested replies (reply to a reply)                  | never — threads are flat, see the validation below |
| Anchoring a thread to a text range or content node | 04                                                 |
| Notifying anyone that they got a reply             | 05                                                 |
| Per-user read state on a thread                    | 05                                                 |

## Backend changes

This phase adds **the first `Patch` operation this entity has ever had**. `Comment` currently
exposes only `read` and `create` serialization groups, and `UpdateCommentTest` asserts 405.

### Threading (step 5)

Every new property gets a docblock in the house style — a short summary of what it is for, in full
sentences. API Platform reads them and emits them as `description` in the OpenAPI spec, so they show up
in the snapshot; `Comment::$orphanDescription`'s docblock is in there verbatim three times today. Write
them with the code, not after regenerating snapshots twice.

```php
/**
 * The comment this one replies to, or null if it starts a thread.
 * Threads are flat: a reply always points at the root comment of its thread.
 */
#[AssertBelongsToSameCamp]
#[AssertBelongsToSameActivity]
#[Assert\Expression('value === null or value.parent === null', 'Cannot reply to a reply.')]
#[ApiProperty(example: '/comments/1a2b3c4d')]
#[Groups(['read', 'create'])]
#[ORM\ManyToOne(targetEntity: self::class, inversedBy: 'children')]
#[ORM\JoinColumn(nullable: true)]
public ?Comment $parent = null;

/**
 * The replies to this comment, oldest first. Always empty on a reply.
 *
 * @var Collection<int, Comment>
 */
#[ApiProperty(writable: false, example: '["/comments/1a2b3c4d"]')]
#[Groups(['read'])]
#[ORM\OneToMany(targetEntity: self::class, mappedBy: 'parent')]
#[ORM\OrderBy(['createTime' => 'ASC'])]
public Collection $children;
```

Initialise `$children` in a constructor. A fourth rule ("replies inherit the anchor and carry none of
their own") belongs to phase 04, which adds it as part of its `AssertValidAnchor` validator.

Phase 04 also **extends `AssertBelongsToSameActivity`** to accept a `ContentNode` value — see the
validator note below, which is why it is built interface-first rather than typed to `Comment`.

**Write one custom validator, keep one rule inline.** The reference fork expresses all three as
`Assert\Expression`; that is not the house pattern here, and one of the three genuinely needs a
validator.

- **`AssertBelongsToSameActivity` — new custom validator.** Nothing existing fits:
  `AssertBelongsToSameCamp` is camp-only. It needs to be a validator rather than an expression because
  `Comment::$activity` is **nullable**: the expression would need null guards on both sides plus
  `getId()` comparison (every validator here compares `getId()`, never `==` on entities, because of
  Doctrine proxies), which produces an untestable string longer than the validator body — and the
  null-on-both-sides case could not be unit-tested at all. Decide that case explicitly;
  `AssertBelongsToSameCampValidator` treats null/null as a violation, and matching it is probably right.

  **Model it on `AssertBelongsToSameCampValidator`, not on `ChecklistItem/AssertBelongsToSameChecklist`.**
  The checklist one is a 39-line copy hardcoded to `->checklist` and typed to one concrete class, which
  is a dead end here: phase 04 has to feed a `ContentNode` through the same constraint. The camp
  validator already solves that shape — it accepts anything implementing one of two **interfaces** and
  resolves the awkward case through a trait (`GetCampFromContentNodeTrait::getCampFromInterface`). So
  introduce `App\Entity\BelongsToActivityInterface` (`getActivity(): ?Activity`) implemented by
  `Comment`, resolve both sides through an `App\Util\GetActivityFromContentNodeTrait`, and compare
  `getId()`. Phase 04 then adds a content-node branch to the trait and nothing else.

- **No-nesting — inline `Assert\Expression`, one line.** This is a depth-1 tree, so none of
  `AssertNoLoop` / `getNestingLevel()` / `getSubtreeDepth()` applies: a cycle is impossible at depth
  1, and self-parenting is already rejected because such a comment has `value.parent !== null`. A
  constraint class here would be a 40-line wrapper around a boolean. Inline Expression is rare but
  accepted — there are exactly three in `api/src/`, including `ChecklistItem`'s depth limit.
- **`AssertBelongsToSameCamp` on `$parent` — free.** `Comment` already implements
  `BelongsToCampInterface`, so it costs nothing and gives a clean cross-camp error even when
  `activity` is null on both comments.

House pattern for the new validator: two files side by side in a per-entity subdirectory, autowired
by the `App\` glob (no service registration), `UnexpectedTypeException` guard, early return on null,
violation attached to the property by default (`->atPath()` is used nowhere). Do **not** add the
message to `api/translations/validators.en.yml` — 12 of the 19 existing validators ship their English
default untranslated.

`ChecklistItem::$parent` is the precedent for stacking constraints on one self-referencing property:
`#[AssertBelongsToSameChecklist] #[AssertNoLoop] #[Assert\Expression(depth limit)]`.

**Deletion, per epic decision 4:** the FK is **not** `onDelete: cascade`. The fork's cascade lets an
author delete their root comment and silently destroy everyone else's replies, which the
traceability rule forbids. Refuse instead — either a `Delete` security expression or a state
processor that 409s when `children` is non-empty.

**Do not add moderation delete.** The fork also widens `Delete` to
`object.author === user or is_granted("CAMP_MANAGER", object)`. We do not want that: a J+S coach's
conditions and change requests must not be removable by the camp team. `Delete` stays
`object.author === user`, unchanged from today. Resolving is the mechanism for getting an addressed
comment out of the way — which is exactly why steps 5 and 6 ship together.

**Do not add `parent` to the `SearchFilter`.** Nothing needs it: the panel already fetches every
comment in the camp and assembles threads client-side. If a later phase genuinely needs
`?parent=<iri>`, add it together with a DB index on `parentId` and filter tests — an unindexed
`SearchFilter` on a self-referencing FK is a slow query waiting to happen. (The FK column gets an
index from the migration either way; the point is not to expose a query path nobody uses.)

### Resolve (step 6)

```php
new Patch(
    denormalizationContext: ['groups' => ['update']],
    security: 'is_granted("CAMP_COLLABORATOR", object)',
    processor: CommentUpdateProcessor::class,
),
```

Two read-only columns plus a write-only virtual flag, all three with docblocks for the same reason as
above:

```php
/**
 * When the thread was resolved. Null if the comment is a reply or if
 * the thread is still open.
 */
#[ApiProperty(writable: false, example: '2022-01-01T00:00:00+00:00')]
#[Groups(['read'])]
#[ORM\Column(type: 'datetime', nullable: true)]
public ?\DateTimeInterface $resolvedAt = null;

/**
 * The user who resolved the thread. Null if the comment is a reply or
 * if the thread is still open.
 */
#[Assert\DisableAutoMapping]
#[ApiProperty(writable: false, example: '/users/1a2b3c4d')]
#[Groups(['read'])]
#[ORM\ManyToOne(targetEntity: User::class)]
#[ORM\JoinColumn(nullable: true, onDelete: 'set null')]
public ?User $resolvedBy = null;

/**
 * Write-only flag for resolving (true) or reopening (false) a thread.
 * Only a thread's root comment can be resolved, not an individual reply.
 */
#[Assert\Expression(
    'this.resolved === null or this.parent === null',
    message: 'Only the root comment of a thread can be resolved.',
)]
#[ApiProperty(readable: false, example: true)]
#[Groups(['update'])]
public ?bool $resolved = null;
```

**Resolving applies to a thread, so it is refused on a reply.** Say it three times, because each one
catches a different mistake:

- in the docblock, so it reaches the OpenAPI spec and a client author reads it before writing the call;
- as the `Assert\Expression` above — a pure scalar-and-null check, the same shape as the no-nesting
  rule, and it runs before `CommentUpdateProcessor` so the processor never sees the case;
- in `UpdateCommentTest`: `PATCH {"resolved": true}` on a reply → 422, and the reply's `resolvedAt`
  stays null.

Without it, `resolvedAt` could be stamped on a reply, where nothing reads it. The panel would ignore it,
so the bug would be invisible until someone later wrote a query over resolved comments and got the wrong
count.

`api/src/State/CommentUpdateProcessor.php` translates it: `resolved === true` stamps `resolvedAt`
and `resolvedBy` from the current user, `resolved === false` clears both. Take the fork's
implementation — but **drop its `editedAt` / `textHtml` change listener**, per epic decision 3.
`textHtml` stays out of the `update` group, so the only thing PATCH can do is resolve and reopen.
That also means the fork's
`securityPostDenormalize: 'object.author === user or object.textHtml === previous_object.textHtml'`
is unnecessary here.

Resolving is a **collaborator** action, not an author-only one — mirroring how anyone with edit
access to a Google Doc can resolve a thread.

**`resolved` is the only thing PATCH will ever accept**, and that survives phase 04: anchors are set at
creation and never updated, so phase 04 adds no writable field and no `securityPostDenormalize`. Resolve
is also the answer phase 04 gives for a comment whose anchor got lost — there is no repair UI, the thread
is simply readable and resolvable like any other.

### Migration

One migration adding `parentId`, `resolvedAt`, `resolvedById`, the two FKs and their indexes.

### Dev data seeds

The toggle is on for `dev`, so threads and resolving need something to look at there, the same way
phase 01 seeded the first comments. Same dump-based procedure
(`api/migrations/dev-data/README.md`): wipe the local DB volume, create the data **through the
frontend**, run `./create-data-migration-dump.sh`, hand-edit the new migration's `getDescription()`.

Seed a thread with a couple of replies from different authors, a **resolved thread**, and a **resolved
single comment with no replies** — the last one is the common case in practice and the one that shows
whether a resolved comment reads sensibly on its own, without replies underneath it to carry the visual
weight. Two traps carried over from phase 01: the DB wipe is mandatory or IDs drift, and the e2e suite
hard-codes dev-data IDs (`e2e/utils/constants.ts`, plus the pinned lists under
`e2e/tests/9-behavior-tests/httpCache/`), so re-run the behavior tests afterwards.

## Frontend changes

**`CommentsList.vue`** — group the flat collection into threads (root = `parent === null`, replies
sorted by `createTime`), render one `CommentThread` per root, and sort open threads before resolved
ones.

**`frontend/src/components/comments/CommentThread.vue`** (new) — the root card, its replies, a
compact reply composer, and the resolve/reopen control.

**Resolved threads are hidden, not collapsed.** An **"Open" / "All" toggle** in the panel header
switches between them:

- **Open** (default) — resolved threads are simply absent from the list.
- **All** — resolved threads render **in full**, exactly like open ones, with an indicator: who
  resolved them and when, plus the reopen control.

Do **not** collapse them to a summary line, and do not grey them in place in the Open view. The
reason you switch to "All" is to read a resolved thread and decide whether it needs reopening, and
you cannot make that call from a truncated first line. Greying in place would also keep costing
vertical space, which defeats the point of resolving at all.

The toggle is per-panel UI state, so it belongs in `commentsState` — phase 01 created that module with
one boolean, and this is its second field:

```js
export const commentsState = reactive({
  open: false, // phase 01
  activityFilter: null, // phase 02 — the mobile dashboard badge
  showResolved: false, // this phase — false is "Open", true is "All"
})

export function resetCommentsState() {
  commentsState.open = false
  commentsState.activityFilter = null
  commentsState.showResolved = false
}
```

Three things follow from putting it there rather than in the component:

- `CommentsList` and the header toggle read the same flag without prop plumbing, and the panel is a
  singleton so there is exactly one of it.
- It gets cleared on camp change by phase 01's `resetCommentsState()` watcher, which is what you want:
  "All" is a mode you switched into to deal with one camp's backlog.
- Phase 04 reads the **same** flag to decide which anchors are highlighted in the content, so the
  toggle and the highlights cannot disagree.

It does **not** get URL persistence. Unlike phase 02's dashboard filters, nobody sends a colleague a
link to a panel state.

**`CommentComposer.vue`** — gains an optional `parent` prop; when set, the POST body carries
`parent: <iri>` and omits nothing else. `camp` and `activity` are still required and still arrive as
props from the panel, which derives them from the route via `campFromRoute` / `activityFromRoute`.

**`CommentCard.vue`** — the delete button on a root with replies must be disabled or absent, with a
tooltip, matching the backend's refusal. Do not let the user discover the rule via a 409.

## Files touched

```
api/src/Entity/Comment.php                                       modified
api/src/State/CommentUpdateProcessor.php                         new
api/migrations/schema/VersionYYYYMMDDHHMMSS.php                  new
api/fixtures/comments.yml                                        +reply and resolved fixtures
api/src/Entity/BelongsToActivityInterface.php                    new
api/src/Util/GetActivityFromContentNodeTrait.php                 new
api/migrations/dev-data/data.sql                                 regenerated (+threads, +resolved)
api/migrations/dev-data/Version<new>.php                         new (+ previous one gutted)
api/tests/Api/Comments/UpdateCommentTest.php                     rewritten (currently asserts 405)
api/tests/Api/Comments/CreateCommentTest.php                     +reply cases
api/tests/Api/Comments/DeleteCommentTest.php                     +root-with-replies, +manager-denied
api/src/Validator/Comment/AssertBelongsToSameActivity.php        new
api/src/Validator/Comment/AssertBelongsToSameActivityValidator.php  new
api/tests/Validator/Comment/AssertBelongsToSameActivityValidatorTest.php  new
api/tests/Api/SnapshotTests/__snapshots__/                       all three regenerated

frontend/src/components/comments/CommentThread.vue               new
frontend/src/components/comments/CommentsList.vue                modified
frontend/src/components/comments/CommentComposer.vue             modified
frontend/src/components/comments/CommentCard.vue                 modified
frontend/src/locales/en.json                                     +keys
frontend/src/components/comments/__tests__/CommentThread.spec.js new
```

## Tests

```bash
docker compose exec api composer test tests/Api/Comments/
docker compose exec api composer cs-fix
docker compose exec api composer psalm
docker compose exec api composer phpstan
docker compose exec frontend npm run test:unit
```

`AssertBelongsToSameActivityValidatorTest` follows the house `ConstraintValidatorTestCase` shape
(see `api/tests/Validator/AssertBelongsToSameCampValidatorTest.php`): the six canonical cases —
`testExpectsMatchingAnnotation`, value/object type guards, `testNullIsValid`, `testValid`,
`testInvalid` — plus, importantly, **the null-on-both-sides case**, which is the one an inline
expression could not have pinned.

API cases to add:

- reply creation succeeds; nesting a reply under a reply → 422 `parent: Cannot reply to a reply.`;
- a reply whose `activity` differs from its parent's → 422 on `propertyPath: parent`;
- a reply whose parent is in a different camp → 422 (the free `AssertBelongsToSameCamp`);
- PATCH `{"resolved": true}` as a collaborator → 200, `resolvedAt` and `resolvedBy` set;
- PATCH `{"resolved": false}` → both cleared;
- PATCH `{"textHtml": "..."}` → 400 "Extra attributes are not allowed" (proves no-edit holds);
- PATCH as an unrelated user → 403/404;
- DELETE a root that has replies → refused;
- DELETE another user's comment as a camp manager → **403** (there is no moderation delete; the
  existing `DeleteCommentTest` already asserts this — keep that assertion, do not relax it).

**Snapshots:** all three files under `api/tests/Api/SnapshotTests/__snapshots__/` break on the
serialization-group change. Regenerate deliberately and read the OpenAPI diff — it is the
contract.

## Verification

1. As member A, comment on an activity. As member B, reply. Both see the thread with the reply
   indented under the root.
2. As B, resolve the thread. It disappears from the default "Open" view for both. Switch to "All":
   it is there **in full** — root and every reply, same as an open thread — with an indicator naming
   B and the time, plus a reopen control. Nothing is truncated to a summary line.
3. Reopen it. It returns to the "Open" list with the reply intact.
4. As A, try to delete the root. The control is disabled with an explanation; deleting the reply
   first then the root works.
5. As the camp manager, try to delete B's reply. There is no delete control, and a hand-crafted
   `DELETE` returns 403.
6. As a camp guest, confirm you can reply and resolve (a guest is a `CAMP_COLLABORATOR`).
7. `curl -X PATCH` a comment with `{"textHtml": "hacked"}` and confirm 400.
8. As B, resolve a long thread of A's. Switch to "All" and read the whole exchange without expanding
   anything — that is the case the no-collapse rule exists for — then reopen it from there. Nothing
   was destroyed.
9. On the dashboard, resolve every thread on one activity. Its count badge disappears; resolve only
   some and the count drops accordingly.

## Open questions

None — see the decisions above.

## Done criteria

- [ ] A reply can be created, read and deleted; nesting is rejected by the API with a clear message.
- [ ] A thread can be resolved and reopened by any collaborator; the resolver is recorded.
- [ ] PATCH cannot change `textHtml`.
- [ ] Deleting a root with replies is refused by the API and prevented in the UI.
- [ ] No moderation delete was added — `Delete` is still `object.author === user`, and the existing
      "manager cannot delete someone else's comment" assertion still passes.
- [ ] "Reply must share its parent's activity" is a custom validator in
      `api/src/Validator/Comment/`, unit-tested in the house `ConstraintValidatorTestCase` style
      including the null-on-both-sides case. No-nesting stayed a one-line `Assert\Expression`.
- [ ] No `parent` `SearchFilter` was added.
- [ ] Resolved threads are hidden in the "Open" view and rendered **in full** under "All", with a
      resolver indicator and a reopen control — never collapsed to a summary and never greyed in
      place. The dashboard badge counts open threads only.
- [ ] All three snapshot files regenerated; `composer test tests/Api/Comments/` green.
