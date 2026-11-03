The repository previously contained no application. This WIP foundation adds a runnable bilingual owner workspace, PostgreSQL schema/migrations and fictional seed, core CRM records/relations, transactional suggestions and the authentication/encryption/embedding boundary.

The API requires an allowlisted owner session and a session-bound CSRF token plus the application Origin for writes. Production sends the Google Sites frame-ancestors policy, never X-Frame-Options, and never exposes the automated test login. Sensitive values are encrypted at rest and masked by default. Unsupported canonical proposal approval is blocked.

This is a draft: milestone A is PARTIAL. Do not merge until the remaining A acceptance gates and review in PROGRESS.md are completed. B–I are not claimed complete.

| Suite | Count / scope | Result |
|---|---|---|
| Unit/integration | 47 tests, 4 files; real PostgreSQL 16 | PASS |
| Browser | 4 flows, including 8 routes × 2 languages for axe | PASS |
| Build | Browser + server | PASS |
| TypeScript/lint | 0 errors/warnings | PASS |
| i18n | 207 paired keys; JSX checker | PASS |
| Compliance | 3 files structurally valid; all NOT REVIEWED | PASS structure |
| Security gate | Secrets/outbound check, production audit 0 advisories, 11 selected security tests | PASS |
| Full dependency audit | 0 advisories including development | PASS |
| Performance | 10,000 fictional players; p95 31.3 ms; 3 index-scan plans | PASS |
| Deployment packaging | Docker build and local production-mode smoke; health/SPA/auth/headers/migrations | PASS |

NOT VERIFIED: remote CI, real Google OIDC, live HTTPS deployment and Google Sites cookie behavior, completed Codex Security scan, managed PostgreSQL/S3/provider connectivity. No public deployment URL exists. Extended E2E/document/medical/financial/share-link workflows are unrun because the modules are not implemented.

See PROGRESS.md for owner inputs, exact failures, assumptions and the next implementation step. README.md and docs/KURULUM-TR.md contain local commands and Railway/Supabase deployment steps. Never run the fictional seed or test auth publicly.
