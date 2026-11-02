# METODO CRM: COMPLETE BUILD PROMPT

This file is a single, self-contained specification. Use it alone. Do not combine it with earlier drafts. Where any earlier text differs, this file governs.

You are building "Metodo CRM", a production-grade, single-tenant CRM for the office of a FIFA-licensed football agent in Turkey. The only user is the office owner. Build the complete application in this repository, run it, test it, and fix what fails. Do not stop at scaffolding.

Work milestone by milestone (section 10). After each milestone, tests must pass, PROGRESS.md must be updated, and the milestone branch must be merged through a pull request. Do not ask questions during the task. Make reasonable assumptions and record each one under "Assumptions" in PROGRESS.md. If something cannot be run or verified in your environment, say so and mark it NOT VERIFIED. Never mark anything done without running it.

---

## 0. Standing rules

- Create AGENTS.md at the repository root. It must contain sections 0, 1, 2, 3, 5 and 11 of this file. Codex follows AGENTS.md on every later change.
- TypeScript everywhere. No plain JavaScript files.
- Never invent real-world data. Real clubs, players, persons, market values, contract dates and coach names must never appear in code, seeds, docs or the README. The only seed data is the example set (section 12). Example names are prefixed "Örnek" or "ÖRNEK", domains use example.com, and every example row has isExample = true. The one exception is the anonymized TFF test fixtures described in M2.
- Every user-facing string comes from the i18n dictionaries (tr and en). Turkish is the default language. A test fails if any key is missing in either language. npm run i18n:check fails if a literal user-facing string appears in JSX without t().
- No Google Apps Script. No localStorage or sessionStorage for business data. Browser storage is allowed only for UI state, such as the last open tab and the theme choice.
- Write tests together with each feature, not at the end.
- You may run out of session time or context before the last milestones are done. Keep the repository runnable at every commit. If you stop mid-milestone, commit work in progress to the milestone branch, write the exact next step in PROGRESS.md, and do not merge.
- If time runs short, the priority is: milestones A to F first, then G, then H, then I. Never trade security or data accuracy for feature count. If a feature cannot be built safely, ship a documented stub with a NOT DONE entry in the feature matrix.

---

## 1. Product principles (non-negotiable)

P1 Provenance. Every externally sourced value stores sourceUrl, sourceType (OFFICIAL, TFF, MEDIA, SOCIAL, MANUAL, AI_EXTRACTED, DATA_PROVIDER, KAP, DOCUMENT), retrievedAt and verificationStatus (VERIFIED, PARTIAL, UNVERIFIED).

P2 Human approval. Automated or AI-extracted changes never write to canonical records. They create an UpdateProposal with approvalStatus PENDING. Only the owner can approve, edit or reject a proposal. Approving as VERIFIED requires a non-empty sourceUrl. The API enforces this, not only the UI.

P3 Fixture source. Fixtures and results (schedule, dates, scores, match status) come only from tff.org. Each league's TFF page URL is stored in Settings. No other site may provide fixtures or results. Performance and statistical data is a separate category, covered in M35: it may come only from a licensed data provider, through a user-supplied file import or an owner-licensed API adapter. Scraping is never allowed.

P4 Lawful fetching. Every external page fetch is user-triggered and never scheduled. Before any fetch, check robots.txt for the target path and stop if it is disallowed. Send an identifying User-Agent. Rate limit: at most one request per 3 seconds per host. Cache responses for 6 hours. If a fetch is disallowed or fails, fall back to manual CSV import with a downloadable template. Transfermarkt: no automated fetching of any kind. The "Transfermarkt'ta aç" button opens the profile in a new tab. The owner types the market value, which is stored with amount, currency, date and source URL. No scraping of any financial, competitor or media site.

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

P9 Soft delete everywhere. Deleted records go to a Trash view where they can be restored. Permanent deletion happens only from Trash, either manually or after 30 days. Category-specific retention can shorten or extend that period in Settings, but never removes a row without a logged purge.

P10 Examples. Every example row has isExample = true and a name beginning with "ÖRNEK" or "Örnek". "ÖRNEK veriyi temizle" removes only isExample rows and every dependent row (relations, timeline events, notifications, tasks, attachments, share links, medical records, guardians, deals, commission terms and payment schedules).

P11 Outbound boundary. Nothing sends outbound communication to an external person, club, player, journalist or agency unless the owner presses a button that opens a draft (mailto link, copy to clipboard or share link) and sends it personally. Scheduled jobs send only internal notifications and the owner's own digest to the owner's own address. The codebase contains no automated WhatsApp, SMS, cold email or social-media posting.

P12 Deterministic accuracy. Money, percentages, per-90 values, ages, deadlines and aging buckets are computed with deterministic code under unit tests. Nothing is corrected silently. Implausible inputs are flagged for review.

---

## 2. Stack, architecture and security baseline

### 2.1 Frontend
React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui or Radix primitives, TanStack Query, React Router, react-hook-form with zod, i18next (tr and en), date-fns with the tr and enUS locales, Recharts, react-leaflet with Leaflet, Lucide icons. World boundaries: Natural Earth 110m countries GeoJSON (public domain), committed under public/geo/ or src/assets/geo/. Fetch it from the public domain source nvkelso/natural-earth-vector (ne_110m_admin_0_countries.geojson) or generate a valid, complete 110m file, and commit it.

### 2.2 Backend
Node 20 or newer, Fastify, TypeScript, zod validation on every route, Prisma ORM, PostgreSQL 16. zod-to-openapi generates the API document, served at /api/docs. pino writes structured logs with redaction (section 2.8).

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
- Email ingest through IMAP, read-only (M38).
- Licensed performance-data API adapter (M35), requiring owner credentials.

### 2.11 Scheduling and local development
node-cron runs inside the server for internal notifications. npm run jobs:daily serves an external cron. docker-compose.yml provides PostgreSQL 16. .env.example lists every environment variable.

---

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

---

## 4. Deployment and Google Sites embedding

- The app is served over HTTPS at a stable URL.
- Send Content-Security-Policy: frame-ancestors 'self' https://sites.google.com https://*.google.com. Never send X-Frame-Options: DENY.
- Sign-in must work when the app is opened inside an iframe. If Google sign-in is blocked in an iframe, detect it (window.self !== window.top) and show a button "Yeni sekmede aç" (EN: "Open in new tab"). That button performs the login at top level and then refreshes or notifies the iframe session. Document the result in the README.
- Write a deployment guide for Railway (railway.json, Dockerfile) with managed PostgreSQL on Supabase (or Neon). Keep it minimal and actionable. Also write a Turkish setup guide.

---

## 5. Localization, dates, money and search

