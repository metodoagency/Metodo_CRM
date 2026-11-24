# Shared campaigns and multi-player sponsorship opportunities

Implemented2026-11-24 as a partial package55 slice. Existing Brand/Person directory is reused. No new external service, website request, email, social posting, financial ledger or production deployment is introduced.

## Working owner flow

Open `/sponsorship` → Opportunities and campaigns. Create a Campaign with optional known DATE boundaries. Create an opportunity using one Brand, an optional shared Campaign, one to20 existing Players, zero to20 existing BrandContacts, optional responsible Person, known last-contact/next-action dates and a private next action. Responsible Persons are records, not login accounts. Empty dates stay unknown.

The global operational stage and each player's stage/outcome are independent. A WON or LOST player never changes the other players or global stage. Changing the global stage never changes player outcomes. Terminal stages/outcomes and reopening require an encrypted reason; operational AGREEMENT is not a legal determination. History distinguishes source, participant and contact events.

Each transition previews exact before/after stage/outcome, the target UUID and the entered reason. Confirmation binds that payload, authenticated session, source/target versions, current player/contact/Brand/Campaign graph, unique event UUID and expiry with purpose-separated HMAC. A Serializable transaction rechecks them, updates canonical state, appends the event and records masked timeline/audit atomically. Concurrent, forged, expired, changed-parent and replayed plans fail with409; canonical writes are not retried.

Owner-entered next-action metadata can be edited globally or per player. Omitted private action preserves its ciphertext; explicit null clears it. The editor defaults to keep, never fills decrypted text automatically, and freezes record versions on opening. Player metadata cannot rename a canonical Player or overwrite the global last-contact date.

## Privacy and lifecycle

`privateNextAction` on source/participant and `privateReason` on history use field-bound AES-GCM. Projection lists and history return presence flags only, no ciphertext. Separate POST reveal checks the current typed target and its live parent chain, logs field name only and expires in60seconds. Bad non-null ciphertext fails closed.

Private create/preview/reveal responses use transient component state, never TanStack Query/Mutation cache or browser storage. Abort/generation checks reject late responses. Reveal hides on blur/focus/visibility, expiry and source scope change. The safe opaque `scopeVersion` includes the parent/link graph, so Player/Person purge invalidates an in-flight disclosure even when the opportunity version stays unchanged. Unavailable history targets do not render reveal controls.

Campaign/Opportunity use owner-controlled Trash/retention. Participant/contact joins and protected history are dependent lifecycle rows. Purging a Player, Person or BrandContact removes only its joins/history; it preserves the common opportunity, global history, other Players and independent Brand. Purging Campaign/Brand is blocked while dependent canonical opportunities remain. Restore checks live grandparents and same-brand/participant correspondence. Child restore bumps the opportunity version.

An example participant/contact marks its child and child history as examples, not an existing real shared opportunity. Example cleanup preserves unrelated real sources. All five models are in canonical checksum backup/restore; all three encrypted slots participate in key verification/rotation. Migration019 includes owner RLS, public/anon/authenticated revokes, role/target XOR, uniqueness, domain and date constraints before first application. Protected semantic history permits maintenance re-encryption/version updates; there is no HTTP history editing/purge endpoint.

## API and evidence

`GET/POST /api/campaigns`; `DELETE /api/campaigns/:id`.
`GET/POST /api/sponsorship/opportunities`; `GET/DELETE /api/sponsorship/opportunities/:id`.
`PATCH .../:id/details`; `POST .../:id/transition/preview`, `.../confirm`, `.../reveal`; `GET .../:id/history`.
All are authenticated and all writes require Origin/CSRF; strict schemas are registered in the generated API contract.

Evidence: `tests/sponsorship-pipeline.test.ts`, `tests/recovery.test.ts`, `tests/schema.test.ts`, `tests/e2e/pipeline.spec.ts`, existing directory/retention/first-login scenarios. Exact final source CI is recorded in PROGRESS.md, not inferred from older test runs.

## Still open

Package55 and SP1/SP2 remain partial: post-creation roster/contact reassignment and unlink/restore UI, Campaign editing UI, Kanban, social-account foundation and all remaining acceptance clauses are pending. Offers/agreements/obligations, sponsorship finance, media and matchday are later packages. This slice has no amount, automatic split, invented FX or implied automatic task. Existing file/Task/Meeting parent allowlists have not been broadened.
