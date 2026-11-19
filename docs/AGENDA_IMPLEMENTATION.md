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

## Verification

Local results2026-11-19:171/171 full unit/PostgreSQL tests;66/66 security (105 unrelated skips);2/2 TR/EN notification browser flows including populated-page axe;2/2 extended20-route TR/EN axe scans;999 bilingual keys, lint, TypeScript and production build passed. Production dependency audit0 and source scan passed. Independent read-only source review found no actionable issues. Full-browser and PostgreSQL16/17 exact-head CI remain pending for the new checkpoint. No migration, dependency or production change was made for this slice.
