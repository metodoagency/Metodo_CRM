# Metodo CRM progress

Authoritative specification: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), the second uploaded complete build prompt. It replaces the earlier draft. Work is on `milestone/a-foundation`. This is **work in progress, not a completed production CRM**. No milestone is marked DONE and no merge is authorized by local test passes alone.

## Milestone status

| Milestone | Status | Evidence / next gate |
|---|---|---|
| A — Foundation | PARTIAL | Runnable local foundation and security tests implemented; remaining acceptance gaps below; no reviewed/merged PR |
| B — Clubs and players | BLOCKED | Depends on completing A; basic core records exist, advanced modules not started |
| C — Transfers | BLOCKED | Depends on A/B; R3 is implemented for seed/E2E, other C scope pending |
| D — Matches and documents | BLOCKED | Depends on C; no TFF fetch/parser or document generator claimed |
| E — Network and operations | BLOCKED | Depends on prior milestones; tables/examples only |
| F — Hardening | BLOCKED | Main-route a11y and deployment packaging exercised early; full F pending |
| G — Medical/minors/data operations | BLOCKED | No production medical/guardian ingestion allowed before this milestone |
| H — Money and deals | BLOCKED | Schema/skeleton examples only; no financial workflow claimed |
| I — Intelligence and network | BLOCKED | Not started |

## Implemented and exercised in this work

- TypeScript/React 18/Vite/Tailwind/Radix/TanStack Query/React Router/react-hook-form/zod shell; Turkish default, English, dark/light server preferences, responsive drawer/cards and keyboard search.
- PostgreSQL 16, Prisma 6.19.3 with published WASM migration adapter; 63 models (60 business models plus owner/session/OAuth infrastructure); all business common columns, UUID primary keys, provenance columns, encrypted sensitive fields, indexed relations, Mandate/Deal skeletons and three migrations.
- Owner OIDC flow with state, PKCE, nonce, JWT issuer/audience/email verification and allowlist; actual Google login remains NOT VERIFIED. Hashed server-side sessions; encrypted stored session emails; __Host cookies; 12-hour absolute and 60-minute idle expiry; rotation on login and revoke-all.
- Session-bound CSRF and exact application Origin; request authentication based on matched route patterns; route rate limits; CSP allowing Google Sites ancestors; no X-Frame-Options; Permissions-Policy, nosniff, Referrer-Policy and pino redaction.
- Core club/player/person/request persistence; bidirectional relations; masked bilingual timeline/audit events; core optimistic edits/deletes; Trash/restore/manual purge; safe CSV exclusions; explicit per-field reveal with 60-second auto-hide. Unsupported canonical proposal approval fails closed.
- R3 creates a Suggestion, relation, Presentation, request status and four timelines atomically. A database trigger failure proves rollback of earlier writes.
- Fictional relative-date seed, idempotent without overwriting existing records. Names start with Örnek/ÖRNEK, domains are example.com, and business example rows are flagged. Sensitive seed fields are encrypted. Seed refuses production.
- AES-256-GCM with random IV and authenticated field context; separate HMAC blind indexes; key-ID support and tested persisted batch rotation.
- Complete Natural Earth 110m boundary asset (177 features); neutral design tokens. Interactive map pending B.
- Docker/Railway configuration and English/Turkish setup guides; production-image smoke test confirmed SPA/health/API auth/stub absence and embedding headers. No external deployment was performed.

## Verification results

Latest completed checks in this work (2026-11-02):

| Command / check | Result | Count / scope |
|---|---|---|
| npm install | PASS | Repeated installation and generated client succeeded |
| npm run db:up | PASS | Real PostgreSQL 16 Docker service; repeated reachable check |
| npm run db:migrate | PASS | Three migrations, development/test/E2E/performance databases and production-image command |
| npm run seed:example | PASS | Repeated seed; encrypted examples; explicit idempotence integration test |
| npm test | PASS | 47/47 tests across 4 files, including native PostgreSQL UUID assertions and persisted key rotation |
| npm run typecheck | PASS | Strict TypeScript; 0 errors |
| npm run lint | PASS | 0 errors/warnings |
| npm run build | PASS | Browser and Node production outputs; release forces production React runtime |
| npm run i18n:check | PASS | 207 paired keys; 3 JSX files; checker rejection tests |
| npm run test:e2e | PASS | 4 tests: full core flow, iframe fallback, TR a11y, EN a11y |
| npm run a11y coverage | PASS via test:e2e | 8 main routes × 2 languages; 0 serious/critical violations |
| npm run compliance:check | PASS structure | 3 files; all remain NOT REVIEWED |
| npm run security:check | PASS | Secrets/outbound scan; production audit 0 advisories; 11 selected security tests, others deliberately filtered |
| npm audit (including dev) | PASS | 0 advisories after patching/upgrading dependencies |
| npm run perf:test | PASS | 10,000 players; 50 samples after 5 warm-ups; p95 31.3 ms; 3 index-scan plans |
| npm run keys:rotate | PASS integration | Real encrypted row re-encrypted with new key ID; plaintext and version verified |
| npm run jobs:daily | PASS limited scope | Expired session/OAuth maintenance only; business notification jobs pending C |
| npm run api:docs | PASS limited scope | Core create/list OpenAPI generated and authenticated route registered; full route coverage pending |
| Docker build / production smoke | PASS | Image built; health 200, SPA 200, API 401, test auth 404; CSP correct on all four |

