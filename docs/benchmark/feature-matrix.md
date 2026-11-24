# Feature matrix

This matrix covers the baseline feature categories plus the linked SPEC update1 matrix, not just the implemented foundation. A schema/table or seed is not a built module.

Updated2026-11-19 against the requirement acceptance matrix. Baseline category summary: BUILT:7, PARTIAL:8, NOT BUILT:18, OUT OF SCOPE:0. This is a category count, not an effort or overall completion percentage. Authoritative M/R/G/innovation assignments, immutable CI links and remaining clauses are in [the acceptance matrix](../acceptance-matrix.md); session gates are in [SESSION_PLAN.md](../../SESSION_PLAN.md). Baseline A–J accepted progress:10% (A only); K/L accepted0/2;10/66 packages are DONE (original54 preserved plus12 owner-extension packages). B still needs its TFF and final review gate, while C/package15 is in progress. SPEC update1 and the approved execution plan override legacy milestone names.

New G1–G15 requirements are tracked individually in that matrix. Former G/H/I is now H/I/J. Live licensed providers are deferred by owner instruction; permitted owner-supplied file import remains in J/package47.

| Category | Status | Milestone | Evidence | Remaining scope |
|---|---|---|---|---|
| Player database | BUILT | B | M5 accepted; [player list browser evidence](../../tests/e2e/player-evidence.ts) and immutable16/17 CI in acceptance matrix | Four panels, filtering/sorting, saved views, tags, safe CSV, private portrait and timed suitability implemented |
| Player profile and card | BUILT | B | M6 accepted; [card/biography browser evidence](../../tests/e2e/player-evidence.ts) | Position scores/history/weights, league suitability, sanitized biography, print and bilingual profile PDF/DOCX implemented |
| Data-provider import | NOT BUILT | J | — | Owner-licensed file import/interface is package47; live commercial provider implementation is deferred |
| Valuation (owner-entered) | BUILT | B | M6 manual value history accepted; [API evidence](../../tests/api.test.ts) | Manual decimal value, currency, date/source/method history and chart implemented; no automated valuation |
| Similarity search | NOT BUILT | J | — | Pending |
| Scouting reports | NOT BUILT | E | — | Schema/example only |
| Scouting planner | NOT BUILT | J | — | Pending |
| Club map | BUILT | B | M1 accepted; [map/browser evidence](../../tests/e2e/club-network.ts) | Interactive country/region tree, counts, filters and genuine stored coordinates implemented |
| Club stakeholder map | NOT BUILT | J | — | Pending |
| Contacts and relationships | BUILT | B | M14/M15 accepted; [person workspace evidence](../../tests/e2e/person-network.ts) | Versioned person details, tenures/overlaps/colleagues, protected birthdays, significant dates and yearly greetings implemented |
| Mandates | PARTIAL | C/I | M11 current club/player mandate-backed sales implemented; [API evidence](../../tests/api.test.ts) | Full mandate/deal pipeline and commissions remain in packages41/42 |
| Contracts and deadlines | BUILT | C | M7 accepted at5c516b4; [contract browser evidence](../../tests/e2e/contracts.spec.ts) | Manual source-backed contracts, encrypted salary/bonus, private files, explicit timed reveals, date rules and deduplicated reminders implemented |
| Transfer process | NOT BUILT | I | — | Pending |
| Presentations | BUILT | C | M10/M12 and R3 accepted; [transfer browser evidence](../../tests/e2e/transfers.spec.ts) | Atomic suggestions, bilingual dossiers, versioned presentation log and both latest-result matrices implemented |
| Deal pipeline | NOT BUILT | I | Schema/example only | Full pipeline remains package41 |
| Commissions and receivables | NOT BUILT | I | — | Schema/example only |
| Events and speakers | NOT BUILT | E | — | Schema/example only |
| Tools and subscriptions | NOT BUILT | E | — | Schema/example only |
| Work log | NOT BUILT | E | — | Schema/example only |
| Finance ledger | NOT BUILT | E | — | Schema/example only |
| Media and press | NOT BUILT | J | — | Pending |
| Disputes | NOT BUILT | J | — | Schema/example only |
| Templates | NOT BUILT | J | — | Pending |
| Sharing links | NOT BUILT | J | — | No public share endpoint exposed |
| Calendar and ICS | PARTIAL | C | Versioned Meeting workspace, bounded agenda, restricted ICS and contract/protected birthday layers; [parser](../../tests/meeting-ics.test.ts), [layers](../../tests/e2e/agenda-layers.spec.ts) | [a1e9dc5 exact16/17 CI passed](https://github.com/metodoagency/Metodo_CRM/actions/runs/44650458994); package16 fixtures/future module overlays remain open |
| Notifications and digest | PARTIAL | C/F | Birthday/contract catch-up, notification center, recurring tasks, Meeting/ICS and date layers verified; configurable dashboard local tests passed | Dashboard immutable CI, remaining source-task adapters/future rules and weekly digest remain open |
| AI assistant | NOT BUILT | E | — | No outbound AI path |
| Data operations | PARTIAL | A/F | Core and new-module Trash, previewed retention/purge, value-free field-view logs and safe allowlisted CSV implemented | General import/subject export/backup operations remain package25; production storage verification remains package05 |
| Backup and restore | NOT BUILT | F | — | Pending |
| Mobile and PWA | PARTIAL | A/F | Responsive CSS; browser shell tests | Drawer/cards exist; installable PWA pending |
| Accessibility | PARTIAL | A/F | [TR/EN axe evidence](../../tests/e2e/a11y.spec.ts);24 current routes per language plus populated forms passed locally and in02a5854 CI | Future module routes/mobile acceptance remain package28/final |
| Bilingual (tr, en) | PARTIAL | A/F | [Dictionary check](../../scripts/i18n-check.ts);1138 keys passed a1e9dc5 CI, dashboard1162 keys/36 JSX passed locally | Future modules and current dashboard immutable CI remain pending |
| Turkish regulatory checklists | PARTIAL | A/H | tests/tooling.test.ts; config/compliance | Versioned placeholder prompts; owner review pending |

## Benchmark evidence

Competitor descriptions were not fetched or relied on. No competitive claims, prices, customer counts or provider licences have been verified. Categories are from the owner specification. No competitor code, assets, screenshots or operational data were copied.

## Differentiators

Implemented controls include masked timelines, field encryption, explicit owner approval/version boundaries, per-field provenance verification, explainable matching, private-by-default exports and Sites embedding headers. Commercial-site acquisition and automated contact messaging remain forbidden. Owner-reviewed compliance text, generalized protected backups, future workflows and live deployment acceptance remain open. The category table must not count schema-only features as implemented or treat unfinished milestone gates as accepted.

## Approved sponsorship and media extension

SPEC update2 (2026-11-20) adds K/SP1–SP8 and L/MO1–MO10, mapped to packages55–66 in [the extension scope](../COMMERCIAL_MEDIA_SCOPE.md). These18 requirements remain NOT_STARTED; no panel is claimed built. The baseline33-category count above is preserved separately. Player sponsorship/obligations/receivables, media jobs/design counts, stored-fixture timed matchday work and extended recovery/live acceptance are mandatory before expanded final delivery.
