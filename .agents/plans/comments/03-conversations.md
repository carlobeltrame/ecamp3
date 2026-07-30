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

| Not in this phase                              | Phase that does it                                 |
| ---------------------------------------------- | -------------------------------------------------- |
| Editing a comment's text                       | never — epic decision 3                            |
| Nested replies (reply to a reply)              | never — threads are flat, see the validation below |
| Anchoring a thread to a text range or checkbox | 04                                                 |
| Notifying anyone that they got a reply         | 05                                                 |
| Per-user read state on a thread                | 05                                                 |

## Backend changes

This phase adds **the first `Patch` operation this entity has ever had**. `Comment` currently
exposes only `read` and `create` serialization groups, and `UpdateCommentTest` asserts 405.

### Threading (step 5)

```php
#[AssertBelongsToSameCamp]
#[AssertBelongsToSameActivity]
#[Assert\Expression('value === null or value.parent === null', 'Cannot reply to a reply.')]
#[Groups(['read', 'create'])]
#[ORM\ManyToOne(targetEntity: self::class, inversedBy: 'children')]
#[ORM\JoinColumn(nullable: true)]
public ?Comment $parent = null;

#[ApiProperty(writable: false)]
#[Groups(['read'])]
#[ORM\OneToMany(targetEntity: self::class, mappedBy: 'parent')]
#[ORM\OrderBy(['createTime' => 'ASC'])]
public Collection $children;
```

Initialise `$children` in a constructor. A fourth rule ("replies inherit the anchor and carry none of
their own") belongs to phase 04, which adds it as part of its `AssertValidAnchor` validator.

Phase 04 also **extends `AssertBelongsToSameActivity`** to accept a `ContentNode` value, so write it
with that in mind: switch on the value type rather than assuming `Comment`, the way
`AssertBelongsToSameCampValidator` already does for its several interfaces.

**Write one custom validator, keep one rule inline.** The reference fork expresses all three as
`Assert\Expression`; that is not the house pattern here, and one of the three genuinely needs a
validator.

- **`AssertBelongsToSameActivity` — new custom validator.** Nothing existing fits:
  `AssertBelongsToSameCamp` resolves the camp through `GetCampFromContentNodeTrait` and is
  camp-only, and the codebase already declined to generalise it once — `ChecklistItem/AssertBelongsToSameChecklist`
  is a 39-line copy of the same shape hardcoded to `->checklist`. Copy that file into
  `api/src/Validator/Comment/AssertBelongsToSameActivity{,Validator}.php` and swap `checklist` for
  `activity`. It needs to be a validator rather than an expression because `Comment::$activity` is
  **nullable**: the expression would need null guards on both sides plus `getId()` comparison
  (every validator here compares `getId()`, never `==` on entities, because of Doctrine proxies),
  which produces an untestable string longer than the validator body — and the null-on-both-sides
  case could not be unit-tested at all. Decide that case explicitly; `AssertBelongsToSameCampValidator`
  treats null/null as a violation, and matching it is probably right.
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

Columns `resolvedAt` (`?datetime`, `writable: false`, `read` group) and `resolvedBy` (`?User`,
`writable: false`, `read` group, `ON DELETE SET NULL`), plus a write-only virtual flag:

```php
#[ApiProperty(readable: false)]
#[Groups(['update'])]
public ?bool $resolved = null;
```

`api/src/State/CommentUpdateProcessor.php` translates it: `resolved === true` stamps `resolvedAt`
and `resolvedBy` from the current user, `resolved === false` clears both. Take the fork's
implementation — but **drop its `editedAt` / `textHtml` change listener**, per epic decision 3.
`textHtml` stays out of the `update` group, so the only thing PATCH can do is resolve and reopen.
That also means the fork's
`securityPostDenormalize: 'object.author === user or object.textHtml === previous_object.textHtml'`
is unnecessary here.

Resolving is a **collaborator** action, not an author-only one — mirroring how anyone with edit
access to a Google Doc can resolve a thread.

### Migration

One migration adding `parentId`, `resolvedAt`, `resolvedById`, the two FKs and their indexes.

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

The toggle is per-panel UI state, so it belongs in `commentsState`; it does not need URL persistence.

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
