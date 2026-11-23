# Document and video vault — owner scope update 2026-11-23

Authoritative owner text: OWNER_EXTENSION_20261123.md, preserved verbatim. All M1–M45/R1–R26/G1–G15, SP/MO and innovation clauses remain. This is an explicit change to file/video policy, not permission to scrape, send, bypass quota or disclose documents to processors. Keep current single-company/owner/session/CSRF/TR+EN architecture and Free resources. Core private pilot remains independent of final vault acceptance.

## New milestone M: packages67–72

| Package | Requirement | Dependencies | Acceptance | Status |
|---|---|---|---|---|
|67|V1 canonical vault metadata/immutable versions/typed multiple references; safe legacy document links and protected private-source evidence|05,14,Drive resource base|Title/description/type/tags/document date/upload date/source/signature state/confidentiality/rights/retention and immutable source versions; no duplicate file per player; versioned preview/audit/Trash; no plaintext private legacy URL in ordinary DTO/cache|NOT_STARTED|
|68|V2 private single/batch/drop uploads for approved documents/images/native designs and local redaction|67,private storage,local helper|Per-type MIME/magic/active-content/archive/malware policy; unsupported types never previewed as safe; validated preview/download; no automatic canonical contract update; signed original never rewritten; identifiers handled before managed storage|NOT_STARTED|
|69|V3 resumable direct media upload and quota/capacity control|67,68,verified provider adapter|Owner-scoped session/part identity, actual capacity/size checks and reservations before transfer, progress/cancel/retry/resume/integrity, private finalization, no persistent video on Render disk; explicit storage-unavailable/quota errors, no paid upgrade|NOT_STARTED|
|70|V4 video library/player/timed notes and local technical processing|69,Match16,rights40|Stored duration/resolution/source/rights, owner-started local thumbnail processing, private range/seek and expiring access, player/match/team/season/tournament/report links, clip bounds validated against real duration; no inferred health/performance or URL auto-download|NOT_STARTED|
|71|V5 encrypted object-aware backup and temporary recovery|25,36,67–70|DB and actual file objects restored separately into temporary targets; manifest bytes/sizes/checksums/versions/multiple references/permissions/generation IDs match, corruption/missing objects fail; actual storage/backup/transfer quota visible|NOT_STARTED|
|72|V6 expanded cross-module final acceptance|all original01–66 and67–71|TR/EN/mobile/light/dark/axe/security/load, interrupted uploads/cancel/quota/unauthorized media/seek/expiry/rights/clip ranges, redaction/processing consent/no sensitive search/log/share leakage, restore/rollback and verified app/Sites delivery; M acceptance|NOT_STARTED|

Original54/J and66/L stay their own acceptance gates. No count/message/date guarantee. Starting ledger10/72 DONE,5 IN_PROGRESS,57 NOT_STARTED; all new packages NOT_STARTED until actual implementation. Preserve existing K/L fields and map new details there rather than creating a second business model.

## Existing scope additions mapped without dropping clauses

- Design28: two concise visual directions in DESIGN.md; select and implement the direction fitting the already approved brand/use. Keep locally served fonts, readable density, keyboard/mobile and both themes. No private data goes to design providers without consent.
- Club/Player/Person360:07/10/11 and shared related-records shell. Brand360 and full sponsorship directory55/59. Related contract, meeting, task, document, payment, match, content and timeline links come from actual modules. No placeholder treated as working functionality.
- Sponsorship55–59: brand regions/categories and dated decision-maker roles; per-player rationale/contact/feedback/rights/offer/amount/currency/next action/responsible/terminal reason. Central columns: brand/contact/players/stage/last contact/next action/amount-currency/responsible; list/Kanban/calendar/filter/saved views. Reuse Person/Campaign/finance.
- Source registry08/16/47/65/67: typed record references, external ID, source/method/permission/last check/import/error/config evidence. Explicit states working integration/manual reference/file import/access needed/disabled. A URL alone is manual reference. TFF owner trigger+robots+CSV only, no scheduled fetch. Live licensed football providers remain deferred. Other official fixture sources require an explicit policy change.
- Action center15/26/35/50/58/62: actual today/week/approvals/contracts/payments/matches/content/rights/deadlines and linked actions. No invented outside submission/signature/bank completion. Optional team access needs a separate role model/work package; assigning a Person creates no user.

## Storage/processing defaults

External Drive references remain fully supported. Managed uploads activate only after an actual private adapter, its quota and its production access are verified. Render Free disk is never durable file storage. Use the owner's existing suitable storage when authorized; never create a paid account, assume API entitlement or claim unlimited capacity. Configure and report exact per-type limits instead of applying the old10MB limit to all videos. Keep current legacy upload mode test/development-only until the managed vault path is reviewed.

Default managed contract processing requires local redaction/preflight for prohibited identifiers. Preserve external signed original reference and a separate redacted derivative. An exception to retaining raw originals containing identity/banking/card details is an owner policy decision, not implied by general access. No identifiers become structured fields or general-search/AI/share content. Upload/extraction never changes canonical contract fields without field-level owner approval. Per-document external OCR/AI/image/audio/video processing requires exact content and destination preview/consent; local adapters must actually run locally.

Do not automatically download external video URLs. Owner-supplied files require usage-right evidence. Media is never put in PWA offline cache. Backup DB metadata is not a file backup. Every persisted upload/version/part/reservation/job/reference joins owner scoping/RLS/lifecycle/retention/cleanup/backup; default automatic business deletion remains off.

## Execution priority and blockers

Finish interrupted source/library checks, commit the usable Drive foundation, then secure legacy contract document/private-source paths. Keep early pilot backup/auth and sponsorship/media progress moving independently. Add vault/version/storage foundations in dependency order; unknown provider capacity blocks only actual upload activation. Real signed-original policy, storage-capacity/configuration and the already recorded corrected OAuth project URL belong in PROGRESS.md Owner input needed with exact blocked work. Do not ask again for already approved OAuth/client/terms actions.
