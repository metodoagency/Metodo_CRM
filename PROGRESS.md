# Metodo CRM progress

Updated: 2026-11-03 (Europe/Istanbul).

## SPEC update 1 — 2026-11-03

All owner instructions are retained subject to the explicit replacements in SPEC.md. SPEC.md incorporates the full baseline, and AGENTS.md plus docs/REQUIREMENTS.md now prohibit all automated commercial-site fetching/crawling/parsing. TFF is owner-triggered only after robots permission, otherwise CSV; never scheduled. Market/contract inputs need source URL/date/method. No licensed provider is implemented now; adapter interfaces only, implementation deferred by owner instruction. Gmail is read-only and proposal-only; no sending. Voice notes are owner dictation with optional local transcription only.

New G1–G15 is inserted after F; former G/H/I becomes H/I/J without dropping scope. Privacy notice, table retention, value-free view logs, encrypted sensitive backups, breach checklist and local/per-document-consented processing are mandatory production gates. None of those new UI/workflows is claimed complete merely because this amendment is written. Required first-login, contract approval, consent/preview and backup mismatch tests are NOT DONE until their features are implemented. A static acquisition-policy test is added now.

Runtime correction: purgeExpired defaults to no selected tables and does not delete expired business records; daily jobs therefore no longer auto-purge them. Existing manual confirmed purge remains. Full per-table retention UI/explicit opt-in is pending; duration alone never authorizes deletion.

### Accepted progress: 10%

Method: completed milestone acceptance gates / ten current milestones, equal weighting. This is not an effort estimate. Partial implementation, schema, resources and drafts receive no completion credit.

| Stage | Accepted completion | Actual status |
|---|---:|---|
| A Foundation | 100% | Merged PR #1; final CI 67 tests, 17 security, six browser scenarios |
| B Clubs/players | 0% | IN PROGRESS: core records exist; initial coach-departure API; UI and full B tests/modules pending |
| C Transfers | 0% | R3 foundation transaction exists; full milestone not accepted |
| D Matches/documents | 0% | NOT DONE |
| E Network/operations | 0% | Schema/examples only |
| F Hardening | 0% | Early a11y/headers checked; full scope and new minimum protection gates pending |
| G Additional workflows G1–G15 | 0% | New scope recorded; NOT DONE |
| H Medical/minors/data operations (former G) | 0% | NOT DONE |
| I Money/deals (former H) | 0% | NOT DONE |
| J Intelligence/network (former I) | 0% | NOT DONE; overlaps with new G must be implemented once and cross-referenced |

Production delivery: no public application URL or published Google Site yet. Supabase project and saved Sites draft are resources, not completed deployment. Required frame-ancestors and no-X-Frame-Options behavior remain unchanged.

SPEC update validation observed: acquisition-policy tests 2/2 PASS; real PostgreSQL targeted retention test 1/1 PASS (expired record survives default run, selected-table purge is logged). TypeScript/lint ran; final full B suite and new UI/workflow tests remain pending. The four other requested feature-specific tests remain NOT DONE alongside their unimplemented features.

## Latest continuation

- A is COMPLETE and PR #1 merged as `db76f90`, after exact-head CI run 41615343695 passed: 67 unit/integration tests, 17 selected security tests, six browser/a11y scenarios, build/lint/typecheck/i18n/compliance. Current branch: `milestone/b-clubs`.
- B is IN PROGRESS, not complete. Initial coach-departure approval/context API implementation adds explicit person selection, source validation, proposal/club/person versions, tenure preview digest, serializable changes and a two-day HIGH task. UI and dedicated atomicity/regression tests are still pending; do not merge B yet. Existing approval-without-person test now expects rejection with 400.
- Owner explicitly authorized accepting the displayed Google Cloud terms and selecting Supabase organization Metodo_CRM. Cloud terms were accepted; no need to ask again.
- Supabase project `frjgxbnsfjlriexdwtdl` is ACTIVE_HEALTHY in eu-central-1, quoted 0 USD/month. Read-only SQL confirmed PostgreSQL 17.11 and no public tables. The specification targets PostgreSQL 16; do not silently label this a PostgreSQL 16 deployment. No application schema or real data has been written there, and runtime connection/storage configuration remains pending.
- Next: test and finish B approval UI, complete the other B modules, update generated OpenAPI and feature matrix. Continue OAuth setup from the open Cloud Console and provision hosting when Railway's signup restriction is resolved. Existing Google Sites draft is saved, not published.

The earlier sections below describe the pre-merge checkpoint and are superseded by this entry where they differ.

