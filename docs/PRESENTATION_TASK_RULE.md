# Presentation follow-up rule

Implemented2026-11-24 as a partial package15/private-pilot row9 slice. Contract and general approval adapters, full C acceptance and formal security review remain open.

## Owner workflow

Open Tasks → Configure follow-up rule. The default is OFF. Enable future follow-ups, optionally select historical presentations (paged50; maximum100 per confirmation), and preview the exact rule and Task drafts. Nothing creates a Task before confirmation. A preview expires after10 minutes and is bound to the session, settings/rule versions, selected sources/parent versions, consumed receipts and exact Task UUIDs/fields. A changed preview must be rebuilt. Ordinary Settings PATCH cannot enable the rule.

Enabling sets a server UTC cutoff at confirmation. Automatic catch-up includes only sources created at or after that cutoff. Unselected older sources are never swept in silently. Selecting an old source explicitly enrolls it; subsequent follow-up date changes can generate another occurrence. Editing a note on an unenrolled older source does not enroll it. Disabling preserves all tasks/receipts; re-enabling resets the future cutoff and never clears consumed identities.

Tasks use the stored followUpDate, medium priority and no recurrence. Titles contain no free-text notes, contact details or sensitive values. The source and all linked club/player/contact/request records must be live and owned; REJECTED sources are excluded. Legacy invalid/BC/out-of-range dates are skipped individually, preserving valid sources in the same batch. New dates must be0001–9999.

## Transaction and lifecycle

Manual Presentation writes and the existing R3 Suggestion transaction call the same Task factory inside their serializable transaction. Task, receipt, rule/source timeline and existing canonical writes succeed or roll back together. Canonical writes are not automatically retried. A background COMMIT conflict is normalized and can be caught up next time; it never duplicates a committed occurrence.

The stable receipt identity is owner+rule key+Presentation UUID+target date. Source/rule versions are evidence, not identity. The Task UUID deliberately has no FK. Ordinary Task Trash/purge/restore, edited due dates/names, completion and rule changes cannot erase consumption or reopen/regenerate a task. Returning to an earlier source date remains consumed even after that Task was permanently purged. Task details show whether the original source date is current, without rewriting historical work.

TaskGenerationReceipt is protected infrastructure, unavailable to standalone retention purge. Presentation/example dependency cleanup includes it as ancillary data; source purge removes its metadata. It has owner-only privileges/RLS. New receipts and generated tasks inherit example flags/prefixes. All compiled models, including receipts and settings, participate in encrypted pilot recovery and checksums. The restore regression includes a receipt whose Task no longer exists.

Migration016 adds rule settings and receipts. Production migration is not implied by a local source update. Startup and daily catch-up use stored data only; no TFF/Drive/commercial request, social publication or Gmail send is possible in this adapter.

## Evidence

- tests/presentation-tasks.test.ts: default-off/old-source boundary, strict Settings bypass, source/parent/session/TTL/CSRF, tamper/replay/CAS, concurrency/catch-up, purge preservation, example cleanup, changed dates, R3 failure rollback, mixed invalid/valid legacy dates.
- tests/tasks-api.test.ts: existing task/recurrence/Trash behavior.
- tests/recovery.test.ts: actual temporary PostgreSQL restoration with protected receipt/count/checksum preservation.
- tests/e2e/presentation-tasks.spec.ts: TR/EN owner preview/confirm/replay, mobile view and dialog axe.

Exact commit CI/results are recorded in PROGRESS.md. Prior source78bd4a4 passing260 tests is historical evidence, not a pass for this new implementation.
