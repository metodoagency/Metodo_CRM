# Foundation threat model

Scope: the current working-tree foundation, including OIDC, sessions, API writes, encryption, timelines, CSV export, relations, Trash and deployment. This is a developer threat model, **not a completed Codex Security scan**.

## Assets and boundaries

- Business data and encrypted personal fields reside in PostgreSQL. The browser receives masked sensitive fields until an explicit reveal. Keys reside in environment secrets in production and ignored private files in development.
- The owner authenticates through Google OIDC. Browser ↔ app, app ↔ Google, app ↔ PostgreSQL, and app ↔ future S3 storage are separate trust boundaries.
- Google Sites is an allowed embedding ancestor, not a trusted write origin. Mutations accept only the application origin and a session-bound CSRF token.
- No automated contact messaging, data scraping or AI calls are implemented.

## Controls exercised by tests

- Allowlist/401/403; production test-auth route absent; secure __Host cookie; token hashes only; encrypted session emails; 12-hour absolute/60-minute idle expiry; revoke-all.
- OAuth state, browser binding, nonce and PKCE; invalid-state callback rejection. Real provider token exchange is NOT VERIFIED without credentials.
- API auth checks use matched route patterns rather than raw URL prefixes. Encoded URL regression cases cannot return unauthenticated business data.
- AES-256-GCM, random IV, authenticated field context, old-key reads and new-key encryption; keyed blind indexes; sensitive timeline masking, CSV exclusions and logged reveal.
- Origin/CSRF rejection; Sites CSP; no X-Frame-Options; logging redaction; strict input schemas; stale-version rejection; real transactional rollback.

## Open items and release gates

1. **Blocked:** completed Codex Security scan. The skill is visible, but scan tools/terminal helpers are absent and its referenced preflight resource returns `failed to read skill resource`. No sealed report or scan identifier is claimed.
2. **Blocked:** Google token exchange, real allowlisted login and third-party cookie behavior in a published Google Site require owner OAuth credentials and a public deployment.
3. **NOT DONE:** full optimistic-lock enforcement on every domain writer and Trash operation; foundation core-record edit/delete/settings paths are covered.
4. **NOT DONE:** production storage adapter, MIME/magic-byte checks, EXIF stripping, signed downloads and medical-access policies. No upload route is exposed. Do not ingest medical/guardian production data before G.
5. **NOT DONE:** owner-reviewed compliance content, complete field-provenance write validation, safe dependent-record purge review, example-data removal, backup/restore, share links and subject export. Unsupported proposal approval fails closed.
6. **NOT DONE:** full OpenAPI coverage and environment-variable validation for every optional adapter. Production core auth/encryption variables are validated.
7. Key compromise requires coordinated database/backups rotation. Blind-index-key rotation is not implemented. Keep encryption keys outside snapshots and review the maintenance workflow before production.
8. Browser dependencies and server dependencies must be audited again on every PR. `security:check` blocks high/critical production advisories; developer-tool audit results are recorded in PROGRESS.md.
9. Only merge after green remote CI, review and a completed milestone. Local passes do not establish GitHub CI status. Never deploy the test stub publicly.

## Recovery

All current business records are fictional. Database migrations are append-only. Soft delete is reversible until a confirmed Trash purge. Preserve encrypted backups and their corresponding old keys; never log keys, cookies or raw sensitive diffs.
