# Sponsorship and media operations — owner extension

Approved2026-11-20. The full owner instruction is preserved in [OWNER_EXTENSION_20261120.md](OWNER_EXTENSION_20261120.md). This scope adds to every baseline M1–M45/R1–R26/G1–G15 and innovation requirement. Existing A–J/package01–54 gates stay intact. K/package55–59 and L/package60–66 extend final delivery. These are work packages, not a completion-time guarantee. No new feature is accepted merely by documenting it here.

## K — sponsorship

| Requirement | Accepted behavior | Package | Dependencies | Status |
|---|---|---:|---|---|
| SP1 | Owner-scoped sponsor/brand directory, sector/manual URL, existing Person contacts, relationship timeline and player/campaign links. No duplicate plaintext contact store. |55|M14, typed owner references|NOT_STARTED|
| SP2 | Opportunity pipeline: research/contact/proposal/negotiation/agreement/active/completed/lost/cancelled; dated transitions, next action, responsible record and mandatory terminal reason. |55|SP1, Task|NOT_STARTED|
| SP3 | Versioned offers/counter-offers and agreements; dates/region/category/exclusivity notes, source/date/method and private files. Recorded potential category/date conflicts request review without legal conclusions. |56|SP1/2, G3 reusable history, files|NOT_STARTED|
| SP4 | Separate cash and in-kind consideration; explicit amount/currency/source/date/method, no invented in-kind value, no unsupported currency consolidation. |57|SP3, existing decimal helpers|NOT_STARTED|
| SP5 | Scheduled/received/remaining/overdue payments and agency income/commission links using the existing finance/commission modules. No second accounting ledger or banking/identity fields. |57|SP4, M17/M27|NOT_STARTED|
| SP6 | Deliverables for posts/stories/video/shoots/appearances/activations: quantity/format/deadline/player/campaign/account, brief/design/review/approval/ready/manual completion, revisions and delay reason. |58|SP3, Task, shared package55 foundation|NOT_STARTED|
| SP7 | Rights and versioned evidence; reminders for expiry/renewal/undelivered obligations; possible conflicts are explainable review flags only. No automatic external communication. |58|SP3/6, M31, current-target notifications|NOT_STARTED|
| SP8 | Central and per-player sponsorship panel, linked records, source-backed totals per currency, conversion/receivables/delivery reports, export privacy and K integration/security acceptance. |59|SP1–SP7, M45 reuse|NOT_STARTED|

SP6 and MO3 share a deliverable/content integration boundary rather than duplicated obligation records. Package55 establishes the common Campaign/account-reference foundation needed by sponsorship obligations; package60 completes its media-facing controls. Package58 implements the obligation approval/manual completion boundary and package61 reuses it. K can be verified without a circular dependency on the later full media workspace; L cross-module acceptance remains deferred until66.

## L — media and content operations

| Requirement | Accepted behavior | Package | Dependencies | Status |
|---|---|---:|---|---|
| MO1 | Player-linked social account metadata: platform/handle/manual URL, language/content/template/rights preferences; never platform passwords or automatic data acquisition. |60|Player, M31|NOT_STARTED|
| MO2 | Content job brief linked to one/many players, fixture, sponsor/campaign; matchday/result/performance/announcement/sponsorship/important-date/custom categories, format/due date/priority/owner or existing contractor. |60|MO1, Person, Fixture|NOT_STARTED|
| MO3 | List/Kanban/calendar workspace with dated stages, feedback/revisions/approvals, private validated files and player-card navigation. Reuse sponsorship deliverable links. |61|MO2, SP6, files/agenda|NOT_STARTED|
| MO4 | Ready and published are distinct. Only explicit owner action records publication/completion with actual date and evidence URL. Rights checks and previews reject stale actions. No tool/platform posting or external message sending. |61|MO3, M31|NOT_STARTED|
| MO5 | Owner-enabled configurable tasks/internal alerts for brief/design/review/pre-share/post-match, derived only from already stored fixtures and explicit player links. No scheduled TFF request. |62|MO2, M2 fixtures, Task|NOT_STARTED|
| MO6 | Idempotent import/task identity, fixture cancellation/postponement/kickoff edits, club/roster-link changes, multiple jobs per player/match and multiple players per asset; edited/completed jobs survive with explicit change review. Catch up after hosting sleep without duplicates. Unknown lineup remains unknown; no health inference. |62|MO5, R4, typed references|NOT_STARTED|
| MO7 | Player/date-range service report separates jobs, unique approved designs, revisions, adaptations and manual publications. Multi-player credit never inflates the office-wide unique-asset total. KPI definitions/formulas/source links remain visible; missing data is not zero performance. |63|MO3/4, M45|NOT_STARTED|
| MO8 | Work Log time, outsourced costs and capacity/delay/approval-aging views use existing records; per-player and campaign allocation is explicit. |64|MO7, M17/M21|NOT_STARTED|
| MO9 | Owner-entered or owner-file social metrics with source/date/method, no scraping/enrichment. Official API alternatives remain documented interface proposals subject to the existing deferred-provider and consent policy. Explainable stored-data readiness/coverage views may reuse G7/G9/G13. |65|MO7/8, source/import/AI consent|NOT_STARTED|
| MO10 | K/L end-to-end, owner/CSRF/privacy/audit/retention/purge/backup/restore, decimal/count/timezone/concurrency regressions, TR/EN mobile/axe/security, production/rollback and full extended app/Sites delivery. |66|all prior applicable gates|NOT_STARTED|

