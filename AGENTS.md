# Metodo CRM development rules

## 0. Standing rules

- Create AGENTS.md at the repository root. It must contain sections 0, 1, 2, 3, 5 and 11 of this file. Codex follows AGENTS.md on every later change.
- TypeScript everywhere. No plain JavaScript files.
- Never invent real-world data. Real clubs, players, persons, market values, contract dates and coach names must never appear in code, seeds, docs or the README. The only seed data is the example set (section 12). Example names are prefixed "Örnek" or "ÖRNEK", domains use example.com, and every example row has isExample = true. The one exception is the anonymized TFF test fixtures described in M2.
- Every user-facing string comes from the i18n dictionaries (tr and en). Turkish is the default language. A test fails if any key is missing in either language. npm run i18n:check fails if a literal user-facing string appears in JSX without t().
- No Google Apps Script. No localStorage or sessionStorage for business data. Browser storage is allowed only for UI state, such as the last open tab and the theme choice.
- Write tests together with each feature, not at the end.
- You may run out of session time or context before the last milestones are done. Keep the repository runnable at every commit. If you stop mid-milestone, commit work in progress to the milestone branch, write the exact next step in PROGRESS.md, and do not merge.
- If time runs short, prioritize A–F, then the new G, then preserved H–J. Never trade security or data accuracy for feature count. If a feature cannot be built safely, ship a documented stub with a NOT DONE entry in the feature matrix.

## 1. Product principles (non-negotiable)

P1 Provenance. Every externally sourced value stores sourceUrl, sourceType (OFFICIAL, TFF, MEDIA, SOCIAL, MANUAL, AI_EXTRACTED, DATA_PROVIDER, KAP, DOCUMENT), retrievedAt and verificationStatus (VERIFIED, PARTIAL, UNVERIFIED).

P2 Human approval. Automated or AI-extracted changes never write to canonical records. They create an UpdateProposal with approvalStatus PENDING. Only the owner can approve, edit or reject a proposal. Approving as VERIFIED requires a non-empty sourceUrl. The API enforces this, not only the UI.

P3 Fixture source. Fixtures and results (schedule, dates, scores, match status) come only from tff.org. Each league's TFF page URL is stored in Settings. No other site may provide fixtures or results. Performance and statistical data is a separate category, covered in M35: it may come only from a licensed data provider, through a user-supplied file import or an owner-licensed API adapter. Scraping is never allowed.

P4 Data acquisition (SPEC update 1, 2026-11-03). Automated fetching, crawling, scraping or parsing of Transfermarkt and every other commercial site is forbidden under all circumstances. Only owner-triggered TFF checks may fetch pages, after robots.txt permits the target path; failures/disallow fall back to CSV. Never schedule TFF requests. Market values and contracts are manual, with sourceUrl, date and method note. Licensed-provider adapters are deferred: do not implement a provider now. Gmail mailbox ingestion is read-only, filtered by owner rules, and creates proposals with excerpts only. No canonical writes without approval. Local enabled voice transcription covers owner-dictated notes only, never third-party conversations.

P5 Record-keeping only. The contract module shows: "Bu modül kayıt ve takip amaçlıdır, hukuki tavsiye değildir." (EN: "This module is for record-keeping and tracking only and does not constitute legal advice."). The system never produces legal conclusions. Compliance hints appear only as checklist prompts such as "Kontrol edin: ...". The text of those prompts comes from versioned rule files (section 2.9).

P6 Sensitive data. birthDate, phone, email, healthNotes, injuryNotes, guardian contact details, medical records and contract salary are sensitive.
- Masked in the UI by default. Each field is revealed with a click, and the revealed value hides again after 60 seconds.
- Encrypted at rest (section 2.6).
- Excluded from CSV exports and backups unless the owner explicitly opts in.
- Written as "***" in timeline diffs.
- Excluded from AI assistant context unless the owner approves a preview of the exact payload.
- Excluded from share links and CVs unless a specific field is explicitly allowed.

P7 No identity or banking identifiers. Never store national ID numbers (TC kimlik), passport numbers, bank account numbers or payment card numbers. The schema has no fields for them. Professional registration or licence reference numbers are allowed (LicenseRecord).

P8 Timeline. Every create, update, delete, approval, rejection, suggestion, tenure change, CV export, backup, share-link action and outbound draft event writes a TimelineEvent with: actor, timestamp, entity reference, field diffs (old and new values, masked under P6), batchId, and bilingual summaries (summaryTr, summaryEn) generated from templates.

P9 Soft delete and owner-selected retention. Deleted records remain restorable in Trash. Default: no automatic business-data deletion for any table. The owner chooses retention per table and confirms a previewed, versioned purge; every purge is logged. A retention duration alone is not consent to automatic deletion.