- Languages: tr (default) and en. Language and theme are stored per user on the server. Light and dark themes are both supported; dark is the default.
- Calendar dates (birth dates, contract dates, meeting dates, deadlines) are DATE columns, not timestamps. Timestamps are used only for audit fields and event times. Display: TR as DD.MM.YYYY, EN as DD MMM YYYY. "Today" always means the calendar date in Europe/Istanbul. Invalid dates are rejected with a message and are never stored silently.
- Money: amounts are stored as DECIMAL(18,2). Exchange rates are stored as DECIMAL(18,6). Never use floating point for money in the database, in calculations or in JSON; serialize amounts as strings. Rounding is half-up to two decimals. Currencies: TRY, EUR, USD, GBP. Every money field has a currency. Finance entries store exchangeRate, exchangeRateDate, rateSource and amountTry. Format with Intl.NumberFormat.
- Exchange rate sources: manual entry, or the TCMB daily feed fetched on a user click under P4. Verify the endpoint at implementation time.
- Search normalizes Turkish characters, so that "Sahin" matches "Şahin", "ISTANBUL" matches "İstanbul" and "Ozel" matches "Özel". Handle the dotted and dotless I explicitly (İ/i and I/ı). Include unit tests for the normalizer covering all six special letters: Ç, Ğ, İ, I, Ö, Ş, Ü and their lowercase forms.
- Every i18n key must exist in both tr and en. A test fails on any missing key.

---

## 6. Domain model

### 6.1 Common columns on every business table
id (UUID), ownerId, createdAt, updatedAt, deletedAt, createdBy, updatedBy, version (integer for optimistic locking; a write with a stale version returns 409), isExample.

### 6.2 Entities
Names are indicative. Keep them consistent across schema, API and UI.

- Continent (name)
- Country (isoCode, isTracked, lat, lng)
- Region (country, name, optional polygon key)
- League (country, tier, ageCategory one of A, PGL, U19, U18, U17, U16, U15, OTHER, tffPageUrl)
- Club (name, shortName, country, region, city, lat, lng, stadium, foundedYear, websiteUrl, socialLinks, relationStatus NEW | WARM | ACTIVE | COLD, isTracked, tffCoachPageUrl)
- AgeTeam (club, ageCategory, league)
- Person (name, role enum, country, phone, email, birthDate, hideBirthYear, transfermarktUrl, tffProfileUrl, relationStatus, notes)
- Agent (name, agency, countries, markets, relationStatus, networkMemberships), with a link to LicenseRecord
- Player (status OWN | TARGET | INTERMEDIARY | MANDATED; name; photo with photoSourceUrl and photoRightsNote; birthDate; nationalities; euPassport; heightCm; weightKg; primaryPosition; secondaryPositions; preferredFoot LEFT | RIGHT | BOTH; currentClub; currentLeague; contractEndDate; marketValue {amount, currency, date, sourceUrl}; transfermarktUrl; levelScore; levelSubscores; agent (for INTERMEDIARY); availability AVAILABLE | INJURED | SUSPENDED | UNAVAILABLE with availabilityUntil; strengths; weaknesses; bio (sanitized rich text); notes)
- Mandate (player, club, exclusive flag, scope, startDate, endDate, documentRef, commissionTerms as validated JSON)
- Contract (player, club or agent, type, signedDate, startDate, endDate, salary {gross | net, amount, currency, period}, bonuses, paymentDay, releaseClause {amount, currency, validFrom, validTo, conditions, met YES | NO | UNKNOWN}, buyout, extensionOption, noticeDeadline, representation {scope, startDate, endDate, commissionRate, paymentTerms}, documentLink)
- Guardian (player, name, relation, contact fields, parental consent document reference)
- MedicalRecord (player, date, type CHECK | INJURY | REHAB | CLEARANCE, resultCategory FIT | CONDITIONAL | UNFIT | UNKNOWN, summary, returnDate, attachment; always restricted)
- MedicalAccessLog (actor, timestamp, record, action VIEW | REVEAL | EDIT | EXPORT)
- ImageRightsAgreement (player, exclusive flag, territories, media types, startDate, endDate, fee, status)
- PerformanceRecord (player, matchRef, date, opponent, league, minutes, position, GPS metrics, avgHr, maxHr, clips, photos, tacticalDesignFile)
- DataImport (provider, licenseNote, mappingProfileId, rowCount, status, importedAt)
- PlayerStat (player, season, competition, statKey, value, minutes, sourceImportId)
- Request (club, requester person, position, ageMin, ageMax, preferredFoot, euRequired, preferredCountries, preferredLeagues, salaryMax, feeMax, profileText, tags, priority, deadline, status OPEN | MATCHED | SUGGESTED | CLOSED)
- Suggestion (request, player, club, person, date, matchScore nullable, fitReasons, missingCriteria, whyGoodTransfer, coverNote, status)
- SalesListing (player, club, askingAmount, currency, confidentiality PRIVATE | CLUB_ONLY | SHAREABLE, scope, status, interestedClubs)
- Presentation (date, club, person, player, request, channel IN_PERSON | EMAIL | MESSAGING | VIDEO, result PENDING | INTERESTED | OFFERED | REJECTED | WAITING, followUpDate, note)
- Meeting (title, date, time, durationMin, locationOrUrl, participants of any entity type, agenda, notes, outcome)
- Task (title, priority, dueDate, status, recurrence NONE | WEEKLY | MONTHLY, relatedEntity)
- Match (league, season, week, date, time, stadium, homeTeam, awayTeam, score, status, source, lastCheckedAt)
- ScoutReport (matchDate, league, stadium, teams, minutesWatched, player (nullable), freeName, relationType OWN | INTERMEDIARY | TARGET | EXTERNAL, positionWatched, performanceScore 0 to 10 in 0.5 steps, strengths, weaknesses, tierSuitability, opinion, scoutPerson)
- ScoutAssignment (scout, match, status, report link)
- ExpenseClaim (scout, amount, currency, date, receiptAttachment, status)
- WatchlistEntry (player, status WATCH | FOLLOW_UP | SHORTLIST | DROPPED, notes)
- Event (name, dateFrom, dateTo, city, country, attendanceStatus CONSIDERING | ATTENDING | ATTENDED | NOT_ATTENDING, budget, actualCost, currency, accommodation, transport, organizer, participantCount, valueRating, files, notes)
- Speaker (event, person, club, role, topic, session, sessionTime, moderator, fee, expenses, currency, pipelineStatus CANDIDATE | INVITED | DISCUSSED | ACCEPTED | DECLINED | CONFIRMED | ATTENDED, accommodationStatus, flightStatus, relationNote)
- Source (name, type, url, trustLevel OFFICIAL | MEDIA | SOCIAL_VERIFIED, scanMethod MANUAL | RSS | PAGE_CHECK, linkedClubs)
- UpdateProposal (date, targetType, targetId, type, summary, sourceUrl, sourceType, verificationStatus, approvalStatus PENDING | APPROVED | REJECTED, payload JSON, reviewedAt)
- Tool (provider, plan, fee, currency, renewalDate, owner, users, demoRep, demoDate, demoNotes, decision ACTIVE | TRIAL | CANCELLED, usageNotes)
- OutsourceContact (name, role, workType EMPLOYEE | FREELANCE | PROJECT, projects, deliverables, dueDate, paymentPlan, contact)
- FinanceEntry (date, type INCOME | EXPENSE, category, amount, currency, exchangeRate, exchangeRateDate, rateSource, amountTry, invoiceNo, paymentStatus, linkedEntity)
- WorkLog (date, summary, category, durationMin, linkedEntities, status)
- Relation (fromType, fromId, toType, toId, relation, role, startDate, endDate, note)
- Deal (type TRANSFER | MANDATE | SPONSORSHIP | SPEAKING | SCOUTING_SERVICE | OTHER, stage, probability 0 to 100, expectedAmount with currency, closeDate, lostReason; linked entities through Relation)
- CommissionTerm (deal, payer, basis FIXED | PERCENT_OF_FEE | PERCENT_OF_SALARY, rate, fixedAmount, currency, vatRate, splitGroup)
- PaymentSchedule (commissionTerm, dueDate, amount, currency, paidAt, paidAmount, invoiceNo, status)
- TransferProcess (deal, ordered steps; each step has status OPEN | DONE | BLOCKED, owner, dueDate, documentReference, blockedReason)
- ClubStakeholder (club, person, stakeholderRole SPORTING_DIRECTOR | CEO | TECHNICAL_DIRECTOR | CHIEF_SCOUT | HEAD_COACH | MEDICAL | FINANCE | MEDIA | OTHER, influence 1 to 5, relationshipOwner, notes)
- ClubFinancialProfile (club, period, metric, value, currency, sourceUrl, retrievedAt, verificationStatus)
- TransferWindow (country, league, opensOn, closesOn, sourceNote)
- LicenseRecord (holder owner or agent, issuer, referenceNo as a professional registration reference, issuedAt, expiresAt, attachment)
- Case (type FIFA_DRC | TFF | CAS | LABOUR_COURT | CRIMINAL_COMPLAINT | OTHER, parties, filedAt, nextDeadline, counselName, status, outcome; documents through Attachment)
- Template and TemplateVersion (kind CONTRACT | LETTER | OUTREACH | PRESS, locale, body with typed placeholders, version, approvedBy, approvedAt)
- ShareLink (scope PLAYER_PROFILE | CV, entityId, tokenHash, expiresAt, passcodeHash optional, recipientName, viewCount, lastViewedAt, revokedAt, fieldAllowlist)
- MediaContact (person with role MEDIA, outlet, beat, notes)
- PressItem (title, status DRAFT | APPROVED | PUBLISHED_MANUALLY, body, scheduledDate, approvedBy)
- Attachment, SavedView (per user per table), UserSettings, AuditLog (with actor, action, entity, reason, IP hash), TrashEntry, TimelineEvent, Notification (type, entity, targetDate, thresholdDays, dedupeKey, status NEW | READ | SNOOZED, snoozedUntil)
- Tool subscription records are part of Tool; there is no separate entity.