## Shared implementation and acceptance boundaries

- Add typed services/registries; never extend the generic delegate fall-through to unknown entity types.
- Keep one source writer in this checkout; parallel agents review read-only. Preserve original migrations and server-only Supabase storage/roles.
- Every new persisted table joins the lifecycle/retention/example-cleanup/manifest/restore model. Default automatic deletion is off; purge is previewed/versioned/audited. Reuse files, provenance, sensitive field encryption and value-free view logs.
- All external processing requires a per-document exact preview/consent. Local adapters are default. Rights documentation is recorded, not legally interpreted; actual minor/guardian/medical production records wait for H.
- No public test-auth, commercial acquisition, provider implementation, platform credentials or automated contact/platform sending. Owner digest is limited to the separate existing owner-only rules; Gmail stays read-only.
- Meaningful tests include same-fixture reimport, versioned target changes, concurrent generation, offline/sleep catch-up, design/revision/variant/multi-player counts, payment/delivery totals, decimal currencies, Istanbul boundaries and sensitive cache/log/export/share absence.
- Acceptance reports preserve three measures: baseline A–J gates, extension K/L gates and DONE/total packages. They are not effort estimates. Baseline J/54 closure alone is not final acceptance of the expanded product.
- Maintain INNOVATIONS.md and BUGS.md. Small reversible improvements within approved scope may proceed; new costs, external disclosure or changed policy require a concrete owner decision. A plugin connection does not authorize data acquisition or sending.

## Architecture audit decisions —2026-11-20

- Reuse Match as the one fixture store. Package16 must establish stable source/import identity before matchday automation. Player–Match links are explicit/historical; club changes cannot reassign old jobs. Never infer lineup or playing status.
- Task.dueDate and Notification.targetDate currently store DATE. Package62 must add a timed adapter using an unambiguous UTC due instant, Match/version and rule/version identity, with explicit unknown-kickoff handling. Do not truncate48-hour or pre-share deadlines to calendar dates. Extend the current contract-only notification adapter with current-source checks; merely inserting rows is insufficient.
- FinanceEntry currently requires exchange rate/date/source/TRY conversion, and PaymentSchedule belongs to CommissionTerm. Package57 must retain original-currency sponsorship receivables/partial receipts until sourced FX is available, using explicit appropriate sponsorship relationships or a documented nullable conversion state. Never invent a rate or attach unrelated commission terms just to fit the schema.
- Use one Campaign shared by sponsorship/media. Content job, logical design, revision, adaptation and publication are separate identities. Reuse WorkLog.linkedEntities and explicit new parent guards. Do not model sponsorship agreements as employment contracts; reuse secure machinery through typed services.
- Existing uploads support PDF/raster. Package61 must explicitly design safe handling or owner-entered external links for other native design formats, with no automatic preview/fetch and no silent expansion of the upload allowlist. Preserve match-video-link-only and private file/rights rules.
- Read-only scope audit found these integration gaps; this is planning evidence, not implementation acceptance. No production data/provider call was made.
