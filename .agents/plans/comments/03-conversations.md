# Phase 03 — Conversations (roadmap steps 5, 6)

See [epic.md](epic.md) for the datamodel and decisions. Requires [01-usable-ui.md](01-usable-ui.md).

## Goal

A comment becomes a conversation. Anyone in the camp can reply to a comment, and any collaborator
can mark a thread resolved — which takes it out of the default view, so the panel stops growing
forever. Resolved threads stay fully readable under an "All" toggle and can be reopened.

Resolve is not a nicety here. Because nobody may delete or edit anybody else's comment
(see the epic's "Who this is for"), resolving is the **only** way an addressed J+S condition or
change request stops cluttering the panel. That is why step 6 ships with step 5 rather than later.

This is vision points E, F, H and I from #828: everyone can resolve, resolved comments are hidden but
discoverable, only the author deletes, and anyone can reply to a non-reply, so nesting depth is 1.

Steps 5 and 6 ship together because they touch the same table, the same serialization groups and the
same panel code. Apart, that is two migrations, two snapshot regenerations and two reworks of
`CommentsList.vue`. For the same reason, this phase also moves comment authorship to camp
collaborations (see below): **one schema migration and one dev-data migration** for all of it.

## Status (2026-10-18)

Implemented on `comments-frontend-3`, not yet merged. This file describes what was built; where the
implementation deliberately departs from the first draft of this plan, the reason is given in place.

## Non-goals

| Not in this phase                                  | Phase that does it                                 |
| -------------------------------------------------- | -------------------------------------------------- |
| Editing a comment's text                           | never — epic decision 3                            |
| Nested replies (reply to a reply)                  | never — threads are flat, see the validation below |
| Anchoring a thread to a text range or content node | 04                                                 |
| Notifying anyone that they got a reply             | 05                                                 |
| Per-user read state on a thread                    | 05                                                 |
| Filtering the mobile panel by author               | deferred — see "Mobile author filter" below        |

## Backend changes

This phase adds **the first `Patch` operation this entity has ever had**. Before it, `Comment` exposed
only `read` and `create` serialization groups, and `UpdateCommentTest` asserted 405.

Every new property gets a docblock in the house style. API Platform emits them as `description` in the
OpenAPI spec, and **it cuts a description short at the first line that ends with a period** — so within
one docblock, only the last line may end with a period; wrap sentences so no line break follows a full
stop.

### Threading (step 5)

```php
/**
 * The comment this one replies to, or null if it starts a thread. Threads are flat, so
 * a reply always points at the root comment of its thread.
 */
#[AssertBelongsToSameCamp]
#[AssertSameAnchorAsParent]
#[Assert\Expression('value === null or value.parent === null', 'Cannot reply to a reply.')]
#[ApiProperty(example: '/comments/1a2b3c4d')]
#[Groups(['read', 'create'])]
#[ORM\ManyToOne(targetEntity: self::class, inversedBy: 'children')]
#[ORM\JoinColumn(nullable: true)]
public ?Comment $parent = null;

/**
 * The replies to this comment, oldest first. Always empty on a reply. Deleting a comment
 * also deletes its replies, so this is only possible as long as all of them were written
 * by the author of the comment, because nobody may delete the comments of other people.
 *
 * @var Collection<int, Comment>
 */
#[Assert\Expression(
    '!this.hasRepliesByOthers()',
    'It\'s not possible to delete a comment as long as other people have replied to it.',
    groups: ['delete']
)]
#[ApiProperty(writable: false, example: '["/comments/1a2b3c4d"]')]
#[Groups(['read'])]
#[ORM\OneToMany(targetEntity: self::class, mappedBy: 'parent', cascade: ['remove'])]
#[ORM\OrderBy(['createTime' => \SortDirection::Ascending])]
public Collection $children;
```

**A reply is about whatever its thread is about, and the client does not repeat it.** A reply is posted
as `{ parent, textHtml }`; camp and anchor come from the parent:

- `Comment::getCamp()` falls back to `$this->parent?->getCamp()`. That is what the `CAMP_COLLABORATOR`
  check in `securityPostDenormalize` reads, so the security check works before anything is copied. The
  auto-mapped NotNull on the `camp` property is disabled for that reason and replaced by
  `#[Assert\NotNull]` on `getCamp()` (same violation path `camp`).
- `CommentCreateProcessor` copies `camp`, every field in `Comment::ANCHOR_FIELDS` (today only
  `activity`) and `orphanDescription` from the parent onto the reply.
- **Replies carry the full anchor of their thread.** Every anchor field is denormalised onto every reply,
  for the same reason `activity` is denormalised onto every anchor (see the epic): "how many comments
  are on this schedule entry / content node" must stay one indexed query, without a join through
  `parent`. Phase 04 and later anchor types add their fields to `Comment::ANCHOR_FIELDS` and get the
  copying for free. Highlights in the content only consider thread roots.
- **`App\Validator\Comment\AssertSameAnchorAsParent`** on `$parent` rejects a reply that sends anchor
  fields contradicting its parent's (sending none, or the same ones, is fine). One validator for all
  anchor fields, typed to `Comment` — not one validator per anchor entity, and no interface: it only
  ever compares a comment with its parent. Message: `Must be about the same {{ field }} as the comment
it replies to.` Phase 04 extends it to compare scalar anchor fields (`anchorPath`, `anchorId`) as
  well as entities.
- **No-nesting stays a one-line `Assert\Expression`.** This is a depth-1 tree, so none of
  `AssertNoLoop` / `getNestingLevel()` / `getSubtreeDepth()` applies.
- **`AssertBelongsToSameCamp` on `$parent` — free,** since `Comment` implements
  `BelongsToCampInterface`; it catches a reply that sends a different camp.

An earlier draft introduced `AssertBelongsToSameActivity` with a `BelongsToActivityInterface` and a
`GetActivityFromContentNodeTrait` for `$parent`. That is gone: comparing a reply with its parent is a
different question ("same thread?") from phase 04's "does this content node belong to this activity?",
which wants the opposite treatment of `null` — see phase 04, which now introduces that validator.

**Deletion, per epic decision 4 (refined):** deleting a root whose replies are **all by its own author**
deletes the thread (`cascade: ['remove']` on `children`); as soon as anybody else replied, `DELETE`
answers 422. The traceability rule is about other people's comments, and that is what stays protected.
The FK itself has no `ON DELETE` clause.

**Do not add moderation delete.** `Delete` stays author-only:
`object.author !== null and object.author.user === user`. Resolving is the mechanism for getting an
addressed comment out of the way.

**Do not add `parent` to the `SearchFilter`.** The panel fetches every comment in the camp and assembles
threads client-side.

### Authorship — camp collaborations, not users

`author` and `resolvedBy` point at a **`CampCollaboration`**, not a `User`, so the camp-specific avatar
overrides (`color`, `abbreviation`) apply, and an inactive collaborator is shown as such. If authorship
ever moves back to `User`, a collaboration still knows its user, so the migration is one `UPDATE`.

```php
#[Assert\DisableAutoMapping] // avoids validation error when author is null in payload
#[ApiProperty(writable: false, example: '/camp_collaborations/1a2b3c4d')]
#[Groups(['read', 'create'])]
#[ORM\ManyToOne(targetEntity: CampCollaboration::class)]
#[ORM\JoinColumn(nullable: true, onDelete: 'set null')]
public ?CampCollaboration $author = null;

#[ApiProperty(writable: false, example: 'Bi-Pi')]
#[Groups(['read'])]
#[ORM\Column(type: 'text', nullable: true)]
public ?string $authorDisplayName = null; // same pair for resolvedBy / resolvedByDisplayName
```

- `CommentCreateProcessor` and `CommentUpdateProcessor` look up the current user's collaboration in the
  comment's camp (`CampCollaborationRepository::findByUserAndCamp`).
- **Leaving the camp.** A collaboration can only be deleted once it is `inactive`. The new
  `CampCollaborationRemoveProcessor` saves the user's display name into `authorDisplayName` /
  `resolvedByDisplayName` of the affected comments before the database unlinks the collaboration
  (`ON DELETE SET NULL`). Such a comment can no longer be deleted by anybody, which is consistent with
  "nobody deletes somebody else's comment".
- Only the name is saved, not the avatar override: a removed author is shown with a neutral "account
  removed" avatar.
- `User::$comments` is gone; nothing used it.

### Resolve (step 6)

```php
new Patch(
    denormalizationContext: ['groups' => ['update']],
    security: 'is_granted("CAMP_COLLABORATOR", object)',
    processor: CommentUpdateProcessor::class,
),
```

`resolvedAt` and `resolvedBy` are read-only; the write-only flag `resolved` is the only thing PATCH
accepts — that survives phase 04, whose anchors are set at creation and never updated.

```php
/**
 * Write-only flag for resolving (true) or reopening (false) a thread. Only the root
 * comment of a thread can be resolved, not an individual reply.
 */
#[Assert\Expression(
    'this.resolved === null or this.parent === null',
    message: 'Only the root comment of a thread can be resolved.',
)]
#[ApiProperty(readable: false, example: true)]
#[Groups(['update'])]
public ?bool $resolved = null;
```

`CommentUpdateProcessor`: `resolved === true` stamps `resolvedAt` / `resolvedBy` — **only if the thread
is not resolved yet**, so resolving twice keeps the original resolver; `resolved === false` clears
`resolvedAt`, `resolvedBy` and `resolvedByDisplayName`. `textHtml` stays out of the `update` group
(epic decision 3), so the fork's `editedAt` listener and its `securityPostDenormalize` are not needed.

Resolving is a **collaborator** action, not an author-only one, as in Google Docs.

### Migrations

**One schema migration** (`Version20261018154736`) adds `parentId`, `resolvedAt`, `resolvedById`,
`authorDisplayName`, `resolvedByDisplayName`, makes `authorId` nullable and re-points it from `user` to
`camp_collaboration`. Existing comments are converted to the author's collaboration in the comment's
camp; an author without one (should not exist) keeps only their name, computed in SQL exactly like
`Profile::getDisplayName()`.

**One dev-data migration** (`Version202610181600`, the previous one gutted). Its version sorts after the
schema migration — the comparator compares names as strings, so mind the 12- vs 14-digit names.

### Dev data seeds

Seeded by hand-editing `data.sql` instead of recreating through the frontend, which keeps all existing
ids (the e2e suite hard-codes them): a thread with replies from two different authors, a resolved
thread, and a resolved single comment. Verify the result by migrating and comparing a fresh `pg_dump`
(same flags as `create-data-migration-dump.sh`) with `data.sql` — they must be identical.

## Frontend changes

**`commentThreads.js`** (new) — `threadRoot`, `isResolved` (a reply follows its root) and
`groupIntoThreads`.

**`CommentsList.vue`** — groups the comments it is given into threads and renders one `CommentThread`
per root. **Resolved threads are listed above the open ones**, not below as first drafted: that way
the open threads stay next to the composer and a newly posted comment still lands directly above it,
as the epic requires.

**`CommentThread.vue`** (new) — root card, indented replies, Reply and Resolve / Reopen, and the
"Erledigt von X am …" indicator (with the saved name, or just the date, once the resolver left).
Resolved threads offer no Reply; reopen first. The reply composer is **hidden, not destroyed**, when
closed (close button or Escape), so what was typed survives until the panel's list goes away; it is
focused when opened. Escape in the reply composer does not close the mobile fullscreen panel.

**`CommentComposer.vue`** — optional `parent`; a reply posts only `{ textHtml, parent }`. Optional
`cancelable`. `focus()` waits a few frames, because tiptap attaches its editor to the DOM only after
mounting.

**`CommentCard.vue`** — author via `UserAvatar :camp-collaboration` and
`campCollaborationDisplayName`, card colour from `campCollaborationColor`; falls back to
`authorDisplayName`. Delete is disabled with a tooltip while somebody else replied; deleting a root
with only own replies warns that the replies go too.

**Resolved threads are hidden, not collapsed.** The **"Offen" / "Alle"** switch (`v-chip-group`
with chips styled exactly like the dashboard's `BooleanFilter`; `v-chip` inside a group takes the
unselected colour from `base-color`) switches between:

- **Open** (default) — resolved threads are absent from the list.
- **All** — resolved threads render **in full**, with the resolver indicator and the reopen control.

Do **not** collapse them to a summary line, and do not grey them in place in the Open view.

The switch is `commentsState.showResolved`, reset on camp change by `resetCommentsState()`, read by
`scopedComments` (the single predicate for what the panel shows and what the toggle button counts),
and later by phase 04 to decide which anchors are highlighted. No URL persistence.

**Counts:** dashboard badges count comments in open threads only. The desktop camp-scope notice
"N weitere offene Kommentare befinden sich bei einzelnen Aktivitäten" counts **open threads** on
activities and does not follow the Open/All switch — there is no list of resolved activity comments to
send people to yet (phase 06).

### Mobile author filter — deferred

The vision discussion in #828 asks for filters on the mobile panel, "for the moment only by author, and
resolved status". Resolved status is the Open/All switch. An author filter was built and **removed
again**: with threads it is unclear whether it should match the root's author or anyone in the thread,
and both readings confused. Decide that before building it again.

## Tests

```bash
docker compose exec api composer test tests/Api/Comments/
docker compose exec api composer test tests/Validator/Comment/
docker compose exec api composer test tests/Api/CampCollaborations/DeleteCampCollaborationTest.php
docker compose exec api composer cs-fix
docker compose exec api composer psalm
docker compose exec api composer phpstan
docker compose exec frontend npm run test:unit
```

**Snapshots:** regenerate with `composer update-snapshots`, then re-dump the OpenAPI snapshot with the
test's own `Yaml::dump` arguments (indent 2) — the spatie driver writes indent 4, which the test does not
match. Read the OpenAPI diff: it is the contract.

API cases covered:

- a reply with only `parent` and `textHtml` gets camp, activity and `orphanDescription` of its parent;
  repeating the parent's anchor is fine, contradicting it → 422 on `parent`;
- nesting a reply under a reply → 422 `Cannot reply to a reply.`; a parent in another camp → 422;
- the author is the current user's collaboration;
- PATCH `{"resolved": true}` as guest / member / manager → 200; again → original resolver kept;
  `{"resolved": false}` clears it; on a reply → 422; `textHtml`, `parent`, `resolvedAt` → 400;
- DELETE a root with replies by others → 422; with only own replies → 204, replies gone; another
  user's comment as camp manager → 403; a comment whose author left → 403;
- deleting an inactive collaboration saves the name on authored and resolved comments.

## Verification

1. As member A, comment on an activity. As member B, reply. Both see the thread.
2. As B, resolve the thread. It disappears from "Offen" for both; under "Alle" it is there in full with
   B's name and the time, and a reopen control.
3. Reopen it. It returns to "Offen".
4. As A, reply to your own comment, then delete the root: the dialog warns that your reply goes too,
   and the thread disappears. With B's reply in it, delete is disabled with an explanation.
5. As the camp manager, try to delete B's reply: no control, and a hand-crafted `DELETE` returns 403.
6. As a guest, reply and resolve.
7. `curl -X PATCH` a comment with `{"textHtml": "hacked"}` → 400.
8. Set a collaborator to inactive and delete the collaboration: their comments keep their name.
9. On the dashboard, resolve every thread on one activity: its badge disappears.

## Done criteria

- [x] A reply can be created with only `parent` and text, read and deleted; nesting is rejected.
- [x] A thread can be resolved and reopened by any collaborator; the resolver is recorded.
- [x] PATCH cannot change `textHtml`.
- [x] A root with replies by others cannot be deleted (API and UI); one with only own replies can,
      together with them.
- [x] No moderation delete.
- [x] Authors and resolvers are camp collaborations; their name survives their removal from the camp.
- [x] One schema migration, one dev-data migration.
- [x] No `parent` `SearchFilter`.
- [x] Resolved threads are hidden under "Offen" and rendered in full under "Alle".
- [x] All three snapshot files regenerated; `composer test tests/Api/Comments/` green.
- [x] Detached comments are never resolved automatically (vision G).
- [ ] Mobile author filter — deferred, see above.