### 6.3 Relation types
memberOf, representedBy, intermediaryFor, sellingFor, mandatedBy, suggestedTo, presentedTo, invitedAs, attendee, contactOf, worksWith, partnerOf, usesTool, hiredBy, speakerAt, organizedBy, scoutedAt, linkedTo, stakeholderOf, dealWith, guardianOf, licensedAs.

Every relation can be read from both ends. The UI groups them as "Giden" and "Gelen" (EN: "Outgoing" and "Incoming"), with human-readable labels in both languages.

### 6.4 Positions
GK, CB, FB, DM, CM, AM, WF, CF. FB covers LB and RB. WF covers LW and RW. Each position has three sub-criteria, defined in code with labels in the dictionary. Default set (editable in Settings): GK = Kurtarış, Ayak ile Oyun, Çıkış; CB = İkili Mücadele, Geriden Oyun Kurma, Pozisyon Alma; FB = Hücum Katkısı, Savunma Pozisyonu, Hız; DM = Top Kazanma, Pas Dağılımı, Pozisyon Alma; CM = Oyun Kurma, Kazanma, Kat Etme; AM = Yaratıcılık, Bitirme, Son Pas; WF = Bire Bir, Bitiriş, Katılım; CF = Bitiriş, Hava Oyunu, Hareket.

### 6.5 Indexes
Index every foreign key, every (ownerId, deletedAt) pair, every date column used by a deadline query, and every blind index. A performance test runs EXPLAIN on the three busiest list queries against 10,000 seeded players. It reports the plan and fails when a sequential scan runs over a table with more than 1,000 rows.

---

## 7. Modules

Conventions for every module: bilingual labels, timeline events, soft delete, provenance for every external value, masking for sensitive fields, and tests written with the feature.

### Core modules (M1 to M25)

M1 Club Network and Map
- Left panel: a tree of continent, country and region, with a club count at each level. Main area: a world map (Leaflet, Natural Earth 110m). Clicking a country filters the view. Clicking a region filters further where polygons exist, otherwise a region list is shown.
- Only clubs with coordinates appear as map markers. Clubs without coordinates appear in the list with "Konum eklenmedi". Never place markers at random.
- Club page tabs: Overview, Staff (tenure timeline), Age teams, Players (suggested, sales list, mandated), Requests, Updates, Relationship timeline (first contact, meetings, presentations, status changes), Meetings, Notes, Sources, Stakeholders (M34), Financial profile (M43).
- "Kaynakları takip et": lists the sources linked to the club, each opening in a new tab. If RSS is configured, a user click fetches the latest items and creates UpdateProposals.
- Relationship status changes are logged to the timeline.

M2 Agenda and Fixtures
- Agenda: day, week and month views. Meetings have participants of any entity type. Meetings can create tasks. ICS export (RFC 5545). Overlays for birthdays, contract deadlines, transfer windows, licence renewals and scout assignments.
- Fixtures: tabs for Süper Lig, TFF 1. Lig, TFF 2. Lig, TFF 3. Lig, PGL, U19, U18, U17, U16 and U15. Each row shows "Kaynak: TFF · son kontrol: <date>". The "Kontrol et" action runs the TFF check for that league, user-triggered, respecting P3 and P4.
- The parser is a separate module, tested offline against saved HTML fixtures in tests/fixtures/tff/. Parser failure shows the CSV import option with the template.
- Every match row must have source = TFF and a leagueId. Other sources are rejected (R9).
- Fixture capture (development time only): capture HTML once with Firecrawl or Fetch, then anonymize before committing. Replace team, stadium, city and person names with "Örnek" placeholders. Keep tag names, class names and attribute names unchanged so the parser is tested against a realistic structure. Commit only the minimal fragments the parser needs, not full page copies. Record the capture date and the source URL in tests/fixtures/tff/README.md.
- Filters: team, date range, followed clubs only (followed matches are highlighted). Example query: "bu hafta takip ettiğim kulüplerin maçları" (EN: "followed clubs' matches this week").

M3 Club Updates and Sources
- Sources registry: name, type, URL, trust level, scan method, linked clubs.
- Update types: head coach change, management change, transfer, injury, league or category change, stadium, commercial, other.
- Proposals queue on the dashboard and on its own page. Actions: Approve (asks for sourceUrl), Edit then approve, Reject with reason.
- Approving a coach departure runs R1.

M4 TFF Coaching Staff
- Per club: person, role (head coach, assistant, goalkeeper coach, youth coordinator, other), startDate, endDate, source, verificationStatus.
- "Kontrol et" is available only for tracked clubs. Differences become UpdateProposals.

M5 Player Database with four panels
- One Player table with four panels: OWN, TARGET, INTERMEDIARY and MANDATED. Moving a player between panels changes status and writes to the timeline.
- Columns: photo, name, age, position, club, league, level score, league suitability, market value, contract end, availability, status. Sort, filter, saved views, bulk tagging, CSV export without sensitive fields.

