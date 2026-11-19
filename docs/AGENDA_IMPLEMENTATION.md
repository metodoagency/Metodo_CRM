# Package15 — agenda and notifications

Started2026-11-19. Package14/M7 is accepted at5c516b4 (PostgreSQL16/17 CI44496048310). Package15 remains IN_PROGRESS; M2 agenda/M24/R4 and milestone C are not yet accepted.

## First slice

Contract notification center at `/notifications`, reached through the header bell. GET list accepts strict view/page; PATCH accepts only version plus read/snooze1/snooze7. The server computes1/7 exact24-hour days. Effective unread is NEW or an expired/null SNOOZED timestamp, evaluated on read/count without cron or a canonical write. Future snoozes stay outside unread; READ clears the snooze timestamp. Actions require live owner notification and current live Contract/Player/counterpart target, use optimistic versions in a serializable transaction and log metadata-only old/new status/timestamp. Dedupe identity, target date and threshold never change through these actions. All views, including `all`, contain only current targets; stored history remains in the database.

The first adapter covers contracts. Birthdays deliberately stay behind the calendar's explicit audited60-second view; generic GET never returns their occurrence dates, thresholds or other derived sensitive metadata. Unknown/future notification types are excluded until an appropriate adapter is implemented. Pending proposals and the protected birthday calendar have visible navigation links. Overview and center share current/unread filtering. Overview meetings now use Istanbul today and deterministic date/time/id order.

## Remaining implementation

1. Versioned Task CRUD: priority/due/status, live owner-linked entities, recurrence NONE/WEEKLY/MONTHLY, reversible Trash and masked timeline. Define monthly29–31 behavior explicitly and ensure repeated/concurrent completion creates at most one successor. Do not extend generic entityTypes/delegate (unknown types fall through to Request).
2. Versioned Meeting CRUD: DATE/time/duration, validated/deduplicated participants with safe label projections, private notes and linked task creation. No automatic invitations or participant email lookup.
3. Day/week/month agenda with current contract overlays, protected birthday view and supported-module adapters. Future transfer-window/licence/scout overlays remain pending until those modules exist.
4. RFC5545 ICS: Istanbul VTIMEZONE, stable UID, version SEQUENCE, METHOD:PUBLISH for ordinary export; manually sent invitations alone may use REQUEST. Escape text, fold UTF-8 by octets, validate rollover and preserve all-day dates. Log exports, exclude sensitive fields.
5. Dashboard widget order/visibility via existing UserSettings.dashboardLayout; keyboard-accessible reorder, today/week tasks/meetings/current deadlines/proposals/follow-ups. Add future module widgets only with real backing behavior.
6. Idempotent internal task adapters for meetings, presentations, contract alerts and approvals; blocked transfer steps follow their later module. No outbound messaging and no scheduled TFF request.
7. Complete applicable fixed-clock R4 tests, TR/EN browser/axe, database16/17 CI and milestone security review. B must also satisfy its independent open gate before any milestone merges.

## Task design review — implementation not yet started

Use dedicated strict create/edit schemas with name, priority, due date, recurrence and a nullable typed linked entity. Exclude owner/status/generation controls from general PATCH; complete/reopen are explicit versioned actions, with wrong-state/stale409 and no business-write retry. Completing and creating the next occurrence must commit together with a shared timeline batch.

Preserve an existing successor, including owner edits, completed status and soft deletion; do not regenerate or resurrect it when its source is reopened/completed again. A nullable unique generationKey (`repeat:<source UUID>`) avoids introducing a self-FK: the shared lifecycle deletion sorter correctly rejects type-level FK cycles. However, a key on the successor alone loses protection after explicit hard purge. Implementation must also persist a source-side consumed marker or equivalent retained tombstone before claiming purge-safe idempotency; do not silently accept recreation after purge. Future occurrences are independent tasks, not deletion dependents of earlier occurrences.

Validate live owner links when copying them into a new successor, even if the source retained a now-orphaned historical link. Block completion atomically until the owner fixes/clears an invalid link; never silently unlink it. Unrelated source edits may preserve historical links. Add the corresponding polymorphic parent guard to Task restore.

Weekly adds seven calendar days. Monthly skips months lacking the original day (Jan31→Mar31, Jan30→Mar30), without clamping. Late completion creates only the next-from-due-date occurrence, possibly still overdue, rather than a catch-up chain. Accept years0001–9999; bound monthly search to12 candidates and the four-digit year. At exhaustion return explicit RECURRENCE_LIMIT and require the owner to choose NONE before completing; never silently stop repetition.

Tests must cover leap/year limits, late completion, concurrent/stale completion, reopened/edited/deleted/purged successors, invalid linked parents on create/copy/restore, schema bypass rejection, atomic paired timeline rollback and all-table example cleanup/purge ordering. This was a read-only design review; it changes no application behavior and earns no acceptance credit.

## Verification results

Local results2026-11-19:171/171 full unit/PostgreSQL tests;66/66 security (105 unrelated skips);2/2 TR/EN notification browser flows including populated-page axe;2/2 extended20-route TR/EN axe scans;999 bilingual keys, lint, TypeScript and production build passed. Production dependency audit0 and source scan passed. Independent read-only source review found no actionable issues. [Full PostgreSQL16/17 CI44501075727 for ed71674](https://github.com/metodoagency/Metodo_CRM/actions/runs/44501075727) passed:171 unit/integration,66 security and21 browser scenarios per version,999 i18n keys and all quality/build gates. The notification slice is accepted; package15 remains incomplete. No migration, dependency or production change was made for this slice.
