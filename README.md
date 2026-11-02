# Metodo CRM

Single-owner football-office CRM. **Milestone A is in progress. This is not a production-complete CRM.** The authoritative specification is [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). See [PROGRESS.md](PROGRESS.md) for observed checks, remaining features and owner prerequisites.

Implemented foundation: React 18/TypeScript/Tailwind shell in Turkish and English; PostgreSQL 16/Prisma schema and migration; club, player, person and request records; transactional suggestions; bidirectional relations; masked timelines; soft deletion/Trash; server-side settings; OIDC flow; encrypted sensitive values; CSRF; secure owner sessions; embedding headers. Later module interfaces are not represented as completed features.

## Local development

Requires Node 22.12+ (or 20.19+/24+) and npm. Docker is preferred for PostgreSQL 16. An existing reachable `DATABASE_URL` is reused; an unreachable external URL is never replaced. If Docker is unavailable, the startup script tries `pg_ctlcluster 16 main start`, then a pinned PostgreSQL 16 binary under `.local/` for unprivileged machines. This is real PostgreSQL, not an in-memory database. The fallback is for development only.

```sh
git clone https://github.com/metodoagency/Metodo_CRM.git
cd Metodo_CRM
git checkout milestone/a-foundation
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

Tests create **separate local databases** `metodo_test` and `metodo_e2e`. They refuse an external database. Browser tests use system Chromium when installed; otherwise run `npx playwright install --with-deps chromium`. The test auth endpoint is registered only in automated test mode, never in production, even if `E2E_TEST_MODE=true` is accidentally set there. Do not enable test mode on a public server. `npm run a11y` checks eight main routes in both languages. `npm run db:stop` stops the development database without deleting data.

## Production deployment: Railway + Supabase PostgreSQL

Do not use this foundation for real medical/guardian records before milestone G is merged. Complete the outstanding security review and feature gates before real business use. No public deployment has been created by this checkout; the live URL is **NOT AVAILABLE** until an owner-authorized hosting project is connected and deployed.

1. Merge only a reviewed milestone PR with green CI. In Railway, create a project and connect `metodoagency/Metodo_CRM` at that approved commit. Railway reads `railway.json` and the multi-stage `Dockerfile`.
2. Create a Supabase PostgreSQL database. Set `DATABASE_URL` to its **pooled** URI and `DIRECT_URL` to its **direct/session** URI for migrations. Preserve provider-required TLS settings and certificate verification. Database passwords stay in provider secret settings.
3. Add these Railway variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `ALLOWED_EMAILS` (your owner email), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `FIELD_ENCRYPTION_KEY_ID=primary`, and `STORAGE_DRIVER=s3`. Each encryption key is an independent 32-byte base64 value. Generate each securely, for example with `openssl rand -base64 32`, and enter it directly into provider secrets. Do not commit keys or paste them into chat. For S3 storage add endpoint, bucket, region and access credentials; the production upload adapter is NOT DONE and uploads remain unavailable.
4. In Railway **Settings → Networking → Generate Domain**, obtain your public HTTPS domain. Set `APP_ORIGIN` to that exact origin and `GOOGLE_REDIRECT_URI` to that origin followed by `/auth/google/callback`. Add the same callback URI in the Google OAuth client. Never use a guessed domain as the live URL.
5. Deploy. Railway's pre-deploy command is `npm run db:migrate`; its start command is `npm start`. Never run the fictional seed in production. The process fails closed if required auth/encryption configuration is missing. Check Railway's deployment logs and `/healthz`.
6. Open the HTTPS URL directly and verify Google sign-in with your allowed email; verify a different email gets 403. In a terminal, run `curl -sSI https://YOUR_ACTUAL_DOMAIN/` and verify the header below and the absence of `X-Frame-Options`. Replace the domain with the actual value from Railway.
7. In Google Sites choose **Insert → Embed → By URL**, paste the verified app HTTPS URL, resize the frame and publish your Google Site manually.

Production serves the built SPA and API from **one origin**. The image includes system Chromium for future Playwright document generation and uses an unprivileged process. It stores no production user uploads on local disk. The API document is generated by zod-to-openapi and available as owner-authenticated JSON at `/api/docs` (core create/list routes; remaining route documentation is pending).

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

- Automated Transfermarkt extraction; automated TFF fetching beyond user-triggered, robots-allowed requests.
- Legal advice, legal conclusions and automated market valuations.
- Automated outbound WhatsApp, SMS, email to contacts, social posting or cold outreach.
- Video storage beyond the optional small-clip module; multi-user roles.
- Real player, club or person data in this repository.

See [Türkçe kurulum](docs/KURULUM-TR.md), [feature matrix](docs/benchmark/feature-matrix.md) and [security threat model](docs/security/threat-model.md).