M6 Player Card and Profile
- Printable infographic card: photo, name, age, nationality and EU status, height and weight, positions, foot, club and league, contract end, market value, level score, suitability tier.
- Level score: 1 to 10 in 0.5 steps, with sub-criteria per position (section 6.4). Weights are configurable. History chart. Each change is logged with date and note.
- League suitability tiers are configurable in Settings: tier number, minScore, maxAgeDiff. Default tiers are labeled EXAMPLE. Each tier yields SUITABLE, CLOSE or UNSUITABLE, with a reason.
- Market value: manual entry with date, currency and source URL. History chart. "Transfermarkt'ta aç" button.
- "Genel bilgiler" free-text rich editor (headings, bold, italic, lists, links). Sanitize the HTML.
- Standard profile generator: fixed template in TR and EN, exported as PDF and DOCX.

M7 Contracts and Legal Tracking
- Contract records for OWN and INTERMEDIARY players, with every field in the model. A player can have several contracts; the active one is flagged.
- Deadlines: contract end, release clause window, buyout window, extension deadline, notice deadline, representation end, commission payment day. Default alerts at 180, 90 and 30 days, configurable.
- If the player is under 18 on today's date, show the checklist prompt: "FIFA RSTP Madde 19 kapsamını kontrol edin." (EN: "Check compliance with FIFA RSTP Article 19."), together with the matching checkpoints from config/compliance/minors.json.
- Notes and attachments per contract. The module statement from P5 is shown on the contract screen.

M8 Post-Match Data and Transfer CV
- PerformanceRecord per player per match: match reference, date, opponent, league, minutes, position, GPS metrics, heart rate, clip links with timestamps and tags, photos, tactical design files.
- GPS CSV import: upload, a column mapping screen (saved per provider), preview, then import. Invalid rows are listed with line numbers. Computed metrics: total distance, distance per minute, HSR distance and count, sprint distance and count, maximum speed, average speed. Charts per player over time.
- Clips: external URL (Drive, Vimeo, YouTube unlisted), timestamp, tag (pres, pozisyonel, bitiriş, savunma, and others defined in the dictionary).
- Transfer CV generator, TR and EN, with sections in this order: 1 identity and squad; 2 positional roles (6-8-10 mapping); 3 playing style and tactical profile; 4 GPS summary; 5 season statistics (manual input); 6 clips list; 7 photos.
- Contract and salary sections are excluded by default. An explicit checkbox includes them, and a warning is shown when it is checked.
- Footer: data pull date and version number. Version history is stored. Each export is logged to the timeline.
- Reference layout: if docs/reference-cv/ exists, read it and match its section order and visual hierarchy. If it does not exist, use the order above and record "reference CV not provided" in PROGRESS.md.

M9 Club Transfer Requests
- Fields as in the Request model. Kanban view by status and a list view. Each request links to its club, requester and suggestions.

M10 Matching and Recommendation File
- Matching engine: a pure function with unit tests. Score 0 to 100 from weighted criteria:
  - position: primary position full, secondary partial
  - age: within the range full, within one year outside the range partial, otherwise 0
  - preferred foot
  - EU or passport requirement
  - salary against budget (its own criterion)
  - fee against budget (its own criterion)
  - level score against thresholds
  - contract availability relative to today: ends within 6 months full, within 12 months partial, longer 0 and listed as missing
- Missing data: a criterion whose input is missing is not scored. It is listed as "Eksik veri" (EN: "Missing data"). The total is normalized over the scored criteria, and the result shows coverage in percent.
- Each result shows fit reasons and missing criteria. Results are sortable.
- Weights are editable in Settings. Results recalculate when weights change.
- Suggestion flow: select player, select club (from the request), select person (picker limited to that club, defaulting to the requester), write the reason (templates optional), attach files, generate the recommendation dossier (PDF and DOCX). Saving a suggestion runs R3.
- The match score is never defaulted. If the owner leaves it blank, the field stays empty and a warning is shown.

M11 Club Sales List
- SalesListing links to the existing player record. No duplicate players. Only players with a club mandate can be listed.
- Confidentiality controls what exports and CVs contain. PRIVATE is excluded from every export.

M12 Presentation Matrix
- Presentation log with channel and result. Matrix views: club by player, and person by player. Each cell shows the latest result, colored. Overdue follow-ups appear on the dashboard.

M13 Agent Network
- Agent records, markets, relationship status, history and shared players. World map view using the M1 map component, listing agents per country. Agent detail shows shared players and intermediary relations.

M14 Person Directory and Network
- Person cards with roles and club tenures (memberOf relations with start and end dates).
- "Birlikte çalıştı" (EN: "Worked together"): people with overlapping tenure at the same club, shown with the club and the overlap period.
- Profile URL fields (Transfermarkt, TFF): "Bilgileri getir" opens the page in a new tab. The owner copies the fields manually. Optional AI extraction, enabled by a consent flag, creates UpdateProposals and never writes directly.

M15 Birthdays and Relationship Care
- Birthday calendar for persons, players and agents. Reminders at 30, 7 and 0 days (configurable). "Bu ay doğum günleri" list. Greeting notes and a "gönderildi" marker per year. An option to show only day and month. Manual "significant dates" (anniversaries and similar) can be added.

M16 Football Tools
- Tool subscriptions (Sportsbase, Wyscout, Comparisonator and others): provider, plan, fee, currency, renewal date, owner, users, usage notes.
- Demo calls with sales representatives: rep, date, notes, next step, decision (ACTIVE, TRIAL, CANCELLED).
- Renewal reminders at 30 and 7 days. Links to finance entries.

M17 Metodo Operations and Finance
- Outsource contacts (graphic designer, scout, assistant): role, work type, projects, deliverables with due dates, payment plan.
- Ledger: income and expense with currency, rate, rate date, TRY equivalent, invoice number, payment status and linked entity.
- Reports by person, project, category and period, per currency. CSV and PDF export. Scouts link to their scout reports.

M18 Events Tracker
- Events: WFS, Football Forum Hungary, Deal Done Serbia, and any user-added event. Fields as in the Event model.
- Comparison table sorted by cost, participant count and value rating.

M19 Deal Done Serbia Speakers Panel
- A dedicated page scoped to the Deal Done Serbia event.
- Pipeline: CANDIDATE, INVITED, DISCUSSED, ACCEPTED or DECLINED, CONFIRMED, ATTENDED. Each transition is dated and logged.
- Speaker card: linked person, club, role, topic, fee, expenses, accommodation and flight status, relation note, files.
- Program view: session, time, speaker, moderator. Reminders before sessions.
- Task generator: invitation message, follow-up, flight details, confirmation.

M20 Scout Reports
- Report fields as in the ScoutReport model. A free-name player can be promoted to a Player record.
- Performance score 0 to 10 in 0.5 steps.
- Dashboard shows recent reports and top-scored players.

M21 Work Log
- Daily entries: date, text, category (transfer, meeting, scout, admin, finance, communication, other), duration, linked entities, status.
- Retroactive entries are allowed. Edits are logged.
- Views: day, week and month. Time-per-category chart. CSV export.