Authoritative specification: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). Existing work is preserved in `milestone/a-foundation`; [PR #1](https://github.com/metodoagency/Metodo_CRM/pull/1) is a draft. This is a runnable foundation, **not a completed production CRM**. B–I are not claimed built.

## Current milestone

| Milestone | Status | Next gate |
|---|---|---|
| A — Foundation | Implemented; final patch validation/CI pending | Commit rate-control fixes, verify final CI, review, merge PR #1 |
| B — Clubs and players | NOT STARTED | After A merge: M1/M3/M4/M5/M6/M14 basic/M15 and R1/R5/R6/R8 |
| C — Transfers | NOT STARTED | Core R3 suggestion transaction already exercised; remaining C workflows pending |
| D — Matches and documents | NOT STARTED | TFF parser, GPS, gallery and PDF/DOCX pending |
| E — Network and operations | NOT STARTED | Schema/example rows only |
| F — Hardening | NOT STARTED | Early a11y/headers/packaging checks do not complete F |
| G — Medical/minors/data operations | NOT STARTED | No real medical or guardian data before G merge |
| H — Money and deals | NOT STARTED | Schema/example rows only |
| I — Intelligence and network | NOT STARTED | Full scope remains in requirements |

## Foundation implemented

- TypeScript React/Vite bilingual owner shell, Turkish default, dark/light preferences, responsive navigation, eight main routes.
- Real PostgreSQL 16, Prisma 6.19.3, 63 models/60 business models, four append-only migrations, UUIDs, owner scope, provenance, versions, relations and fictional seed.
- Google OIDC implementation with state, PKCE, nonce, signature/issuer/audience/email verification and allowlist; hashed server sessions, encrypted email, 12-hour absolute/60-minute idle expiry, revoke-all, Secure/HttpOnly/__Host/SameSite=None cookies.
- Origin plus session-bound CSRF on mutations; explicit route contracts, redacted logs, production/test boundary, required Sites CSP and no X-Frame-Options.
- AES-256-GCM sensitive values, separate keyed blind indexes, 60-second reveal, masked audit/timeline and sensitive CSV exclusion.
- Core clubs/players/people/requests; versioned writes, bidirectional relations, transactional R3 suggestion/relation/presentation/request/timeline changes and rollback proof.
- Strict per-field evidence and HTTP(S) source validation. Editing a field manually resets its evidence without resetting unrelated fields.
- Linked deletion previews, fresh digest confirmation, owner/version checks for Trash restore/purge, FK/polymorphic dependency traversal, safe example cleanup including unflagged dependents and orphan tests.
- Configurable category retention and logged daily purge. Linked primary records block ordinary purge; guardian/medical records do not auto-purge. History remains for ordinary purge.
- Full implemented-route OpenAPI, environment validation, Docker/Railway packaging, English/Turkish local/deployment guides. Unsupported future workflows fail closed.

## Current verification evidence

| Check | Observed result |
|---|---|
| Install/client generation | PASS: 453 packages installed; Prisma client 6.19.3 generated |
| Local database | PASS: embedded PostgreSQL 16.13, four migrations; separate local test/E2E databases |
| Full unit/integration run | PASS: 65/65, six files, real PostgreSQL; two later health/proxy regression tests separately verified below |
| Final focused regression run | PASS: 9/9 (five rate-boundary cases and four environment cases) |
| Browser + a11y | PASS: 6/6, exit 0; 8 routes × TR/EN, zero serious/critical axe violations |
| TypeScript / lint | PASS before final health/test/docs additions; final CI will rerun |
| i18n | PASS: 298 paired keys; checker covers four JSX files |
| Compliance | PASS structure: three files, all NOT REVIEWED |
| OpenAPI generation / production build | PASS; final rate-control patch production build also passed |
| Security gate | PASS: source scan, production audit 0; 17 selected security tests passed, 50 intentionally filtered |
| Remote CI at `3893162` | PASS: [run 41614213707](https://github.com/metodoagency/Metodo_CRM/actions/runs/41614213707), including install/lint/typecheck/unit/security/build/browser |
| Final patch remote CI | PENDING; do not infer its result from the prior commit |

Windows Playwright tests passed cleanly outside the desktop sandbox. Inside that sandbox all six assertions passed, but the sandbox prevented Playwright's Windows taskkill teardown and the process did not exit. Direct API/Vite child commands replace npm/concurrently in the test server configuration. No sandbox/certificate/authentication protections were disabled in application code.

The previous Linux cloud run additionally exercised Docker production smoke, 10,000-player query plans and key rotation. Those are historical checks, not fresh Windows measurements. Historical progress is retained in Git history, including `3893162:PROGRESS.md`.

## Security review and corrections

Completed Codex Security scan: `1dd3d56c-7833-480b-8a53-c18fb53fe51c`, immutable main `e917f55` through local `c11c0c7`. The GitHub commit `3893162` has the identical tree `c05801a`. All 94 changed inventory paths/66 source entries were accounted for.

Two LOW findings: session database work preceded the effective anonymous limiter; production unconditionally trusted forwarded addresses. Fixes now enforce a 600/minute IP budget **before** API/health database queries and an independent 300/minute valid-session budget. Proxy trust defaults off; only configured explicit IP/CIDR peers are trusted. Authentication remains 10/minute per IP. Focused tests cover stable/rotating invalid cookies, unchanged DB counts after rejection, cross-IP session quotas, health aliases, spoofed forwarded addresses and a trusted-peer chain.

Follow-up independent review found the health-route regression; it was corrected and covered by a shared-budget test. Required Google framing remains unchanged. The unsupported hostile Google-ancestor clickjacking hypothesis was not promoted to a finding; its initial validation proof gap remains in partial coverage. Real published-Sites browser behavior is still unverified.

The sealed report describes its original revision; current fixes are not retroactively presented as part of that snapshot. Final patch checks and CI must pass before merge. Limits are per process; multiple replicas need a shared store or verified edge budget.

## Access and Google Sites

- GitHub connected reads/writes work. Native clone/fetch work; native push's credential helper failed under the Windows app container. The connected Git Data API successfully uploaded the exact immutable tree and created PR #1. No new GitHub token/login is requested.
- Supabase list_projects succeeded: the connected account currently exposes an empty project list. Production project provisioning is pending; this does not mean the account is disconnected.
- Railway Google login and GitHub login both returned **Sign ups are currently disabled. Please try again later.** The owner already completed GitHub sign-in. The same service error was visible on 2026-11-03; do not ask for GitHub sign-in again.
- Google Sites is signed in. Created and verified a saved **Metodo CRM** draft: [editor](https://sites.google.com/d/1abOP0osCXLaF0o4hfcBQ1ZySVcONrqls/p/1QhnYKXSyZKCLMe3V40mMs5JmWYlgn3Lx/edit). Title is set; Drive confirms all changes saved. No existing user Site was overwritten.
- Google Sites publication waits for the actual verified HTTPS app URL. **Public app URL: NOT AVAILABLE. Public Google Site URL: NOT PUBLISHED.** No guessed URL or test-auth deployment is claimed.

## Owner input needed

1. Railway's observed service restriction prevents project creation/deployment through the signed-in flow. Needed if Railway remains the host: an active Railway account/project that can pass that restriction, or resolution by Railway. This is a provider response, not a request for another GitHub token. Independent application work continues.
2. Reference CV: **reference CV not provided**. The requirements' default M8 layout will be used; no upload is needed to continue.
3. Compliance files remain **NOT REVIEWED** until owner review. They are owner-authored checklist placeholders, not verified legal conclusions.

Production Google OAuth settings, database/storage resources and encryption keys must be configured securely through existing authorized accounts when deployment is provisioned. Existing cloud OAuth projects have not yet been inspected here; do not assume credentials are missing merely because they are absent from this local process. Never paste secrets into chat or commits.

## Exact next steps

1. Expanded local security/build gates passed. Commit final A fixes and current documentation, then upload through the working GitHub connector.
2. Update PR #1's evidence, observe green CI for its exact final head and finish review before merging.
3. Start milestone B on its own branch and implement its complete requirements with tests. Continue C–I without waiting for another owner “continue” message.
4. Retry authorized hosting/provisioning when the provider path is usable; verify real OIDC, HTTPS health, headers and production stub absence.
5. Embed the verified app URL in the existing Google Sites draft, publish and verify the published frame and top-level login fallback.

## Constraints and known risks

No real football records or credentials are fabricated. Seed records are visibly fictional and encrypted where required. No automatic Transfermarkt fetching, external-contact messaging, legal conclusions or public test stub. Sensitive dates use encrypted text rather than plaintext DATE; other calendar dates use DATE. Reference design uses neutral tokens and complete Natural Earth 110m boundaries.

Production upload/storage, backups, full subject export, medical policy, financial workflows, licensed imports, PWA and document generators are not built. Feature matrix remains honest: [matrix](docs/benchmark/feature-matrix.md). Passing foundation tests does not establish these modules.

Local commands and deployment steps: [README](README.md), [Türkçe kurulum](docs/KURULUM-TR.md). Current tools: GitHub and Codex Security MCP work; Supabase read access works; Edge works for Sites/Railway. Cloud Environment runtime tools are absent in this desktop session; that is a tool limitation, not evidence that the original cloud account lacks access.
