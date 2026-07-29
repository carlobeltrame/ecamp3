# Phase 05 — Notifications (roadmap steps 8, 9, 11)

**Not planned yet, deliberately.** Write this phase out when phase 04 lands. Anything detailed today
would be rewritten by then: step 8 changes phase 02's badge semantics, step 9 depends on whether
inline anchoring shipped, and step 11 depends on both.

This file exists so the three steps have a named home and so their cost signals are recorded while
they are fresh. See [epic.md](epic.md) for the roadmap and dependency edges.

## Sketch

**Step 8 — read markers and a notification bubble.** Per-user read state, either a `CommentRead`
join entity (user × comment) or a coarser `lastReadAt` per user × camp. The hard part is not the
schema, it is an unread-count endpoint that is not N+1 across every camp on the dashboard.
Frontend: a bubble in `NavigationCamp.vue`. This **supersedes phase 02's dashboard badge** — "has
comments" becomes "has unread comments" — which is exactly why phase 02 keeps that badge dumb.
Depends on 3, not on 5.

**Step 9 — mentions.** Either a `span[data-mention]` allowlist in
`api/config/packages/exercise_html_purifier.yaml` resolved to a `CampCollaboration`, or a proper
join table. Frontend: autocomplete in the composer, which tiptap supports natively. Needs a delivery
channel to be worth anything — `api/src/Service/MailService.php` exists and is the cheap answer.
Only reach for step 11 if email proves insufficient.

**Step 11 — push notifications. Greenfield in three places.** There is no service worker, no VAPID
configuration, no `web-push` dependency and no messenger anywhere in the repo. It needs a service
worker added to a Vite SPA that currently has none, a `PushSubscription` entity, and a delivery
worker. Depends on 8 and 9. Categorise as later, maybe never — and revisit whether step 9 over email
already solved the actual user need.

## Before writing this file properly

Settle these first, because they determine the schema:

- Is read state per comment, per thread, or per camp? Per-comment is the most useful and the most
  expensive to count.
- Do mentions notify by email only, or is push a hard requirement? The answer decides whether step
  11 exists at all.
- Does the notification bubble count across all camps, or per camp? Cross-camp means the query
  cannot be camp-scoped, which changes the endpoint shape.

## Related

Step 13 (cross-camp comments overview) is **not** part of this phase — it has its own file,
[06-cross-camp-overview.md](06-cross-camp-overview.md). Push notifies; an overview lets you go
looking. Different jobs, and 06 is by far the cheaper one.

Once 06 exists it is the natural landing page for a notification click, so keep its route stable and
deep-linkable when planning this phase.