M22 Q&A Assistant
- Layer 1, structured queries with filters. Examples: "sözleşmesi 30 gün içinde bitenler" and "Y kulübüne son 6 ayda önerilen oyuncular".
- Layer 2, natural language, answered by the AI adapter using only retrieved records as context.
- Every answer lists its source records as links.
- When nothing is found, answer "Bu bilgi uygulamada kayıtlı değil" (EN: "This information is not recorded in the application") and name the missing field.
- Sensitive fields are excluded from context. A contact request ("X kişisine nasıl ulaşabilirim") shows contact fields only after the owner clicks reveal in the answer.
- Query history is optional and off by default. R13 applies.

M23 Media and Clips
- External clip links with timestamp tags (see M8).
- Photo gallery per player: resized photos with capture date and source.
- Optional small clip upload: MP4 or MOV, maximum 5 MB, disabled unless storage is configured, with an auto-delete date field. Off by default.

M24 Dashboard, Tasks and Notifications
- Widget grid: drag to reorder, show and hide, layout stored per user. Widgets: today's tasks; meetings today and this week; birthdays in the next 30 days; contract and release deadlines; open requests and pipeline summary; this week's fixtures (followed clubs highlighted); followed clubs' latest updates; pending proposals count; overdue presentation follow-ups; recent scout reports; work log summary; blocked transfer steps; expiring licences; overdue commissions.
- Notification center with a bell icon: read, snooze 1 day, snooze 7 days.
- Tasks: priority, due date, linked entity, recurrence. Tasks are generated automatically from meetings, presentations, contract alerts, approvals and blocked transfer steps.

M25 Settings, Backup and Admin
- Settings: notification thresholds; level weights and sub-criteria; league tiers; matching weights; TFF page URLs per league and for Teknik Adam; sources registry; retention settings (section 7.M44); feature flags (Google Sheets export, AI provider and consent, email digest, TCMB, IMAP, data provider adapter); rule-file status.
- Backup: full JSON export. Sensitive fields are excluded unless the owner checks the box. Optional passphrase encryption with AES-256-GCM and a key derived by scrypt, with the salt and parameters stored in the header.
- Restore: upload, then preview (per table: added, updated, unchanged), then confirm. R12 applies.
- Duplicate scan: pairs with the same normalized name, or the same birth date and club (matched through blind indexes). A merge creates a proposal. The owner chooses the surviving record and the value of each field. The merge is logged.
- CSV import per table: template download, column mapping, preview, row errors with line numbers, idempotent by id or natural key.
- Trash: restore or purge.
- Audit log view.

### Extended modules (M26 to M45)

M26 Deal Pipeline and Commission Forecast
- Kanban board by stage for each deal type. Stages per type are defined in configuration.
- Each deal carries a probability, an expected amount in its own currency, and a close date. The weighted forecast is shown by month and currency. TRY totals use the stored TRY equivalent.
- Closing a deal requires a win or loss reason.
- Acceptance: forecast totals equal the sum of weighted amounts. The API rejects closing a deal without a reason.

M27 Commission Ledger and Receivables
- Commission terms per deal (R16). Payment schedules with installments. A VAT toggle per term, with the rate in configuration.
- Receivables aging in four buckets (0 to 30, 31 to 60, 61 to 90, over 90 days), by payer and currency.
- Exchange rates follow section 5. Each entry stores rate, rateDate and rateSource.
- The module never judges whether a commission is permitted. The relevant checkpoints from the rule files appear as "Kontrol edin" text.
- Acceptance: installments sum exactly to the term total. Splits sum to 100%. Aging buckets are exhaustive and do not overlap. Boundary-date tests pass.

M28 Transfer Process Tracker
- Each transfer deal gets a process checklist with these stages: agreement in principle; medical; contract signed; registration steps (as configured); work permit or visa where the player is not an EU national; announcement. Each step has an owner, a due date, a status (OPEN, DONE, BLOCKED with a reason) and a document reference.
- A blocked step appears in a dashboard widget. A step can be marked DONE only with a document reference or an explicit "no document needed" note.
- Acceptance: step order is preserved. Blocked steps appear on the dashboard. Completing a step writes a timeline event.

M29 Minor Protection and Guardians
- Automatic flag when a player is under 18 on the Istanbul date (R8). The flag shows the checklist and the matching checkpoints from minors.json.
- Guardian records with encrypted contact fields. The parental consent document reference is stored on the guardian record. School and education fields are masked by default.
- Alerts at 90, 30 and 0 days before the player's 18th birthday (R4 pattern) prompt a review of the checklist.
- Acceptance: R17 works. Guardian contact data never appears in an export without an explicit opt-in.

M30 Medical File and Availability
- Medical records (R18). Restricted to owner-role users. Each reveal is logged. Entries are restricted by default.
- Availability status is updated from the latest medical record, or entered manually. Its expiry date appears on the dashboard.
- Medical records are excluded from CVs, share links, CSV exports and backups. The backup can include them only after an explicit opt-in that shows a warning.
- Acceptance: every read, reveal and export writes a MedicalAccessLog row. Export tests confirm the exclusions.

M31 Image Rights and Commercial Deals
- Image-rights agreements: exclusive flag, territories, media types, start and end dates, fee and status. A SPONSORSHIP deal can link to a player.
- Conflict check: two active exclusive agreements for the same player in the same product category produce a warning. The warning is a checklist prompt, not a verdict.
- A photo rights note is required before a player photo can appear in a CV or share link.
- Acceptance: the conflict warning appears. A share link refuses a photo that has no rights note.

M32 Dispute and Case Management
- Cases with forum (FIFA DRC, TFF, CAS, labour court, criminal complaint, other), parties, filing date, next deadline (entered by the owner, together with the source of the time limit), counsel name, documents, status and outcome.
- Deadline alerts at 14, 7 and 1 days (R4 pattern). Every case page shows "Hukuki tavsiye değildir" (P5).
- Acceptance: each alert fires once per threshold. A case cannot be closed while a deadline is open unless a reason is entered.

M33 Contract and Letter Template Library
- Versioned templates in TR and EN with typed placeholders, such as {player.fullName} or {contract.endDate}. Placeholders resolve from records. A missing value blocks generation, and the missing fields are listed.
- Generation produces DOCX (docx library) and PDF from the same data. Each generated file records the template version and a hash of the data snapshot.
- Every template shows "Avukat onayı gerekir" until the owner marks it approved, with the approver and the date.
- Clause diff between template versions.
- Acceptance: a missing placeholder blocks generation. Only approved templates appear in the "ready" list. The snapshot hash is reproducible.

M34 Club Stakeholder Map
- Organization-chart view per club: stakeholders by role (ClubStakeholder), influence, relationship owner and relationship temperature.
- Gaps view: roles with no contact or no recent interaction.
- Acceptance: adding a stakeholder links an existing person record and never creates a duplicate person.

M35 Performance Data Hub
- Import adapters: CSV profiles per provider, with the column mapping saved per provider. One optional licensed API adapter, disabled by default, which requires owner credentials and a license note.
- Normalization to per-90 values using minutes played (R25). Season and competition keys.
- Freshness panel: the latest data date and provider for each player, with a warning when data is older than a configurable number of days.
- No scraping. The license note records the terms the owner must check.
- Acceptance: an import rejects rows from an unknown provider. Per-90 values equal raw value divided by minutes, multiplied by 90, in tests. Every stat carries DATA_PROVIDER provenance.

