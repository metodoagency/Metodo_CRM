# Metodo CRM threat model

Updated 2026-11-18. Scope includes OIDC, sessions, API writes, encryption, timelines, exports, relations, Trash, private files, transfer matching, recommendations, presentations, club mandates and sales. Completed scans and their reviewed revisions are recorded in PROGRESS.md. This document describes the system boundaries.

## Assets and boundaries

- Business data and encrypted personal fields reside in PostgreSQL. The browser receives masked sensitive fields until an explicit reveal. Keys reside in environment secrets in production and ignored private files in development.
- The owner authenticates through Google OIDC. Browser ↔ app, app ↔ Google, app ↔ PostgreSQL, and app ↔ future S3 storage are separate trust boundaries.
- Google Sites is an allowed embedding ancestor, not a trusted write origin. Mutations accept only the application origin and a session-bound CSRF token.
- No automated contact messaging, data scraping or AI calls are implemented.
- Transfer matching reads private evidence only after an owner action, returns derived scores with a 60-second display and records field access without values. Matching, sales, presentation and dossier routes retain session, origin and CSRF checks.
- Recommendation documents use an explicit field projection, local offline rendering, linked-record versions and snapshot revalidation before download. Suggestion attachments share the private storage validation and cleanup pipeline and require live linked records. PRIVATE sale fields have no document or CSV projection.
- Club mandates and sales listings are manually entered. Dated mandates determine whether an open listing is usable in the club sales view and matching. Serializable writes check live owner scope, versions and duplicate-open predicates. Presentation matrix queries use parameterized SQL, bounded axes and stable ordering. Notes and private listing amounts are excluded from value logs.

## Controls exercised by tests

- Allowlist/401/403; production test-auth route absent; secure __Host cookie; token hashes only; encrypted session emails; 12-hour absolute/60-minute idle expiry; revoke-all.
- OAuth state, browser binding, nonce and PKCE; invalid-state callback rejection. Real provider token exchange is NOT VERIFIED without credentials.
- API auth checks use matched route patterns rather than raw URL prefixes. Encoded URL regression cases cannot return unauthenticated business data.
- AES-256-GCM, random IV, authenticated field context, old-key reads and new-key encryption; keyed blind indexes; sensitive timeline masking, CSV exclusions and logged reveal.
- Origin/CSRF rejection; Sites CSP; no X-Frame-Options; logging redaction; strict input schemas; stale-version rejection; real transactional rollback.

## Open items and release gates

1. Completed Codex Security scans cover package12 and package13's frozen upload/dossier/write paths; references are in PROGRESS.md. Date/accessibility and transaction follow-ups received separate source reviews. The supplemental transaction diff scan host could not resolve the Git worktree; no supplemental sealed report is claimed. PostgreSQL16/17 CI passed144 tests,52 security tests and17 browser scenarios. Source/dependency checks run in CI.
2. **Blocked:** Google token exchange, real allowlisted login and third-party cookie behavior in a published Google Site require owner OAuth credentials and a public deployment.
3. **NOT DONE:** full optimistic-lock enforcement on every domain writer and Trash operation; foundation core-record edit/delete/settings paths are covered.
4. Private local and S3 storage adapters, MIME/signature checks, photo metadata removal and short-lived signed downloads have local and CI coverage. Production bucket verification and medical-access policies remain pending. Do not ingest medical/guardian production data before H.
5. **NOT DONE:** owner-reviewed compliance content, complete field-provenance write validation, safe dependent-record purge review, example-data removal, backup/restore, share links and subject export. Unsupported proposal approval fails closed.
6. **NOT DONE:** full OpenAPI coverage and environment-variable validation for every optional adapter. Production core auth/encryption variables are validated.
7. Key compromise requires coordinated database/backups rotation. Blind-index-key rotation is not implemented. Keep encryption keys outside snapshots and review the maintenance workflow before production.
8. Browser dependencies and server dependencies must be audited again on every PR. `security:check` blocks high/critical production advisories; developer-tool audit results are recorded in PROGRESS.md.
9. Only merge after green remote CI, review and a completed milestone. Local passes do not establish GitHub CI status. Never deploy the test stub publicly.
10. Serializable transactions can fail at COMMIT. RuntimePg cleans up failed boundaries without lowering isolation or retrying business writes. Only confirmed PostgreSQL40001 conflicts become409; uncertain outcomes stay500. A two-connection PostgreSQL regression checks rollback, pool release and shutdown.
11. Full dependency audit on2026-11-18 reports18 development-chain entries for withdrawn picomatch advisory GHSA-fc5q-39xc-vjpf; production audit is0. Lockfile copies and upstream withdrawal are recorded in PROGRESS.md. No alert was dismissed and no dependency changed. Recheck before dependency changes/final release.

## Recovery

Task checkpoint: strict dedicated routes expose no generation key, owner metadata or private parent fields. A retained source consumed flag and unique successor key are committed with status and both timeline/audit events; reopening/patch/restore never reset the flag, and purged successors cannot reappear. No self-FK/lifecycle cycle. New/copied/restored polymorphic references recheck owner/live canonical parents; existing unavailable references may survive unrelated edits. Task and link DTOs and overview are allowlisted. Example names retain their required prefix. Frozen editor/action versions reject concurrent changes without discarding drafts. Independent read-only review and focused PostgreSQL/browser checks are recorded in PROGRESS.md; full final milestone C security review is still open.

Package15 notification boundary: the first center adapter includes only current owner/live contract deadlines. Birthdays and unknown rules stay outside GET/count/action projections. Status/snooze writes are versioned and serializable, with status/timestamp-only diffs and no business-write retry. Expired snoozes become effectively unread on read, without changing canonical rows or dedupe identities. Current center and overview share the same scope. A read-only source review found no actionable issues; runtime verification is recorded in PROGRESS.md. The complete milestone C security gate is still required.

Package14 surfaces: Contract parent checks include live owner Player and optional Club/Agent. Notes/files/reveals and polymorphic Trash restore use the same guard. DTOs project only allowed fields/JSON keys; salary/bonuses never appear until an audited versioned reveal. Sparse patches preserve unknown legacy data and omitted ciphertext. Both old/new audit sides mask private terms. Background notification retries are idempotent; canonical contract writes do not retry. Source/date/method are manual. No external reader/provider or legal interpretation was introduced. The two scoped backend/UI source reviews and local tests are recorded in PROGRESS.md; exact-head5c516b4 CI44496048310 passed on PostgreSQL16/17 (161 application,60 security,19 browser). Formal diff scan19Nov failed before scan creation because the Windows host did not resolve this worktree; no new sealed report exists. Milestone C merge gate remains open.

All current business records are fictional. Database migrations are append-only. Soft delete is reversible until a confirmed Trash purge. Preserve encrypted backups and their corresponding old keys; never log keys, cookies or raw sensitive diffs.