P10 Examples. Every example row has isExample = true and a name beginning with "ÖRNEK" or "Örnek". "ÖRNEK veriyi temizle" removes only isExample rows and every dependent row (relations, timeline events, notifications, tasks, attachments, share links, medical records, guardians, deals, commission terms and payment schedules).

P11 Outbound boundary. Nothing sends outbound communication to an external person, club, player, journalist or agency unless the owner presses a button that opens a draft (mailto link, copy to clipboard or share link) and sends it personally. Scheduled jobs send only internal notifications and the owner's own digest to the owner's own address. The codebase contains no automated WhatsApp, SMS, cold email or social-media posting.

P12 Deterministic accuracy. Money, percentages, per-90 values, ages, deadlines and aging buckets are computed with deterministic code under unit tests. Nothing is corrected silently. Implausible inputs are flagged for review.

## 2. Stack, architecture and security baseline

### 2.1 Frontend
React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui or Radix primitives, TanStack Query, React Router, react-hook-form with zod, i18next (tr and en), date-fns with the tr and enUS locales, Recharts, react-leaflet with Leaflet, Lucide icons. World boundaries: Natural Earth 110m countries GeoJSON (public domain), committed under public/geo/ or src/assets/geo/. Fetch it from the public domain source nvkelso/natural-earth-vector (ne_110m_admin_0_countries.geojson) or generate a valid, complete 110m file, and commit it.

### 2.2 Backend
Node 20 or newer, Fastify, TypeScript, zod validation on every route, Prisma ORM. Owner-approved production database: existing Supabase PostgreSQL 17; retain local PostgreSQL 16 and verify compatibility on 16/17 in CI. zod-to-openapi generates the API document, served at /api/docs. pino writes structured logs with redaction (section 2.8).

### 2.3 Authentication
- Single owner. Google OpenID Connect sign-in. Only emails listed in the ALLOWED_EMAILS environment variable may sign in. Everyone else receives 403. Unauthenticated API calls receive 401.
- Server-side sessions: a session table where only the hash of the session token is stored. Absolute lifetime 12 hours. Idle timeout 60 minutes. Session rotated on login. A "sign out of all sessions" action in Settings.
- Session cookie: name with the __Host- prefix, HttpOnly, Secure, SameSite=None, Path=/, no Domain attribute. SameSite=None is required so the app works inside a Google Sites iframe.
- CSRF: SameSite=None weakens CSRF protection, so every state-changing request (POST, PUT, PATCH, DELETE) must carry a CSRF token bound to the session and sent in a request header, and must pass an Origin check against the application's own origin. Requests made from inside the Google Sites iframe carry the application origin, so the allowlist is the application origin only. A cross-origin POST without a valid token returns 403.
- Test-mode auth stub, enabled only with NODE_ENV=test or E2E_TEST_MODE=true, used exclusively for automated integration and Playwright tests.
- Rate limits: 10 requests per minute per IP on authentication routes; 300 requests per minute per session on the API.

### 2.4 Security headers
Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data: blob: plus the tile host used by Leaflet; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors as required by R14. Never send X-Frame-Options. Referrer-Policy: strict-origin-when-cross-origin. X-Content-Type-Options: nosniff. Permissions-Policy disables camera, microphone, geolocation and payment by default. The Google OpenID sign-in uses server-side redirects, so no Google host is needed in connect-src.

### 2.5 Files and storage
- Storage adapter: local disk in development; S3-compatible storage in production (Supabase Storage through its S3-compatible endpoint is the preferred option).
- Upload limit 10 MB per file. MIME allowlist plus magic-byte check. Random storage keys. Original filenames stored as metadata only.
- Photos are resized to a maximum of 1600 px on upload and re-encoded, which strips EXIF and GPS data.
- Download URLs are signed, with a five-minute expiry on S3-compatible storage.
- Optional ClamAV adapter behind a feature flag.
- Match videos are never uploaded. Only external links with timestamp tags are stored.

### 2.6 Encryption
- Field-level encryption with AES-256-GCM and a random 12-byte IV per value. The key comes from FIELD_ENCRYPTION_KEY (32 bytes, base64). Encrypted fields: birthDate, phone, email, healthNotes, injuryNotes, guardian contact fields, medical record summaries, contract salary and bonuses, and mandate commission terms.
- Each ciphertext carries a key id so keys can be rotated. npm run keys:rotate re-encrypts in batches.
- Blind indexes for lookup: HMAC-SHA256 over the normalized value, keyed by BLIND_INDEX_KEY, which is separate from the encryption key. Used for exact-match lookup of email and phone, and for duplicate detection.

