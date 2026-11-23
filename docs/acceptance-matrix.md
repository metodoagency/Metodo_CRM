# Requirement acceptance matrix

## Owner amendment 2026-11-23 — managed documents and full-match videos

The complete owner instruction in docs/OWNER_EXTENSION_20261123.md and normative docs/MEDIA_VAULT_SCOPE.md are incorporated by reference. This later instruction explicitly replaces earlier Drive-only/no-video-upload requirements. Private managed documents, native designs, clips and full-match uploads are in scope alongside the working external Drive option. Do not remove the safe existing reference path or enable unvalidated generic production uploads. Use per-type validation, private durable storage, actual quota/reservation checks, resumable direct uploads, owner-controlled processing and verified file-object recovery. No unlimited-free-storage claim or paid activation. Preserve all01–66 clauses; append67–72 and milestone M for vault delivery. Earlier54/J and66/L are retained gates; expanded final acceptance also needs72/M. Current ledger10 DONE,5 IN_PROGRESS,57 NOT_STARTED of72; A–J10%, K/L/M0/3, independent private-pilot checklist. Documentation grants no feature acceptance. Commercial scraping/Gmail sending/automatic posting restrictions, human approval, sensitive protections and H real-minor/medical limits stay in force. Original contracts containing prohibited identifiers need local redaction or an explicit owner decision; do not silently store an unmodified copy. Keep signed originals immutable and redacted derivatives separate. Team access is not implicitly added: responsible Person records are not login accounts.


Consolidated owner amendment2026-11-20: [private-pilot ledger](PRIVATE_PILOT_PLAN.md) supplements, never replaces, every baseline and K/L row. General file upload clauses now mean encrypted external Drive resources plus the explicit private portrait/logo exception and legacy compatibility. Initial owner-only HTTPS is separate from29/F Sites/full-core acceptance. No new acceptance from the plan update; report pilot passed/pending beside DONE/66, A–J and K/L.

Updated2026-11-20. Each M row incorporates **every bullet** of its matching baseline subsection; each R/G row incorporates its entire rule in SPEC.md/baseline. A row becomes DONE only after all its clauses pass, with exact tests/commit/CI. PARTIAL evidence is not completion. 66-package ledger (original01–54 preserved): [SESSION_PLAN.md](../SESSION_PLAN.md). Accepted progress remains10% (A gate);10 packages DONE,5 in progress,51 pending. K/L extension acceptance0/2; baseline A–J10% stays separate.

Live commercial/provider implementation is explicitly deferred by SPEC update1. M35 covers licensed owner-supplied files and interfaces only. Optional features remain disabled until configured and verified. No real minor/medical production data until H.

