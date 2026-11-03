# Metodo CRM progress

Updated 2026-11-04, Europe/Istanbul. Authoritative scope: SPEC.md + docs/REQUIREMENTS.md; execution ledger: [SESSION_PLAN.md](SESSION_PLAN.md); [100-row acceptance matrix](docs/acceptance-matrix.md). Historical checkpoints remain in Git history; stale statements below older commits do not override this file.

## Current state

- Accepted milestone progress: **10%** (A complete out of A–J). This is an equal-gate count, not effort. No partial code/schema/resource is counted complete.
- A merged in PR #1 as db76f90 after exact-head CI: 67 tests,17 security tests,6 browser/axe scenarios. Completed security review plus rate-control corrections; no X-Frame-Options and required Google CSP retained.
- B remains draft PR #2 on milestone/b-clubs. Head c4e6c84's CI was green; B UI/features are incomplete. Source/proposal/coach-departure groundwork exists, not full acceptance.
- 54-package plan approved by owner:29 core pilot,54 final delivery. One writer/current checkout; no new worktree.
- Package01 DONE: plan saved, all45 M modules/26 R rules/15 G additions/14 innovations mapped, stale current-state summaries reconciled, PostgreSQL17 target and16/17 CI matrix recorded. New matrix CI is pending until this head is pushed.
- Package02 IN_PROGRESS: owner selected the approved agency owner and approved free Render registration/terms; account and workspace created. Free/Frankfurt/manual-deploy form prepared; service/OAuth/database configuration pending.
- Package03 DONE: versioned first-login TR/EN privacy notice; read acknowledgement survives sessions; neutral incident checklist and encrypted contact with explicit 60-second reveal. Five migrations. Local PG16:71/71 tests; security:19/19 and zero dependency advisories; browser:9/9 including two languages and axe on10 routes. Remote16/17 matrix pending push.
- Package04 DONE: catalog covers63 schema tables;60 soft-deletable business tables have per-table indefinite/manual durations. Owner identity is protected; Session/OAuthAttempt retain security expiry. Preview lists exact IDs/versions/counts, binds settings and the dependency graph, expires after10 minutes, rejects stale/replayed confirmation, and blocks active primary dependencies. Daily jobs cannot purge business data. Settings shows paginated sensitive field-view metadata with no values.74/74 local tests;10/10 browser/axe scenarios. No schema migration needed for04. Later sensitive modules must use the same reveal/audit boundary.

## Milestone gates

| Stage | Status | Gate |
|---|---|---|
| A | DONE | PR1 merged; historical exact-head checks passed |
| B | IN_PROGRESS | package11; no merge until full scope/tests/review |
| C | NOT_DONE | package15 |
| D | NOT_DONE | package18 |
| E | NOT_DONE | package24 |
| F | NOT_DONE | package29/pilot |
| G additional G1–G15 | NOT_DONE | package38 |
| H medical/minors/former G | NOT_DONE | package40 |
| I money/former H | NOT_DONE | package44 |
| J intelligence/former I | NOT_DONE | package54/final |

## SPEC update 1 — 2026-11-03

Commercial-site automated fetch/crawl/parse forbidden. TFF only owner-triggered after robots permission, otherwise CSV; no scheduled TFF fetch. Market/contract fields manual with source/date/method. Live licensed providers deferred; permitted owner file import and adapter interfaces only. Gmail read-only through Codex, proposals/excerpts/Message-ID, no sending. Voice is local owner dictation only. External document/audio processing needs per-document exact preview/consent. No automatic business-data deletion by default; a duration alone is not opt-in. First-login bilingual notice, field-level value-free access log, encrypted sensitive backups and breach checklist required before pilot.

Existing update validation:2 acquisition-policy tests and1 real PostgreSQL retention regression passed; typecheck/lint and312-key i18n passed at c4e6c84. No full claim for new unimplemented features.

## Access and delivery evidence

- GitHub connector and native clone/fetch work. Credential-helper push failed in the Windows sandbox; exact trees were uploaded via connected Git Data API. Preserve this working route without asking for a token again.
- Supabase project the existing database project, organization Metodo_CRM, eu-central-1, ACTIVE_HEALTHY, PostgreSQL17.11, quoted0 USD/month. Prior read-only query confirmed version; public schema was empty. No real data/schema deployment claimed. Owner explicitly selected this organization and PostgreSQL17.
- Google Cloud terms and separate API Services User Data Policy accepted with explicit owner approval; don't ask again. Project the existing CRM OAuth project created in the existing authorized Cloud account; OAuth application branding/contact/testing audience saved. Web-client credential form is being prepared; credential creation and real owner login remain pending.
- Railway returned 'Sign ups are currently disabled' after Google/GitHub login. Owner already completed GitHub browser sign-in. Render Free is the approved replacement.
- Render account, the approved owner workspace and Free service the existing free service created after explicit agency-account and terms approval. $0/month, Frankfurt, /healthz, manual deployment. Assigned https://metodo-crm.onrender.com . First build completed for merged A db76f90; boot correctly rejected missing production/OAuth/secrets. Not a verified working release. Earlier inferred-account rejection was resolved by the owner's answer; it is not an active blocker.
- Google Sites draft saved: the existing draft (editor link kept in ignored local deployment notes) . No Site overwritten or published. App embed waits for verified HTTPS/OIDC.
- Public address assigned: https://metodo-crm.onrender.com — **NOT READY**, health/login unverified. Public Sites URL: **NOT PUBLISHED**. Exact local commands and deployment procedure: docs/DEPLOY_RENDER.md; free-only optional blueprint: render.yaml.

## Owner input needed

1. No pending account-choice or Render terms question. Never request secret values in chat; configure approved services through secure surfaces.
2. Reference CV not provided; use the required default layout, no upload needed to continue.
3. Compliance files remain NOT REVIEWED until owner review. They are neutral owner-authored prompts, not legal conclusions.

## Next actions and verification boundaries

Continue package02 database/OAuth/public HTTPS, then05 secure files/processing consent and06 documents. Preserve B draft until package11 acceptance. Source safety, CSRF, owner scope, encryption, default retention and Sites headers stay enforced. Fixed local PostgreSQL launcher to probe readiness and preserve a live process before starting another instance; same-PID duplicate-start smoke passed. Package03 local commit67df966;04 commit recorded in the subsequent Git checkpoint. Matrix16/17 artifact names are separate to avoid upload collisions.

Historical Linux checks included Docker smoke,10k-player query plans, encryption rotation; do not relabel them as new runs. Windows Playwright needs sandbox-external process teardown to exit cleanly; all six previous scenarios passed with exit0. Local PostgreSQL is real16.13; new17 compatibility will be established by CI, not claimed from a version query alone.

No real football data, scraping, automatic contact messaging, legal conclusions or public test-auth deployment. No medical/guardian production ingestion before H. Optional integrations disabled until configured. Blind-index rotation remains pending. Cloud runtime tools are absent here; this does not imply account disconnection.