The API performance measurement uses Fastify injection and local PostgreSQL, not public-network latency. Machine: Linux x64, 5 logical CPUs exposed, AMD EPYC 9V74. See [docs/performance.md](docs/performance.md). No Lighthouse score is claimed.

The first query-plan run failed (149.1 ms p95 with sequential scans). Partial active-record indexes fixed it; no planner settings were forced. Initial browser label/preference issues, an async auth-response deadlock, and vulnerable dependency versions were corrected and affected checks rerun.

## Assumptions

- **reference CV not provided**. The reference folder is empty; use the M8 section order later. Neutral design tokens are used because no Figma/Canva/Drive design was connected.
- Sensitive dates must not be stored in plaintext DATE columns. Birth dates use encrypted text plus blind indexes; non-sensitive calendar dates remain PostgreSQL DATE. This prioritizes section 2.6 confidentiality over the conflicting universal DATE wording in section 5.
- `DIRECT_URL` is declared in the schema and selected explicitly by `prisma.config.ts` for migrations. Runtime Prisma uses `DATABASE_URL`. The driver's warning about ignored schema URL fields is expected; selection is explicit and tested.
- The published Prisma WASM migration interface avoids a blocked native-engine download. A catalog-only adapter projection casts PostgreSQL `name` values to text. Package checksums and TLS were never bypassed. `deepmerge-ts`, `glob` and `minimatch` use compatible patched overrides, exercised by generation/build/tests.
- One `owner` scope is used. Example records do not grant login access; ALLOWED_EMAILS remains authoritative.
- Docker is available in this instance. Unprivileged embedded PostgreSQL fallback is provided but its startup path is NOT VERIFIED here because the working Docker database occupies the development port.
- Seed and test data remain fictional. No real football record, automatic Transfermarkt lookup, competitor scraping, legal conclusion, contact messaging or AI call was added.
- Unsupported features fail closed or are absent. `export:subject` explicitly exits NOT DONE rather than producing an incomplete privacy export.

## Owner input needed

Do not paste secret values into chat. Configure them securely in local `.env` for development and hosting-provider secrets for production.

1. Owner's `ALLOWED_EMAILS`; Google Web OAuth `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and registered callback URI.
2. An owner-authorized Railway project/repository connection. No Railway tool, deployment identity or token was available. A public URL cannot be supplied until an actual deployment/domain exists. **Public URL: NOT AVAILABLE.**
3. Supabase (or another PostgreSQL 16 host): pooled `DATABASE_URL`, direct `DIRECT_URL`, provider-required TLS configuration and backup policy.
4. Independent `FIELD_ENCRYPTION_KEY` and `BLIND_INDEX_KEY` (32-byte base64 keys); key custody/rotation plan and key ID.
5. S3-compatible storage endpoint/bucket/region/access credentials when implementing the production storage adapter. Never expose a service-role key to the browser.
6. Optional provider credentials/license notes, AI keys and consent, SMTP for owner-only digest, IMAP and Sheets access only when the corresponding features are implemented and enabled.
7. Reference CV under `docs/reference-cv/`, if available, and owner review of all compliance files. Their current reviewedAt values are `NOT REVIEWED`.
8. GitHub API access to create/review a milestone PR and observe CI. Existing native Git reads work, but `gh api repos/metodoagency/Metodo_CRM --jq '.permissions'` returned `Get "https://api.github.com/repos/metodoagency/Metodo_CRM": Forbidden`. This does not establish that a new token is required. Retry after the relevant access/policy changes.

