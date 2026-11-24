# Package15 automatic task adapters

Design reviewed2026-11-20; Presentation slice implemented2026-11-24. The other source adapters and full package15/C acceptance remain open. No network acquisition or outbound processing is introduced. See docs/PRESENTATION_TASK_RULE.md for exact rule/cutoff and recovery behavior; immutable PostgreSQL16/17 CI is required before accepting the slice.

## Existing behavior to preserve

| Source | Current behavior |
|---|---|
| Meeting | Explicit signed, expiring, versioned preview/approval creates a Task atomically with the source update and timeline. Generation identity is meeting:id:version; several intentional tasks are possible. |
| Task recurrence | Completion atomically creates one successor. The retained source consumed marker prevents regeneration after successor purge. |
| Coach-departure approval | R1 already creates/logs one HIGH Task due Istanbul today+2 atomically. Proposal payload retains taskId. |
| Presentation | Owner-enabled, default-OFF, signed preview/confirmation; selected historical sources and future writes generate one protected receipt per source/date. Startup/daily catch-up reads stored sources only. Source/API/browser/restore regressions added; exact new CI pending. |
| Contract alert | Current-target deduplicated Notifications exist, Tasks do not. **Missing adapter.** |
| General pending approval | No general review-task rule exists. **Missing adapter.** |
| Blocked transfer step | Source workflow belongs to a later package; do not simulate it now. |

## Next slice: Presentation follow-up

Implement one versioned owner rule, initially OFF. Enabling/backfill shows the rule and exact affected Task drafts before confirmation. Bind owner/session, rule/source versions, target dates, exact payload and expiry. Ordinary rule maintenance must not silently regenerate consumed work. Reuse the strict live Presentation/club/player/contact scope and exclude REJECTED. Task dueDate is followUpDate and recurrence NONE; no invented deadline, legal interpretation or outbound message.

Use one guarded helper in suggestion-created and manual Presentation transactions. The stable identity is owner+ruleId+Presentation UUID+followUpDate. Source/rule versions are evidence, not identity; unrelated edits must not duplicate tasks. Task creation, generation receipt and both relevant timeline events commit atomically with the existing business mutation, without retrying canonical writes. Preserve R3 rollback behavior.

Date changes create a different target occurrence. Preserve previous Task edits, completion, deletion and due date; mark source obsolescence as metadata rather than silently rewriting/closing/deleting it. Restoring the original source date reuses the original receipt. Current-source status must be explainable and owner-only. Invalid dates and unavailable/foreign/deleted parents do not produce work; failures for one source must not hide valid sources or leak values.

## Durable generation receipts

Task.generationKey alone disappears on hard purge. Add a protected internal TaskGenerationReceipt with a unique owner/source/rule/target identity, generated Task UUID, generation-time source/rule versions, example marker and minimal metadata. Store the Task UUID without a Task FK so Task purge leaves deletion protection intact. Its explicitly typed polymorphic reference identifies the source; never pass unknown entity types to the generic delegate.

Receipts survive Task purge and rule disabling. A receipt must not be exposed to ordinary standalone purge while its live source can regenerate work. Classify it as ancillary/protected infrastructure in retention/dependency previews, while source/example cleanup can remove its dependent receipts. Default automatic deletion remains OFF. Apply owner-only database privileges/RLS and update lifecycle, example cleanup and model-count evidence. Package25 backup/restore and G10 checksum verification must preserve receipts, generation keys and recurrence-consumed markers; include these dependencies in that package's acceptance.

## Later adapters

- Contract: one task per contract+kind+target date, aggregating reached threshold notifications. Recheck current live targets. Never consume birthday notifications or copy salary/clauses into task titles.
- Pending approval: separate owner-enabled rule, generic title, no proposal/email excerpt or sensitive value. Preserve existing R1 Task links instead of duplicating them.
- Any additional Meeting scheduling rule needs a distinct declared purpose and owner opt-in; preserve the explicit Meeting command. Transfer-step work follows its real source module.
- Startup/daily catch-up may use stored local canonical data only. Never schedule TFF/commercial acquisition or contact/social sending. Free-host sleep must not lose or duplicate occurrences.

## Required checks

Concurrent/repeated generation; ordinary source/rule edits; source-date change/restoration; REJECTED/deleted/foreign/unavailable parents; owner-edited/completed/deleted Task preservation; hard-purged Task with surviving receipt; rule disabling; stale/replayed enabling previews; atomic rollback including R3; example/source cleanup; no sensitive title/log/export content; receipt/backup metadata preservation. Verify PostgreSQL16/17, owner/CSRF, TR/EN and browser approval/recovery before accepting the slice. Package15/C still requires the other applicable adapters and final security/CI acceptance.
