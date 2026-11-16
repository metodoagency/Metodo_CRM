# Metodo CRM

Single-owner football-office CRM. **Milestone A is merged; B is in progress. Accepted scope:10%. This is not a production-complete CRM.** The authoritative specification is [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). See [PROGRESS.md](PROGRESS.md) for observed checks, remaining features and owner prerequisites.

Implemented foundation: React 18/TypeScript/Tailwind shell in Turkish and English; PostgreSQL 16/Prisma schema and migration; club, player, person and request records; transactional suggestions; bidirectional relations; masked timelines; soft deletion/Trash; server-side settings; OIDC flow; encrypted sensitive values; CSRF; secure owner sessions; embedding headers. Later module interfaces are not represented as completed features.

## Local development

Requires Node 22.12 or later and npm. Docker is preferred for PostgreSQL 16. The startup script reuses a reachable `DATABASE_URL`. When the local default needs starting and Docker is unavailable, it tries `pg_ctlcluster 16 main start`, then a pinned PostgreSQL 16 binary under `.local/` for development.

```sh
git clone https://github.com/metodoagency/Metodo_CRM.git
cd Metodo_CRM
git checkout milestone/b-clubs
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run seed:example
npm run dev
```

The Vite frontend uses port 5173; the API uses port 3000. Set your own `ALLOWED_EMAILS`, Google OAuth client ID/secret and redirect URI in `.env` for interactive Google sign-in. Register `http://localhost:5173/auth/google/callback` in your Google Web OAuth client. The seed never grants access to a different email. Development generates private encryption keys under ignored `.local/`; preserve those files to read existing encrypted development records. Never copy development keys into production.

```sh
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
npm run i18n:check
npm run compliance:check
npm run security:check
npm run api:docs
npm run jobs:daily
```

Tests create **separate local databases** `metodo_test` and `metodo_e2e`. They refuse an external database. Browser tests use system Chromium when installed. Install it with `npx playwright install chromium` when needed. The test auth endpoint is registered only in automated test mode, never in production, even if `E2E_TEST_MODE=true` is accidentally set there. Do not enable test mode on a public server. `npm run a11y` checks the main routes and record details in both languages. `npm run db:stop` stops the development database without deleting data.

Player cards offer Turkish and English PDF and Word profiles. Both formats use the same allowlisted profile fields, sources and version metadata. The PDF renderer uses Chromium when available and PDFKit as its local fallback. Private uploads and document processing consent are covered in the [file guide](docs/FILES_AND_PROCESSING.md).

## Production deployment: Render Free + Supabase PostgreSQL17

The owner-approved free service has been created at https://metodo-crm.onrender.com; it is **not ready for login or business use** until database/OAuth/secrets and the health check are verified. Follow [the exact local and deployment steps](docs/DEPLOY_RENDER.md). The optional `render.yaml` describes a fresh free Docker service; do not create a duplicate of the existing service.

A is merged; B stays draft until package11 acceptance. No real minor, medical or guardian production data before H. Google Sites embedding is scheduled for the verified pilot at package29 and final delivery54. See [the54-package ledger](SESSION_PLAN.md) and [current evidence](PROGRESS.md).

## Google Sites embedding

The API and production SPA send:

```text
Content-Security-Policy: ...; frame-ancestors 'self' https://sites.google.com https://*.google.com; ...
```

No `X-Frame-Options` header is sent. Cookies use `__Host-`, HttpOnly, Secure, SameSite=None, Path=/, and no Domain. Mutations also require the application Origin and a session-bound CSRF header. Sessions expire after 12 hours or 60 minutes of inactivity. Settings can revoke all sessions.

Inside an iframe, the login screen displays **Yeni sekmede aç / Open in new tab**. Login takes place at top level. Returning focus to the iframe rechecks the session; a manual retry button is also provided. **Real Google OAuth inside a published Google Site is NOT VERIFIED.** Some browsers block third-party cookies even after top-level login. In that case use the app directly in its own tab; SameSite=None does not override browser privacy policies.

## Encryption and migrations

AES-256-GCM uses fresh 12-byte IVs and binds ciphertext to its model/field. Each value includes its key ID. Sensitive calendar dates are encrypted text rather than plaintext DATE columns; other calendar dates are DATE. Exact date lookup uses a separate keyed blind index. This resolves the specification's encryption/DATE conflict in favor of confidentiality and is recorded in PROGRESS.md.

To rotate: stop application traffic for maintenance, configure a new `FIELD_ENCRYPTION_KEY_ID` and key, retain old keys in `FIELD_ENCRYPTION_PREVIOUS_KEYS` (a secret JSON object of ID to base64 key), keep `BLIND_INDEX_KEY` stable, then run `npm run keys:rotate`. Restart the app with the same new keyring after the command finishes. It processes 100 fields at a time and uses compare-and-set writes. Keep old keys until dependent backups have been handled. Rotation does not currently provide blind-index-key rotation.

Prisma 6.19.3 uses its published WASM migration engine and PostgreSQL adapter. `scripts/migration-adapter.ts` casts one internal catalog-name projection to text, addressing the driver's unsupported PostgreSQL `name` type. It does not alter business data or artifact checksums. `DIRECT_URL` is selected in `prisma.config.ts`; the schema also declares it. Dependency override `deepmerge-ts` uses its patched version; client generation and migrations are regression-tested.

## Regulatory rule files

`config/compliance/ffar.json`, `tff-menajer.json`, and `minors.json` are **NOT REVIEWED**. Their initial owner-authored prompts are review placeholders, not verified regulatory guidance. `compliance:check` validates metadata and blocks conclusion phrases: `is legal`, `is illegal`, `is compliant`, `legally valid`, `is permitted`, `hukuka uygundur`, `hukuka aykırıdır`, `geçerlidir`, `izin verilir`, `yasaldır`. The owner must review and date every rule before it is treated as reviewed.

## Yenilikler

No innovation-layer feature is claimed complete. The foundation provides auditable relations and transactional suggestion events; dashboard recommendations, relationship temperature, PWA and other innovations are tracked in the [feature matrix](docs/benchmark/feature-matrix.md).

## Out of scope

- Automated fetching, crawling or parsing of Transfermarkt or any other commercial site; TFF beyond owner-triggered, robots-allowed checks.
- Legal advice, legal conclusions and automated market valuations.
- Automated outbound WhatsApp, SMS, email to contacts, social posting or cold outreach.
- Video storage (links with timestamps only); multi-user roles.
- Real player, club or person data in this repository.

See [Türkçe kurulum](docs/KURULUM-TR.md), [feature matrix](docs/benchmark/feature-matrix.md) and [security threat model](docs/security/threat-model.md).