M36 Player Comparison, Similarity and Shortlists
- Side-by-side comparison of up to four players: profile, stats per 90, level score, contract, and market value with its source.
- Similarity search over normalized stats for a chosen position group (R26). Weights are configurable.
- Shortlists per club request (M9), with players sorted by matching score (M10).
- Acceptance: similarity is deterministic for identical inputs. Players below the minimum minutes are excluded, and the reason is shown.

M37 Secure Share Links
- A read-only link to a player profile or to a specific CV version. Options: expiry (maximum 30 days, R19), optional passcode, recipient name, and a watermark with the recipient's name on the page and in the PDF.
- Shows the view count and the last viewed time. The owner can revoke a link at any time. A revoked link returns 410.
- Never includes sensitive fields, medical records, guardian data, salary, or PRIVATE sales listings.
- Creating a link, revoking it, and reaching view-count milestones each write a timeline event.
- Acceptance: R19 tests pass. An expired link returns 410. A passcode is required when one is set. The watermark is present on the page and in the PDF.

M38 Communication Log and Email Ingest
- Manual communication log for calls, messages, meeting follow-ups and WhatsApp conversations. WhatsApp entries are logged by hand; the app never sends them. Each entry links to its entities.
- Optional email ingest: the owner either forwards messages to a configured address, or the app reads one owner-configured mailbox read-only over IMAP. Messages are matched to people through the normalized email blind index. Unmatched messages go to an inbox for manual linking. Attachments follow the same upload rules.
- No tracking pixels and no automatic replies.
- Acceptance: a repeated Message-ID is ignored. Unmatched messages are never linked automatically.

M39 Relocation and Concierge
- A checklist per player or staff member: housing, school for children, residence and visa steps, transport, language course, insurance and arrival logistics. Each item is a task with a relocation category, due date, status and an optional vendor contact (a business contact, not sensitive).
- Acceptance: completing the checklist writes a timeline event. Children's school fields are masked.

M40 Scouting Operations
- Scout assignments linked to fixtures from M2. Each assignment expects a report afterward.
- Expense claims per scout, with a receipt attachment and an approval status. A scouting budget per season in configuration.
- Watchlist (WatchlistEntry) with status transitions. A coverage map by country and league shows where reports exist.
- Acceptance: a scout report can be created from an assignment. Coverage counts match the database.

M41 Media and Press Hub
- Journalist contacts (MediaContact). Press items with status DRAFT, APPROVED or PUBLISHED_MANUALLY. The owner must approve an item before it can be marked as published.
- Content calendar for planned publications. No automatic posting (P11).
- A brand voice guide, which feeds the template library (M33) as a style reference.
- Acceptance: no press item can move to PUBLISHED_MANUALLY without first being APPROVED.

M42 Regulatory Calendar and Licences
- TransferWindow records per country and league, entered in Settings. No dates are hardcoded.
- LicenseRecord entries for the owner and for each agent: issuer, reference number and expiry. Renewal alerts at 90, 30 and 7 days (R24).
- Registration deadlines per league appear as a calendar overlay.
- A countdown widget for the next transfer window.
- Acceptance: changing a window date updates the countdown. License alerts fire once per threshold.

M43 Club Financial Profile
- Manual entry of club financial and budget indicators by period. Each value carries a sourceUrl (for listed clubs, a KAP disclosure link that the owner has checked), retrievedAt and verificationStatus.
- No scraping of any financial site.
- Acceptance: a value can be VERIFIED only with a non-empty sourceUrl (P1, R5).

M44 Data Operations and Audit
- Data inventory generated from model metadata. Each table and important column is tagged with its category, its retention period and its sensitivity flag.
- Retention settings: category-specific retention in months, applied after the trash window. Finance records default to no automatic purge, and the owner decides the period.
- Purge runs: a dry run lists exactly the rows that would be removed, then a confirmed run removes them. Every run is logged.
- Pseudonymization on request: the owner can pseudonymize a person's personal fields (for example "Kişi #A1F3") while keeping the financial and transfer records linked to that person.
- Export of a single person's linked records as JSON and a readable PDF, for the owner's own use. Logged.
- Audit log view with filters.
- Compliance status page: rule files, reviewedAt values and NOT REVIEWED markers.
- Outbound report: lists every code path that can send an external message, which should only be the owner's digest (R21).
- Acceptance: a dry run matches the confirmed run row for row. A person's export contains only that person's linked records.

M45 Analytics and KPI Reporting
- KPI dashboard: commissions by year, currency and category; active mandates; suggestion-to-presentation conversion; presentation win rate by league and by club; response time to requests; scouting coverage.
- Each KPI definition lives in code with a description in both languages. Each chart exports CSV.
- Acceptance: KPIs are pure functions with unit tests. No KPI reads a masked field.

---

## 8. Cross-cutting features and business rules

### 8.1 Cross-cutting features
- Global search (Ctrl+K and the "/" key) across all entities, grouped by type, keyboard navigable, with Turkish normalization (section 5).
- Tables: server-side pagination at 50 rows, column sorting, column filters, saved views per user per table, column visibility.
- Every record page has: a header, a related-records panel (both directions, grouped), a timeline, notes, attachments and tasks. Navigation example: Club to Person to Suggestion to Player to Player timeline. Every step is one click.
- Forms: zod validation. Dropdowns for enums and related records. Users never type raw IDs. Pickers show names.
- Deletion warning lists linked records and offers "Bağlantıları kaldır ve sil" (EN: "Remove links and delete") or cancel.
- Responsive, desktop first. Below 768 px the menu becomes a drawer and tables become cards.
- Accessibility: visible focus, a label on every input, keyboard navigation for dialogs and menus.

### 8.2 Business rules

R1 Coach departure. A coach_departure proposal can be approved only with an explicit personId. Only memberOf relations where person equals the selected person, club equals this club, and endDate is empty get endDate set to the effective date. Other staff are not touched. Without a personId, approval is blocked with a message. A follow-up Task (priority HIGH, due in 2 days) is created. Timeline events are written on the club and on the person.

R2 Coach appointment. A new memberOf relation is created with startDate. The previous head coach's tenure is closed only when the owner selects that person.

R3 Suggestion transaction. One database transaction creates: the Suggestion; a suggestedTo relation (Player to Club, with a note containing the person and the request); a Presentation (result PENDING, follow-up default 5 days, editable); Request status SUGGESTED; and timeline events on Player, Club, Person and Request, all sharing one batchId. Any failure rolls back everything. Summary text: "{club} kulübüne önerildi · Yetkili: {person} · Talep: {request} · Tarih: {date}" (EN equivalent).

R4 Notifications. For each date rule and each threshold T in configuration: when the days remaining are less than or equal to T, create one notification, unless a notification already exists with the same dedupeKey (entity, rule, threshold, targetDate). Rules: contract end, release clause, birthday, tool renewal, minor check (once), licence expiry, case deadline, transfer window. Tests use a fixed clock.

R5 Verification. VERIFIED requires a sourceUrl and human approval, enforced by the API.

R6 Sensitive masking. Timeline diffs and exports mask sensitive fields. Tests cover each path.