## NOT VERIFIED and concrete errors

- Real Google OIDC sign-in and a published Google Sites iframe: owner credentials and public deployment absent. Local iframe fallback is tested; third-party-cookie behavior remains browser-dependent.
- GitHub PR/remote CI/merge: API request returned the exact Forbidden error above. Do not claim green CI or merge from local results.
- Codex Security completed scan: the skill is listed, but its scan MCP tools and terminal helper files were not available. Reading its referenced preflight returned `failed to read skill resource`. The [skill](skill://Plugin_1e648473be9c8191a91ac3947151af55/security-diff-scan/SKILL.md) requires: "Run the security_diff_scan preflight ... before reviewing files or creating a goal." No scan ID, completed report or sealed review is claimed. Independent security tests/audits ran; see [threat model](docs/security/threat-model.md).
- Playwright-managed browser download returned `403 ... Domain forbidden` for cdn.playwright.dev. Browser validation succeeded with installed `/usr/bin/chromium`; this is not a browser-test blocker.
- Native Prisma download initially returned 403 for binaries.prisma.sh. The supported WASM adapter/client is now exercised; no verification was disabled.
- `prisma migrate diff --from-migrations` failed with P3006 (`type "AgeCategory" already exists`) using the experimental shadow-database path. Subsequent index SQL was generated by comparing schema files without a shadow database; deployment of all three migrations is verified. Do not use the affected shadow-diff path until investigated.
- Full section 13 E2E flows for medical/guardian, deals/receivables, share links, purge dry run, PDF/DOCX and Lighthouse are unrun because those features are not implemented. Passing core tests do not cover them.

## Compliance file status

| File | Status | reviewedAt |
|---|---|---|
| config/compliance/ffar.json | NOT REVIEWED | NOT REVIEWED |
| config/compliance/tff-menajer.json | NOT REVIEWED | NOT REVIEWED |
| config/compliance/minors.json | NOT REVIEWED | NOT REVIEWED |

These are owner-authored review prompts, not verified regulatory interpretations.

## Remaining A acceptance gaps / exact next step

**Next: finish A on this branch before starting milestone B or merging.** Implement centralized optimistic-version enforcement for every remaining writer (Trash restore/review/retention and administrative operations), validate per-field provenance consistently, complete linked-record deletion preview and example cleanup with orphan tests, finish all route OpenAPI and environment-variable validation, and obtain a completed Codex Security review. The current ordinary core-record edit/delete/settings paths have version checks; unsupported proposal approval is blocked. Automatic 30-day logged purge and configurable retention remain pending, not silently enabled.

Then run all quality gates, open/update the milestone PR with the test-summary table, observe green CI, and merge only after milestone acceptance and review. Continue B–I in order using separate branches/PRs.

## Feature matrix / deployment / reusable environment

[Feature matrix](docs/benchmark/feature-matrix.md): BUILT 0, PARTIAL 10, NOT BUILT 23, OUT OF SCOPE 0 across the 33 requested complete categories. Schema-only categories are not counted built.

Exact local commands and Railway/Supabase/public-domain steps are in [README.md](README.md) and [Türkçe kurulum](docs/KURULUM-TR.md). No public app or Google Site was created.

Cloud environment draft: saved complete `install_script`, `start_skill`, and custom network requirements for Google OIDC and api.github.com. Saving is confirmed; runtime application/publication is **not** claimed. Review and save in environment settings, then publish the cloud environment when appropriate. Live development processes must restart after restoration.

## Tool availability checked for A

- Cloud Environment and Onboarding tools available and exercised. Terminal/Git/PostgreSQL/Chromium available. GitHub plugin, Supabase, Railway, Figma, Canva, Drive, Calendar, Gmail, Firecrawl and a browser connector were not exposed as callable tools; native/local fallbacks used where relevant.
- Codex Security skills listed, scan tools/helpers absent as described above. No unsupported plugin was installed or invented.
- Other listed skill packages (Power BI, Creative Production, Data Analytics, TWG, ChatCut, Firebase, Logtura, Sentry) were not needed for this architecture; account connectivity was not tested.

## Known risks

Google Sites third-party cookie restrictions; future TFF DOM changes and robots/access policy; manual Transfermarkt values requiring owner provenance; AI costs and payload consent when implemented; licensed provider availability; raw key custody; unreviewed compliance prompts; incomplete modules. Do not treat this WIP branch as production-ready.