| Requirement | Capability | Sessions | Status | Existing evidence / pending verification |
|---|---|---|---|---|
| M1 | Kulüp ağı ve harita | 07 | DONE | [PostgreSQL geography and club sections](../tests/api.test.ts), [browser filters, map and notes](../tests/e2e/club-network.ts), [TR/EN accessibility](../tests/e2e/a11y.spec.ts). [PostgreSQL 16/17 CI passed for 4840769](https://github.com/metodoagency/Metodo_CRM/actions/runs/41849766409). Commercial RSS acquisition is superseded by SPEC update 1. |
| M2 | Ajanda ve fikstür | 15,16 | PARTIAL | Versioned Meeting CRUD, bounded day/week/month agenda and privacy-restricted RFC5545 ICS implemented. [Time](../tests/meeting-time.test.ts), [independent ICS parser](../tests/meeting-ics.test.ts), [API](../tests/meetings-api.test.ts) and [browser](../tests/e2e/meetings.spec.ts). [02a5854 exact-head16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44567970465) passed209 application,87 security,28 browser per version. Contract and protected birthday overlays passed [a1e9dc5 PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44650458994):223 application,95 security,31 browser per version. Fixtures/future-module overlays remain pending. |
| M3 | Kulüp güncellemeleri ve kaynaklar | 08 | DONE | [API](../tests/api.test.ts) and [browser](../tests/e2e/core.spec.ts) coverage for the source registry, dashboard queue and previewed updates. Injury notices contain metadata only. [PostgreSQL16/17 CI passed for f3f00c5](https://github.com/metodoagency/Metodo_CRM/actions/runs/42044968007). |
| M4 | TFF personel | 08 | PARTIAL | [CSV](../tests/api.test.ts) preview creates pending proposals with official source evidence. Tenures display sources and verification. Live owner-triggered, robots-gated TFF check awaits representative anonymized markup. |
| M5 | Oyuncu veritabanı | 09,10 | DONE | Four panels, validated filters/sort, per-currency value sorting, saved filters/columns, atomic bulk tags, allowlisted CSV, private primary photo and timed league suitability. [Player-list CI for efbdb6a](https://github.com/metodoagency/Metodo_CRM/actions/runs/42698591887) and [photo and suitability CI for 186932c](https://github.com/metodoagency/Metodo_CRM/actions/runs/42705773858) passed PostgreSQL 16/17. |
| M6 | Oyuncu kartı/profil | 06,10 | DONE | Versioned TR/EN profile PDF/DOCX, position-weighted scoring, source-backed manual value history, configurable league suitability, private portrait, editable print card and sanitized biography. [API](../tests/api.test.ts) and [browser](../tests/e2e/player-evidence.ts) regression tests cover the projection and explicit timed private fields. [PostgreSQL 16/17 CI for a77391e](https://github.com/metodoagency/Metodo_CRM/actions/runs/42919677655) passed. |
| M7 | Sözleşmeler | 14 | DONE | Manual sourced encrypted records, owner-scoped API/UI, notes/files and deduplicated reminders. [API](../tests/api.test.ts), [dates](../tests/player-contracts.test.ts), [browser](../tests/e2e/contracts.spec.ts), [5c516b4 PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44496048310) passed. Final milestone C security gate remains open. |
| M8 | Performans/GPS/CV | 17,18 | NOT_DONE | — |
| M9 | Talepler | 12 | DONE | Bilingual Kanban and list, all request criteria, live club and requester links, linked suggestions and versioned changes. [API](../tests/api.test.ts), [Chromium](../tests/e2e/core.spec.ts) and [PostgreSQL 16/17 CI for c795dc1](https://github.com/metodoagency/Metodo_CRM/actions/runs/44106365479) passed. |
| M10 | Eşleştirme/öneri | 12,13 | DONE | Matching, TR/EN recommendation PDF/DOCX, private attachments, follow-up and searchable player picker. [API](../tests/api.test.ts), [browser](../tests/e2e/transfers.spec.ts), package13 security review and [PostgreSQL16/17 CI for8edb823](https://github.com/metodoagency/Metodo_CRM/actions/runs/44352395585). |
| M11 | Satış listesi | 13 | DONE | Current exact-club/player mandates, decimal listings, PRIVATE export exclusion, concurrent duplicate-open rejection and expired-mandate rules. [API](../tests/api.test.ts), [commit-conflict regression](../tests/runtime-adapter.test.ts), [PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44352395585). |
| M12 | Sunum matrisi | 13 | DONE | Versioned presentation log, latest club/player and person/player matrices, paging, overdue dashboard, TR/EN axe. [Browser](../tests/e2e/transfers.spec.ts), [PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44352395585). |
| M13 | Menajer ağı | 19 | NOT_DONE | — |
| M14 | Kişiler/çakışan görevler | 11 | DONE | Versioned person profiles, dated club tenures, overlapping roles and colleagues, direct links to Staff, and manual profile URLs under SPEC update 1. [API](../tests/api.test.ts), [browser](../tests/e2e/person-network.ts) and [PostgreSQL 16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/43910888820) passed. |
| M15 | Doğum/önemli gün | 11 | DONE | Owner calendar, 60-second date access, configurable internal reminders, encrypted annual greetings and versioned significant dates. [API](../tests/api.test.ts), [browser](../tests/e2e/core.spec.ts) and [PostgreSQL 16/17 CI for a53a344](https://github.com/metodoagency/Metodo_CRM/actions/runs/43933505387) passed. |
| M16 | Araçlar | 20 | NOT_DONE | — |
| M17 | Operasyon/muhasebe | 20,21 | NOT_DONE | — |
| M18 | Etkinlikler | 22 | NOT_DONE | — |
| M19 | Konuşmacılar | 22 | NOT_DONE | — |
| M20 | Scout raporları | 23 | NOT_DONE | — |
| M21 | Work Log | 21 | NOT_DONE | — |
| M22 | Asistan | 24 | NOT_DONE | — |
| M23 | Galeri/klip | 18 | NOT_DONE | — |
| M24 | Dashboard/görev/bildirim | 15,26,50 | PARTIAL | Notification center accepted at [ed71674 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44501075727). Versioned Task CRUD/recurrence/Trash implemented: [API](../tests/tasks-api.test.ts), [dates/schemas](../tests/tasks.test.ts), [TR/EN browser](../tests/e2e/tasks.spec.ts). Local189 unit/integration,79 security,5 agenda flows and both22-route axe scans passed; [Task exact-head16/17 CI passed](https://github.com/metodoagency/Metodo_CRM/actions/runs/44554427599) for f0ea3fd:189 unit/integration,79 security,24 browser per version. Meeting/agenda/ICS and approved Meeting→Task passed [02a5854 exact-head16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44567970465):209 application,87 security,28 browser per version. Contract/protected birthday overlays passed [a1e9dc5 exact16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44650458994). Configurable dashboard with bounded today/week data passed9 focused and3 TR/EN/late-response browser cases locally; immutable full CI pending. Automatic source-task adapters and future module widgets remain open. |
| M25 | Yedek/yönetim | 04,25,38 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M26 | Deal pipeline | 41 | NOT_DONE | — |
| M27 | Komisyon/alacak | 42 | NOT_DONE | — |
| M28 | Transfer süreci | 32,43 | NOT_DONE | — |
| M29 | Veli/reşit olmayan | 39 | NOT_DONE | — |
| M30 | Sağlık | 40 | NOT_DONE | — |
| M31 | Görsel haklar | 40 | NOT_DONE | — |
| M32 | Uyuşmazlık | 45 | NOT_DONE | — |
| M33 | Şablonlar | 46 | NOT_DONE | — |
| M34 | Paydaşlar | 47 | NOT_DONE | — |
| M35 | Performans veri merkezi | 47 | NOT_DONE | — |
| M36 | Karşılaştırma/benzerlik | 48 | NOT_DONE | — |
| M37 | Güvenli paylaşım | 52 | NOT_DONE | — |
| M38 | İletişim/Gmail | 30,49 | NOT_DONE | — |
| M39 | Taşınma | 45 | NOT_DONE | — |
| M40 | Scout operasyon | 49 | NOT_DONE | — |
| M41 | Basın | 46 | NOT_DONE | — |
| M42 | Takvim/lisans | 44 | NOT_DONE | — |
| M43 | Kulüp finans profili | 44 | NOT_DONE | — |
| M44 | Veri operasyon/audit | 04,25,40 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M45 | KPI | 50 | NOT_DONE | — |
| R1 | Coach departure | 08 | DONE | [PostgreSQL regression](../tests/api.test.ts) covers explicit person, unrelated staff, follow-up and batched timeline. [PostgreSQL16/17 CI passed for f3f00c5](https://github.com/metodoagency/Metodo_CRM/actions/runs/42044968007). |
| R2 | Coach appointment | 08 | DONE | [PostgreSQL regression](../tests/api.test.ts) covers no predecessor, stale predecessor and selected-role-only closure. [Browser test](../tests/e2e/core.spec.ts) verifies pending through preview and write on approval. [PostgreSQL16/17 CI passed for f3f00c5](https://github.com/metodoagency/Metodo_CRM/actions/runs/42044968007). |
| R3 | Suggestion transaction | 13 | DONE | [API atomic rollback/four timelines/relations](../tests/api.test.ts), chosen channel/default or overridden follow-up, null score retained, [browser](../tests/e2e/core.spec.ts), [PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44352395585). |
| R4 | Notification dedupe | 11,15,44 | PARTIAL | Birthday threshold and calendar tests accepted. Contract nine-kind deadline, repeated/concurrent catch-up and current-target filtering passed [5c516b4 PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44496048310). Notification read/snooze/expiry passed [ed71674 PostgreSQL16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/44501075727). Later module date rules remain pending. |
| R5 | Verification source | 08,10 | PARTIAL | Current B paths verified. Club update approval and separate, versioned field confirmation enforce a matching URL. [PostgreSQL 16/17 CI for 2d4cd8d](https://github.com/metodoagency/Metodo_CRM/actions/runs/43935533778) passed. Later modules remain in scope. |
| R6 | Sensitive masking | 04,06,40,52 | PARTIAL | Current B paths verified. Player CSV and profile documents plus allowlisted Club, Person and Request CSV omit private values. [PostgreSQL 16/17 CI for 2d4cd8d](https://github.com/metodoagency/Metodo_CRM/actions/runs/43935533778) passed. Later medical and sharing paths remain in scope. |
| R7 | Missing-data matching | 12 | DONE | [Per-criterion unit tests](../tests/transfer-matching.test.ts), [sensitive matching API tests](../tests/api.test.ts) and [PostgreSQL 16/17 CI for c795dc1](https://github.com/metodoagency/Metodo_CRM/actions/runs/44106365479) passed. |
| R8 | Istanbul age/minor | 11 | DONE | Explicit audited age and minor status from the Istanbul calendar. [API](../tests/api.test.ts), [date and leap-year tests](../tests/domain.test.ts), [timed reveal](../tests/e2e/person-network.ts) and [PostgreSQL 16/17 CI](https://github.com/metodoagency/Metodo_CRM/actions/runs/43910888820) passed. |
| R9 | TFF-only fixtures | 16 | NOT_DONE | — |
| R10 | CV defaults | 06,18 | NOT_DONE | — |
| R11 | Example cleanup | 01,25 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R12 | Backup/restore | 25 | NOT_DONE | — |
| R13 | AI consent | 05,24 | NOT_DONE | — |
| R14 | Embedding headers | 02,29,54 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R15 | Owner access | 02,03 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R16 | Commission arithmetic | 42 | NOT_DONE | — |
| R17 | Minor-to-adult | 39 | NOT_DONE | — |
| R18 | Medical access | 40 | NOT_DONE | — |
| R19 | Share rules | 52 | NOT_DONE | — |
| R20 | Pseudonymized purge | 40 | NOT_DONE | — |
| R21 | Outbound boundary | 30,40,53 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R22 | Neutral checklists | 14,40 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R23 | Transfer countdown | 44 | NOT_DONE | — |
| R24 | Licence alerts | 44 | NOT_DONE | — |
| R25 | Per-90 | 47,48 | NOT_DONE | — |
| R26 | Similarity | 48 | NOT_DONE | — |
| G1 | SPEC update 1 G1 | 30 | NOT_DONE | — |
| G2 | SPEC update 1 G2 | 31 | NOT_DONE | — |
| G3 | SPEC update 1 G3 | 32 | NOT_DONE | — |
| G4 | SPEC update 1 G4 | 32 | NOT_DONE | — |
| G5 | SPEC update 1 G5 | 33 | NOT_DONE | — |
| G6 | SPEC update 1 G6 | 34 | NOT_DONE | — |
| G7 | SPEC update 1 G7 | 35 | NOT_DONE | — |
| G8 | SPEC update 1 G8 | 35 | NOT_DONE | — |
| G9 | SPEC update 1 G9 | 35 | NOT_DONE | — |
| G10 | SPEC update 1 G10 | 36 | NOT_DONE | — |
| G11 | SPEC update 1 G11 | 37 | NOT_DONE | — |
| G12 | SPEC update 1 G12 | 38 | NOT_DONE | — |
| G13 | SPEC update 1 G13 | 26 | NOT_DONE | — |
| G14 | SPEC update 1 G14 | 27 | NOT_DONE | — |
| G15 | SPEC update 1 G15 | 4 | DONE | tests/api.test.ts field-view metadata; tests/e2e/core.spec.ts timed reveal + value-free view log. Later sensitive modules must reuse this boundary. |
| N1 | Relationship temperature | 26 | NOT_DONE | — |
| N2 | Next best actions | 26 | NOT_DONE | — |
| N3 | Meeting brief | 26 | NOT_DONE | — |
| N4 | Weekly digest | 27 | NOT_DONE | — |
| N5 | vCard | 27 | NOT_DONE | — |
| N6 | PWA quick capture | 27 | NOT_DONE | — |
| N7 | Player Value Index | 51 | NOT_DONE | — |
| N8 | Comparable Transfers Book | 51 | NOT_DONE | — |
| N9 | Contract Timing Advisor | 14,51 | NOT_DONE | — |
| N10 | Match narratives | 12 | DONE | Bilingual per-criterion results and missing-data explanations. [PostgreSQL 16/17 CI for c795dc1](https://github.com/metodoagency/Metodo_CRM/actions/runs/44106365479) passed. |
| N11 | Meeting debrief | 34 | NOT_DONE | — |
| N12 | Portfolio health | 50 | NOT_DONE | — |
| N13 | Extended next actions | 50 | NOT_DONE | — |
| N14 | Anomaly checks | 10,17,51 | NOT_DONE | — |

## Owner extension K/L —SPEC update2,2026-11-20

Every clause in [the normative extension](COMMERCIAL_MEDIA_SCOPE.md) and [full owner instruction](OWNER_EXTENSION_20261120.md) is incorporated. Documentation alone gives no runtime acceptance.

| Requirement | Scope | Packages | Status | Evidence |
|---|---|---|---|---|
| SP1 | Sponsor/brand, existing contacts and links | 55 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP2 | Dated opportunity pipeline and next action | 55 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP3 | Offers/agreements/versions/source/files | 56 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP4 | Cash/in-kind original-currency consideration | 57 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP5 | Partial receipts/receivables/agency finance | 57 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP6 | Deliverables and manual completion evidence | 58 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP7 | Rights, potential conflict review and current reminders | 58 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| SP8 | Player/central panel, reports and K integration | 59 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO1 | Social-account metadata/preferences | 60 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO2 | Content briefs, categories and links | 60 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO3 | Workspace, logical designs/revisions/adaptations | 61 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO4 | Owner approval and manual publication evidence | 61 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO5 | Stored-fixture timed matchday tasks | 62 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO6 | Source/rule idempotency and versioned schedule changes | 62 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO7 | Player service/office unique-asset counts | 63 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO8 | Work Log/cost/capacity reuse | 64 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO9 | Manual/file metrics and explainable readiness | 65 | NOT_STARTED | Scope mapped; no runtime acceptance. |
| MO10 | Full extended safety/recovery/live/Sites delivery | 66 | NOT_STARTED | Scope mapped; no runtime acceptance. |