R7 Matching with missing data. Missing criteria are not scored and are normalized out. Tests cover every criterion, including missing values.

R8 Age and minor status. Age is computed from birthDate using Europe/Istanbul dates. Minor means under 18 on today's date.

R9 Fixture source. Every match row must have source = TFF and a leagueId. Other sources are rejected.

R10 CV default. Contracts and salary are excluded unless explicitly included. Tested.

R11 Example removal. Removes every isExample row and every dependent row. Tested: no orphan relations remain.

R12 Backup and restore. Export excludes sensitive fields by default. Restore never clears a sensitive field that is absent from the backup. Round-trip test: export, wipe, restore gives identical record counts and identical non-masked values.

R13 AI assistant. No outbound call unless the consent flag is set and the owner has approved the payload preview. Tested: the default outbound payload contains no sensitive fields.

R14 Embedding. Tested: the CSP header includes frame-ancestors with the Google Sites origins, and does not include X-Frame-Options DENY.

R15 Access control. Tested: a non-allowlisted email receives 403, and unauthenticated API calls receive 401.

R16 Commission arithmetic. Fixed and percentage commissions are computed with decimal arithmetic. Splits across intermediaries must sum to exactly 100%, or the save is rejected. Installments sum exactly to the term total. Rounding is half-up to two decimals. VAT applies only when the term has a VAT rate. Tests cover rounding edges, zero amounts, and a split of 33.33, 33.33 and 33.34.

R17 Minor-to-adult transition. When a minor player reaches 18 on the Istanbul date, the minor checklist is closed with a timeline event after the owner confirms. Guardian data then becomes eligible for purge under the retention settings. It is never deleted automatically. Tests use a fixed clock on the birthday.

R18 Medical access logging. Every view, reveal, edit or export of a medical record writes a MedicalAccessLog row (actor, time, record, action). Medical data is excluded from CSV, CVs, share links and backups unless the owner opts in, and the backup opt-in shows a warning. Each path has a test.

R19 Share link rules. Expiry is at most 30 days. An expired or revoked link returns 410. The passcode is stored as a hash. The view count increases once per browser session. The field allowlist can never include sensitive fields or PRIVATE listings. Each rule has a test.

R20 Purge semantics. A pseudonymized person keeps no personal field in any row. Financial and transfer records stay linked to the pseudonym so totals do not change. Every purge is logged. Tests confirm both properties, and that a dry run matches the confirmed run.

R21 No automated outbound. The only SMTP send in the codebase is the owner's digest to the owner's own address. A test scans the code and fails if an outbound send path exists outside the allowlisted module.

R22 Checklist neutrality. The application renders rule-file text only. A test confirms that every rule entry has version, reviewedAt, and a sourceUrl or owner-authored tag, and that compliance:check passes.

R23 Transfer window countdown. Computed from TransferWindow rows against the Istanbul date. Never hardcoded. Tested with a fixed clock.

R24 Licence expiry alerts. Alerts at 90, 30 and 7 days, with one notification per threshold per record, using the dedupe key from R4. Tested.

R25 Per-90 normalization. Value equals stat divided by minutes, multiplied by 90. Players below the configured minimum minutes are excluded from comparison and similarity, and the reason is displayed. Tests cover zero minutes, exactly the threshold, and below the threshold.

R26 Similarity. A pure function. Features are normalized as z-scores within the position group. Missing features are not scored and are normalized out, as in R7. Ties are broken by player id. Tests cover determinism, missing features, and symmetry for a pair of players.

---

## 9. Innovation layer

Build these after the core passes. List each one in the README under "Yenilikler", and describe it by what it does and how it was verified.

Original items:
- Relationship temperature: a computed score per club and per person, from the last interaction date, meeting count, presentation results and speaker status. It decays over time. The owner can adjust it manually.
- Next best actions on the dashboard, from rules: a presentation with no follow-up after 7 days; an open request with no suggestion after 14 days; a contract release window within 90 days for a TARGET player.
- Meeting brief: a template-generated brief for each meeting, built from the recent timeline of the linked entities. No AI required.
- Weekly digest: in the app, and by email if SMTP is configured. Contains pending proposals, deadlines, overdue tasks and new scout reports.
- vCard (.vcf) import for person records.
- Installable PWA with a quick-capture button that creates a Work Log entry or a timeline note. Only the application shell is cached. Business data is never cached offline, and a failed capture keeps the typed text in form state.

Extended items:
- Player Value Index (internal). An explainable composite of level score, a configurable age curve per position, contract years remaining, data coverage and the number of owner shortlists the player appears on. Every factor is shown with its weight. It is labeled "İç değerlendirme · piyasa değeri değildir" and is never stored as a market value.
- Comparable Transfers Book. Owner-entered past transfers with fee, date, age, position group, league tier and source. Shows the median and interquartile range for a given profile, with the sample size. Shows a warning below five comparables.
- Contract Timing Advisor. Rule-based prompts: a release window is opening, an extension window is approaching, or a contract ends within six months with no talks logged. Each prompt names the rule that produced it.
- Explainable match narratives. Template text in TR and EN that states which criteria a match met and which it missed. No AI required.
- Meeting debrief capture. Text notes after each meeting, with optional dictation through the browser speech API when the owner presses a button. The transcript is stored as text. Audio is never stored.
- Portfolio health score. Components: mandates expiring, players with stale data, incomplete profiles, overdue tasks, and commissions unpaid for more than 60 days. Each component links to its records.
- Next-best-action extended: licence expiring, a case deadline approaching, medical clearance expiring, commission overdue.
- Anomaly checks. Implausible inputs (height, weight, GPS speeds above a configurable physiological limit, a birth date in the future) are flagged for review and never corrected silently.

---

## 10. Milestones

Each milestone ends with: tests green, a PROGRESS.md entry, a merged pull request, and an update to the README "Yenilikler" section where relevant.

A. Foundation
Repository layout; AGENTS.md; docker-compose; Prisma schema for every entity and relation; migrations; the common columns (section 6.1) with optimistic locking; field-level encryption and blind indexes (section 2.6); server-side sessions, CSRF protection and the full set of security headers (sections 2.3 and 2.4); pino redaction; i18n dictionaries with the missing-key test; Google sign-in with the allowlist; the application shell (sidebar, top bar, language and theme switch); the timeline and relations core; soft delete and Trash; the Mandate and Deal tables (skeleton); the example seed; the CSP header tests.

B. Clubs and players
M1, M3, M4, M5, M6, M14 (basic), M15, R1, R5, R6, R8.

C. Transfers
M9, M10, M11, M12, M2 (agenda), M7, M24 (basic), R4 notifications, R3.

D. Matches and documents
M2 (fixtures and the TFF parser, tested on anonymized saved HTML fixtures), M8 (GPS import and clips), the CV generator (R10), M23 (gallery), PDF and DOCX export.

E. Network and operations
M13, M16, M17, M18, M19, M20, M21, M22 (both layers, with R13).

F. Hardening
M25; global search polish; accessibility pass; innovation layer section 9 (original items); responsive pass; R14 embedding verification; deployment guide; Turkish setup guide; owner test scenarios.

