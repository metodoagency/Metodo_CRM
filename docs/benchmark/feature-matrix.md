# Feature matrix

This matrix covers the baseline feature categories plus the linked SPEC update1 matrix, not just the implemented foundation. A schema/table or seed is not a built module.

Baseline category summary: BUILT:0, PARTIAL:10, NOT BUILT:23, OUT OF SCOPE:0. This is not the overall completion percentage. Authoritative M/R/G/innovation assignments and partial evidence are in [the 100-row acceptance matrix](../acceptance-matrix.md); session gates are in [SESSION_PLAN.md](../../SESSION_PLAN.md). Overall accepted progress:10% (A only). SPEC update1 and the approved execution plan override legacy milestone names.

New G1–G15 requirements are tracked individually in that matrix. Former G/H/I is now H/I/J. Live licensed providers are deferred by owner instruction; permitted owner-supplied file import remains in J/package47.

| Category | Status | Milestone | Evidence | Remaining scope |
|---|---|---|---|---|
| Player database | PARTIAL | A/B | tests/api.test.ts; tests/e2e/core.spec.ts | Core create/read/edit API and panels; advanced table tools pending |
| Player profile and card | NOT BUILT | B | — | Infographic, scoring and suitability pending |
| Data-provider import | NOT BUILT | J | — | Licensed adapter pending |
| Valuation (owner-entered) | NOT BUILT | B | — | Schema only; no valuation UI |
| Similarity search | NOT BUILT | J | — | Pending |
| Scouting reports | NOT BUILT | E | — | Schema/example only |
| Scouting planner | NOT BUILT | J | — | Pending |
| Club map | NOT BUILT | B | — | Boundary asset committed; interactive map pending |
| Club stakeholder map | NOT BUILT | J | — | Pending |
| Contacts and relationships | PARTIAL | A/B | tests/api.test.ts | Bidirectional core relations; overlap/tenure tools pending |
| Mandates | PARTIAL | A/I | prisma/schema.prisma | Skeleton only |
| Contracts and deadlines | NOT BUILT | C | — | Schema/example only |
| Transfer process | NOT BUILT | I | — | Pending |
| Presentations | PARTIAL | A/C | tests/api.test.ts R3 | Suggestion transaction creates presentation; matrix pending |
| Deal pipeline | PARTIAL | A/I | prisma/schema.prisma | Skeleton only |
| Commissions and receivables | NOT BUILT | I | — | Schema/example only |
| Events and speakers | NOT BUILT | E | — | Schema/example only |
| Tools and subscriptions | NOT BUILT | E | — | Schema/example only |
| Work log | NOT BUILT | E | — | Schema/example only |
| Finance ledger | NOT BUILT | E | — | Schema/example only |
| Media and press | NOT BUILT | J | — | Pending |
| Disputes | NOT BUILT | J | — | Schema/example only |
| Templates | NOT BUILT | J | — | Pending |
| Sharing links | NOT BUILT | J | — | No public share endpoint exposed |
| Calendar and ICS | NOT BUILT | C | — | Read-only dashboard meeting list only |
| Notifications and digest | NOT BUILT | C/F | — | Daily command currently maintains sessions only |
| AI assistant | NOT BUILT | E | — | No outbound AI path |
| Data operations | PARTIAL | A/H | tests/api.test.ts | Core Trash and CSV; subject export fails explicitly |
| Backup and restore | NOT BUILT | F | — | Pending |
| Mobile and PWA | PARTIAL | A/F | Responsive CSS; browser shell tests | Drawer/cards exist; installable PWA pending |
| Accessibility | PARTIAL | A/F | tests/e2e/a11y.spec.ts | 8 main routes × 2 languages; detail/form coverage pending |
| Bilingual (tr, en) | PARTIAL | A/F | tests/domain.test.ts; scripts/i18n-check.ts | Foundation labels/templates covered; future modules pending |
| Turkish regulatory checklists | PARTIAL | A/H | tests/tooling.test.ts; config/compliance | Versioned placeholder prompts; owner review pending |

## Benchmark evidence

Competitor descriptions were not fetched or relied on. No competitive claims, prices, customer counts or provider licences have been verified. Categories are from the owner specification. No competitor code, assets, screenshots or operational data were copied.

## Differentiators

Foundation controls include masked timelines, field encryption, owner approval boundaries, Sites embedding headers and no automated messaging. Complete per-value provenance UI, owner-reviewed rules, explainable matching and licensed provider workflows remain pending.