### 2.7 Documents
Transfer CV and recommendation dossier are generated server-side as PDF and DOCX from the same template data, in TR and EN. Use Playwright HTML-to-PDF when the host supports Chromium. Otherwise use pdfkit. Implement a clean automatic fallback so PDF generation always succeeds in both environments. Use the docx library for DOCX.

### 2.8 Logging
pino with redaction paths for cookies, authorization headers and every sensitive field (email, phone, birthDate, healthNotes, injuryNotes, guardian.*, contract salary). A test confirms that a sample request log contains none of the redacted values.

### 2.9 Rule files
Legal and regulatory checklist text lives in versioned files under config/compliance/: ffar.json (FIFA Football Agent Regulations checkpoints), tff-menajer.json (TFF agent rules checkpoints) and minors.json (minor-protection checkpoints). Each entry has: id, text (Turkish and English), appliesWhen (a simple condition on application data, such as a player under 18), sourceUrl or the tag "owner-authored", version and reviewedAt. The application renders the text as "Kontrol edin: <text>" when the condition matches. Code never computes a legal outcome. npm run compliance:check fails when an entry lacks version, reviewedAt, or a sourceUrl or owner-authored tag, and when a checkpoint text is phrased as a conclusion. Keep the list of conclusion phrases in the checker, and document it. Every rule file starts as "NOT REVIEWED" until the owner signs off. The Settings page and the final report show that status.

### 2.10 Optional features (all off by default, behind settings flags)
- One-way export of any table to Google Sheets (Google Sheets API).
- AI assistant through a provider adapter (Gemini or OpenAI). The API key comes from the environment only.
- Email digest through SMTP, sent only to the owner's address.
- TCMB daily exchange-rate feed, fetched on a user click under P4.
- Email ingestion through the Gmail plugin only, read-only; sender/domain rules create proposals, never canonical changes or replies.
- Licensed performance-data API adapter (M35), requiring owner credentials.

### 2.11 Scheduling and local development
node-cron runs inside the server for internal notifications. npm run jobs:daily serves an external cron. docker-compose.yml provides PostgreSQL 16. .env.example lists every environment variable.

## 3. Plugins and tooling

Use plugins automatically when they are available. At the start of each milestone, check which tools are available and record the result in PROGRESS.md. If a plugin is unavailable, use the stated fallback.

- GitHub: one branch per milestone (milestone/a-foundation, milestone/b-clubs, and so on). The pull request description contains a test summary table: suite, count, pass or fail, and NOT VERIFIED items. Add .github/workflows/ci.yml, which runs install, lint, typecheck, unit, integration, e2e, i18n:check, compliance:check and security:check. Merge only on green CI.
- Supabase: production PostgreSQL. The runtime uses the pooled connection string. Prisma migrations use the direct connection string, declared as directUrl in schema.prisma. Production files go to Supabase Storage through the S3-compatible endpoint behind the storage adapter. The service-role key is server-only and never reaches the browser bundle. Fallback: any PostgreSQL 16 host, or local PostgreSQL as described below.
- Database start: npm run db:up first checks whether DATABASE_URL is already reachable (connected Supabase or environment variable). If it is not, and the Docker daemon is available, it runs docker compose up. If Docker is unavailable, it starts the local system PostgreSQL service (pg_ctlcluster or service postgresql start), then runs prisma migrate deploy, npm run seed:example, npm test and npm run test:e2e against that instance. If every option fails, mark each dependent test NOT VERIFIED and state the exact error. Never report a pass you did not observe.
- Railway: multi-stage Dockerfile, with Playwright Chromium system dependencies installed in the runtime stage. Provide railway.json, a GET /healthz endpoint, and zod validation of every environment variable at boot (the process exits and lists the missing or invalid variables). JSON logs to stdout. No persistent volumes for user files. Include the deployment guide in the README.
- Playwright: the e2e flows in section 13, plus @axe-core/playwright scans of every main route in both tr and en. Pass criterion: zero serious or critical violations. PDF text-extraction assertions for the CV and profile.
- Figma and Canva: if connected, export the design tokens (colors, type scale, spacing, radii) for the Player Card and the CV into src/design/tokens.ts. If not connected, derive tokens from docs/reference-cv/ when it exists, or from a neutral palette, and log the fallback.
- Google Drive: read docs/reference-cv/ if it exists. If it does not exist, use the M8 section order and record "reference CV not provided" in PROGRESS.md. Never write to Drive without an explicit owner action.
- Google Calendar and Gmail: ICS output conforms to RFC 5545. Include a VTIMEZONE block for Europe/Istanbul, a stable UID per entity, and a SEQUENCE that increments on change. Use METHOD:REQUEST only for invitations the owner sends manually. Email digests use multipart/alternative (plain text and HTML), with no tracking pixels and no remote images.
- Firecrawl or Fetch: development-time TFF fixture capture only (M2). No runtime use.
- Codex Security: run on every milestone pull request. Scope: secrets scan, production dependency audit (npm audit --omit=dev), and review of the authentication, upload, export, share-link and backup code paths. Keep the threat model at docs/security/threat-model.md. Any high or critical finding blocks the merge until it is fixed, or is explicitly accepted in PROGRESS.md with a reason.
- Libraries to add: Vitest, pdfjs-dist or pdf-parse (PDF text assertions), a DOCX XML reader (DOCX assertions), Lighthouse CI with a performance budget for the dashboard, zod-to-openapi.