G. Medical, minors, image rights and data operations
M29, M30, M31, M44; R17, R18, R20, R21, R22; compliance:check; a Codex Security review of the complete authentication, encryption and upload surface; the threat model document. Do not store medical records or guardian data in production before G is merged.

H. Money and deals
M26, M27, M28, M42, M43; R16, R23, R24; the TCMB exchange-rate adapter behind its flag.

I. Intelligence and network
M32, M33, M34, M35, M36, M37, M38, M39, M40, M41, M45; R19, R25, R26; the extended innovation items in section 9; the final feature matrix.

---

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

---

## 12. Example seed data (seed:example)

Every row has isExample = true, and every name is labeled. Dates are relative to the run date so the alerts appear.

- 1 continent: Avrupa (ÖRNEK)
- 2 countries: Türkiye (ÖRNEK), Sırbistan (ÖRNEK)
- 1 league: ÖRNEK Süper Lig
- 3 clubs with coordinates: Örnek SK A, Örnek SK B, Örnek FK C
- 2 age teams: Örnek SK A A takımı and U19
- 1 head coach per club and 2 officials per club
- 4 players: one OWN; one TARGET aged 17, so the RSTP alert shows; one INTERMEDIARY with an agent; one MANDATED
- Guardian for the 17-year-old example player, with a placeholder document reference
- One medical record (CHECK, FIT) for an example player, restricted
- 1 agent, with one licence record expiring in 45 days
- 1 contract ending in 25 days, with a release clause
- 1 image-rights agreement for an example player
- 1 club request
- 1 suggestion, created through R3
- 1 commission term with three installments on the example suggestion
- 1 sales listing
- 2 meetings
- 1 event (Deal Done Serbia, EXAMPLE) with 3 speakers in different pipeline stages
- 2 scout reports
- 2 tool subscriptions (renewals in 20 and 60 days)
- 3 finance entries (one TRY, one EUR with a rate)
- 5 work log entries
- 1 pending UpdateProposal (coach_departure for Örnek SK A, UNVERIFIED, personId set to the example coach)
- 1 case with a deadline in 10 days
- 1 transfer window for the example league
- 1 open task

---

## 13. Testing strategy

- Unit: matching (R7), commission arithmetic (R16), per-90 and similarity (R25, R26), the Turkish normalizer, the age and minor logic (R8), encryption round trip, blind-index determinism, key rotation, CSRF token generation and verification, the Origin check, the share-link expiry and passcode, template placeholder resolution, aging buckets, FX conversion, reminder thresholds with the fixed clock.
- Integration: 401 and 403 (R15), CSRF 403 without a token, the CSP header (R14), transactional rollbacks (R3), tenure logic (R1, R2), the R12 round trip with encrypted fields (ciphertext in a backup must not be plaintext unless the owner opted in), the medical access log (R18), share-link route behavior (R19), the static test for R21, and the purge dry run against the confirmed run (R20).
- Golden files: the CV and standard-profile output structure. A changed golden file requires an explicit update command and a PROGRESS.md entry.
- E2E (Playwright): the original flow (login stub, create a club, create a player, run a suggestion, check the timeline), plus these flows. Create a player under 18 and see the RSTP checklist. Add a guardian and see no contact data until reveal. Create a deal, add commission terms with installments, and see the receivables aging. Create a share link, open it in a new browser context, and confirm that sensitive fields are absent. Run a purge dry run.
- Accessibility: axe scans of all main routes in both languages.
- Performance: the p95 response time for the default list page with 10,000 fictional players, on the local database, must be under 500 ms. Record the result in PROGRESS.md.
- Fixed clock: every deadline and birthday test uses the fixed-clock utility.
- Security: a test confirms that the secrets scan and the header tests run in CI, and that log redaction holds.
- Document outputs: the PDF text assertions and the DOCX XML assertions for the CV, the profile and the dossier.

---

## 14. Competitive benchmark and feature matrix

- Study public descriptions of existing football-agent CRM products to decide which feature categories to cover. Public information at the time of writing included: Ensk.ai, a Sofia-based company that describes a CRM and AI platform for football agencies, reports use by more than 100 agencies in more than 30 countries (per a Hudl and Wyscout case study), and uses the Wyscout API as its data layer; and a Sports360 and Fulcrum case study that built an agency CRM on Retool, PostgreSQL and Apify. Verify all of this before relying on it. Pricing, full feature lists, Turkish coverage and data handling were not verified.
- Use competitors for feature categories and workflows only. Do not copy code, UI assets, copy text, screenshots or data. Competitor brand names must not appear in UI strings, code, seeds or tests. They may appear in docs/benchmark/ only.
- Create docs/benchmark/feature-matrix.md. Each row is a category, with columns for status (BUILT, PARTIAL, NOT BUILT, or OUT OF SCOPE with a reason), milestone and test reference. Categories: player database; player profile and card; data-provider import; valuation (owner-entered); similarity search; scouting reports; scouting planner; club map; club stakeholder map; contacts and relationships; mandates; contracts and deadlines; transfer process; presentations; deal pipeline; commissions and receivables; events and speakers; tools and subscriptions; work log; finance ledger; media and press; disputes; templates; sharing links; calendar and ICS; notifications and digest; AI assistant; data operations; backup and restore; mobile and PWA; accessibility; bilingual (tr, en); Turkish regulatory checklists.
- Differentiators to build and to document: provenance on every value (P1); a human approval gate (P2); owner-controlled masking and encryption (P6); Turkish regulatory checklists as versioned data (section 2.9); explainable matching (R7); Google Sites embedding (section 4); no outbound automation (P11); no unlicensed data collection (P3, P4).

---

## 15. Out of scope (state these in the README)

- Automated Transfermarkt data extraction. This is never built.
- Automated TFF fetching beyond user-triggered, robots-allowed fetches.
- Any legal advice, and any automated legal conclusion.
- Automated market valuations.
- Video file storage beyond small optional clips.
- Automated outbound messaging of any kind.
- Multi-user roles. The schema carries ownerId so roles can be added later.
- Real player, club or person data in the repository.

---

## 16. Final reply format

When finished, reply with:

1. Status per milestone (A to I): DONE, PARTIAL or BLOCKED, with one line each.
2. Results of npm test, npm run build, npm run lint, npm run i18n:check, npm run test:e2e, npm run compliance:check and npm run security:check, each as pass or fail with counts.
3. Feature matrix summary: counts per status (BUILT, PARTIAL, NOT BUILT, OUT OF SCOPE), with a link to docs/benchmark/feature-matrix.md.
4. Performance result from the 10,000-player test, with dataset size and machine notes.
5. Acceptance criteria not met, with reasons.
6. NOT VERIFIED items, each with the exact error.
7. Rule-file status: each file in config/compliance/ with its reviewedAt value, and the NOT REVIEWED items.
8. Security: Codex Security findings and their status, plus the open items in the threat model.
9. Known risks: Google Sites iframe sign-in behavior, TFF page structure changes, the manual Transfermarkt flow, the AI assistant's cost and consent, and the dependence on licensed data providers.
10. What the owner must provide before going live: ALLOWED_EMAILS, DATABASE_URL, FIELD_ENCRYPTION_KEY, BLIND_INDEX_KEY, storage credentials, optional API keys and provider license notes, the reference CV file in docs/reference-cv/, and the owner's review of config/compliance/.