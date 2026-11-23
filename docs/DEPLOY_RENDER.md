# Render Free + existing Supabase

## Owner amendment 2026-11-23 — managed documents and full-match videos

The complete owner instruction in docs/OWNER_EXTENSION_20261123.md and normative docs/MEDIA_VAULT_SCOPE.md are incorporated by reference. This later instruction explicitly replaces earlier Drive-only/no-video-upload requirements. Private managed documents, native designs, clips and full-match uploads are in scope alongside the working external Drive option. Do not remove the safe existing reference path or enable unvalidated generic production uploads. Use per-type validation, private durable storage, actual quota/reservation checks, resumable direct uploads, owner-controlled processing and verified file-object recovery. No unlimited-free-storage claim or paid activation. Preserve all01–66 clauses; append67–72 and milestone M for vault delivery. Earlier54/J and66/L are retained gates; expanded final acceptance also needs72/M. Current ledger10 DONE,5 IN_PROGRESS,57 NOT_STARTED of72; A–J10%, K/L/M0/3, independent private-pilot checklist. Documentation grants no feature acceptance. Commercial scraping/Gmail sending/automatic posting restrictions, human approval, sensitive protections and H real-minor/medical limits stay in force. Original contracts containing prohibited identifiers need local redaction or an explicit owner decision; do not silently store an unmodified copy. Keep signed originals immutable and redacted derivatives separate. Team access is not implicitly added: responsible Person records are not login accounts.


Updated 2026-11-04. Accepted release progress remains10%. A is merged; B is a draft. This guide does not claim a completed production CRM.

## Current resources

Owner amendment2026-11-20: docs/PRIVATE_PILOT_PLAN.md governs the early owner-only pilot. Initial private HTTPS does not wait for Sites/29. Business documents/designs/videos stay as encrypted Drive references; only optimized portraits/logos use private storage. Never enable general uploads to support that exception. Preserve legacy file reads. Verify encrypted recovery and temporary restore before real data. Standard SMTP is unavailable on Render Free; in-app digest plus optional configured local owner-only SMTP helper. Database backups cover references, not Drive contents or image bytes; back up small-image objects separately. All final29/54/66 Sites and security gates remain.

- Service: `the existing free service`, agency account, Free $0/month, Frankfurt.
- Assigned URL: https://metodo-crm.onrender.com . **Not ready:** first container build completed, but boot rejected missing production configuration. HTTPS health and real owner login are not yet verified.
- Dashboard: the existing Render service settings (private dashboard link kept locally)
- Database: approved existing Supabase project `the existing database project`, organization Metodo_CRM, PostgreSQL17.11, Frankfurt. No paid database/add-on.
- Google Cloud project: `the existing CRM OAuth project`, created in the pre-existing authorized Google Cloud account. Render and the application's allowed owner use the agency account. API User Data Policy separately approved2026-11-04. Client creation/configuration pending.
- Database checkpoint2026-11-04: both dedicated roles connect through the session pooler with verified TLS; seven migrations applied and all64 public tables have RLS. No production example seed. OAuth/Render secret configuration still pending, so the assigned URL is not a working release.

## Local commands

Use the existing checkout. Install Node22.12+ or24 with npm. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell), set the owner and local OAuth configuration there, then:

```sh
npm ci
npm run db:up
npm run db:migrate
npm run seed:example
npm run dev
```

Open http://localhost:5173 . The API uses3000. The example seed is fictional and must never be run against production. Tests protect external databases:

```sh
npm test
npm run lint
npm run typecheck
npm run i18n:check
npm run compliance:check
npm run security:check
npm run build
npx playwright install chromium
npm run test:e2e
```

## Complete the existing deployment

1. Keep the service on **Free**, Docker, Frankfurt, manual deployment, health path `/healthz`. Do not import the blueprint to create a duplicate service. `render.yaml` is for a fresh installation or reviewing equivalent settings.
2. Use the existing Supabase project. Runtime uses a TLS-verified pooled PostgreSQL URL; migrations use direct IPv6 or session-pooler IPv4. Obtain the exact host from Connect, not an inferred regional hostname. Use a dedicated server role, separate migration access, and deny anonymous/Data API access to CRM tables. Apply reviewed migrations without seeding examples.
3. Set Render's secret environment fields: `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, two independent32-byte base64 keys (`FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`), and `FIELD_ENCRYPTION_KEY_ID=primary`. Keep credentials out of Git/chat/screenshots. Preserve keys for restore; regenerating them makes old encrypted records unreadable. Both PostgreSQL URLs require `sslmode=verify-full` and an `sslrootcert` path. The reviewed tree contains the public Supabase CA at `config/certs/supabase-prod-ca-2021.crt`; if deploying an older tree without that file, add that public certificate as a Render Secret File and use its absolute `/etc/secrets/` path. Never use `rejectUnauthorized=false` or disable TLS verification.
4. Set `NODE_ENV=production`, `E2E_TEST_MODE=false`, `HOST=0.0.0.0`, `APP_ORIGIN=https://metodo-crm.onrender.com`, `ALLOWED_EMAILS` to the single approved owner, and `GOOGLE_REDIRECT_URI=https://metodo-crm.onrender.com/auth/google/callback`.
5. In Google Auth Platform create a Web client with that exact callback and `https://metodo-crm.onrender.com` origin. Request only `openid email`. Keep the audience/testing user list restricted to the owner; the API additionally enforces the email allowlist. Do not request Gmail scopes for login.
6. Before enabling uploads (package05), configure the private Supabase persistent storage adapter and five-minute downloads. Render's disk is ephemeral; it must not store production user files. Optional AI/SMTP/provider features stay disabled.
7. Deploy only a reviewed commit with successful exact-commit CI. Free has no pre-deploy command; run `npm run db:migrate` from a secured maintenance terminal with the production migration URL before the manual deployment. Never run the test suites or example seed with production URLs.
8. Verify `/healthz`200, real owner login, outsider403, `/auth/test`404, no-store private API, required CSP and absent X-Frame-Options. Verify production privacy acknowledgement before marking package02 complete.
9. Package29 embeds the verified application into the existing Google Sites draft. Check top-level Google sign-in and iframe session refresh. Third-party-cookie blocking must retain the separate-tab fallback. Publish and record both real URLs only after verification.

Render Free sleeps and has transient disk; this is the approved personal-use free delivery, without a24/7 uptime guarantee. Official configuration: https://render.com/docs/blueprint-spec and https://render.com/docs/free .