## 5. Localization, dates, money and search

- Languages: tr (default) and en. Language and theme are stored per user on the server. Light and dark themes are both supported; dark is the default.
- Calendar dates (birth dates, contract dates, meeting dates, deadlines) are DATE columns, not timestamps. Timestamps are used only for audit fields and event times. Display: TR as DD.MM.YYYY, EN as DD MMM YYYY. "Today" always means the calendar date in Europe/Istanbul. Invalid dates are rejected with a message and are never stored silently.
- Money: amounts are stored as DECIMAL(18,2). Exchange rates are stored as DECIMAL(18,6). Never use floating point for money in the database, in calculations or in JSON; serialize amounts as strings. Rounding is half-up to two decimals. Currencies: TRY, EUR, USD, GBP. Every money field has a currency. Finance entries store exchangeRate, exchangeRateDate, rateSource and amountTry. Format with Intl.NumberFormat.
- Exchange rate sources: manual entry, or the TCMB daily feed fetched on a user click under P4. Verify the endpoint at implementation time.
- Search normalizes Turkish characters, so that "Sahin" matches "Şahin", "ISTANBUL" matches "İstanbul" and "Ozel" matches "Özel". Handle the dotted and dotless I explicitly (İ/i and I/ı). Include unit tests for the normalizer covering all six special letters: Ç, Ğ, İ, I, Ö, Ş, Ü and their lowercase forms.
- Every i18n key must exist in both tr and en. A test fails on any missing key.

## 11. Commands

These must work exactly as written.

- npm install
- npm run db:up (section 3, database start order)
- npm run db:migrate
- npm run seed:example
- npm run dev (serves the app at http://localhost:5173 and the API at http://localhost:3000)
- npm test (all unit and integration tests)
- npm run test:e2e (Playwright: login stub in test mode, create a club, create a player, run a suggestion, check the timeline; plus the flows in section 13)
- npm run lint
- npm run build
- npm run i18n:check (fails if a user-facing string literal appears in JSX without t())
- npm run jobs:daily
- npm run compliance:check (validates config/compliance/*.json and fails on missing fields or conclusion-phrased text)
- npm run security:check (production dependency audit, secrets scan, header tests)
- npm run a11y (axe scans of the main routes in tr and en)
- npm run perf:seed (seeds 10,000 fictional players marked isExample = true; refuses to run when NODE_ENV=production)
- npm run keys:rotate (re-encrypts sensitive fields with the newest key id, in batches)
- npm run api:docs (generates the OpenAPI document served at /api/docs)
- npm run export:subject -- --id <id> (writes one person's linked records to ./exports/; owner only; logged)

Use the existing isolated checkout. Do not create worktrees unless explicitly requested.

## SPEC update 1 — 2026-11-03

SPEC.md is the authoritative amendment, incorporated with the full baseline in docs/REQUIREMENTS.md. Its data-acquisition policy overrides all older fetching, RSS, scraping, IMAP and provider implementation instructions. No commercial-site acquisition code, including optional AI page extraction. Licensed providers are deferred, interface only. First-login bilingual privacy notice; per-table owner-selected retention with no automatic deletion by default; value-free sensitive-field view logs; encrypted sensitive backups; breach checklist/contact; per-document consent and exact preview before any external document/audio processing. Local adapters process locally.

Insert a new G after F with G1–G15 and required tests from SPEC.md. Preserve the old G/H/I scopes as H/I/J; do not drop medical/minor, finance or intelligence requirements. Gmail is read-only, sending forbidden. External OCR/transcription/processing is Tier A and needs owner approval per use. Owner-only digest permission does not authorize Gmail sending. Never record third-party conversations. Report progress by accepted milestone gates, with unfinished work explicitly marked; no schema/stub credit as completed features.
