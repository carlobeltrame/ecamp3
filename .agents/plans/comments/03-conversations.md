# Phase 03 — Conversations (roadmap steps 5, 6)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes a conversation. Anyone in the camp can reply to a comment, and any collaborator
can mark a thread resolved — which collapses it out of the way, so the panel stops growing forever.
A resolved thread can be reopened.

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
#[Assert\Expression(
    'this.parent === null or this.parent.parent === null',
    message: 'Replies cannot be nested. Reply to the root comment of the thread.',
)]
#[Assert\Expression(
    'this.parent === null or this.parent.activity === this.activity',
    message: 'A reply must belong to the same activity as its parent.',
)]
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

Initialise `$children` in a constructor. The three expressions are worth lifting verbatim from the
reference fork's `Comment.php`; a fourth ("replies inherit the anchor and carry none of their own")
belongs to phase 04 and is added there.

**Deletion, per epic decision 4:** the FK is **not** `onDelete: cascade`. The fork's cascade lets an
author delete their root comment and silently destroy everyone else's replies. Refuse instead —
either a `Delete` security expression or a state processor that 409s when `children` is non-empty.
In the same change, add moderation:

```php
new Delete(security: 'object.author === user or is_granted("CAMP_MANAGER", object)'),
```

Also add `parent` to the `SearchFilter` properties so the frontend can fetch a thread directly if it
ever needs to.

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
compact reply composer, and the resolve/reopen control. Collapsed when resolved: show the root's
first line, the resolver's name and a "reopen" affordance. A "show resolved" toggle in the panel
header controls whether resolved threads are listed at all.

**`CommentComposer.vue`** — gains an optional `parent` prop; when set, the POST body carries
`parent: <iri>` and omits nothing else (`camp` and `activity` are still required and still come from
the scope).

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
api/tests/Api/Comments/DeleteCommentTest.php                     +root-with-replies, +manager
api/tests/Api/Comments/ListCommentsTest.php                      +parent filter
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

API cases to add:

- reply creation succeeds; nesting a reply under a reply → 422 with the nesting message;
- a reply whose `activity` differs from its parent's → 422;
- PATCH `{"resolved": true}` as a collaborator → 200, `resolvedAt` and `resolvedBy` set;
- PATCH `{"resolved": false}` → both cleared;
- PATCH `{"textHtml": "..."}` → 400 "Extra attributes are not allowed" (proves no-edit holds);
- PATCH as an unrelated user → 403/404;
- DELETE a root that has replies → refused;
- DELETE anyone's comment as a camp manager → 204.

**Snapshots:** all three files under `api/tests/Api/SnapshotTests/__snapshots__/` break on the
serialization-group change. Regenerate deliberately and read the OpenAPI diff — it is the
contract.

## Verification

1. As member A, comment on an activity. As member B, reply. Both see the thread with the reply
   indented under the root.
2. As B, resolve the thread. It collapses for both, showing B as the resolver. The panel's open-
   thread list shrinks.
3. Reopen it. It returns to the open list with the reply intact.
4. As A, try to delete the root. The control is disabled with an explanation; deleting the reply
   first then the root works.
5. As the camp manager, delete B's reply. It works.
6. As a camp guest, confirm you can reply but the resolve control's behaviour matches the decision
   taken (collaborator-level → a guest is a collaborator, so yes).
7. `curl -X PATCH` a comment with `{"textHtml": "hacked"}` and confirm 400.

## Open questions

- **BLOCKING** — epic decisions 3 (no edit) and 4 (refuse deleting a root with replies) must be
  final before the migration is written. Both are cheap now, migrations later.
- Should guests be able to resolve? _Default: yes_ — `CAMP_COLLABORATOR` includes guests, and
  splitting the rule means a second security expression.
- Should resolved threads be hidden by default or shown greyed? _Default: hidden behind a "show
  resolved" toggle_, which is the behaviour that actually keeps the panel usable.
- Does the dashboard badge (phase 02) count resolved threads? _Default: no_ — count open threads.

## Done criteria

- [ ] A reply can be created, read and deleted; nesting is rejected by the API with a clear message.
- [ ] A thread can be resolved and reopened by any collaborator; the resolver is recorded.
- [ ] PATCH cannot change `textHtml`.
- [ ] Deleting a root with replies is refused by the API and prevented in the UI.
- [ ] Camp managers can delete anyone's comment.
- [ ] All three snapshot files regenerated; `composer test tests/Api/Comments/` green.
- [ ] Resolved threads collapse and do not clutter the panel.
