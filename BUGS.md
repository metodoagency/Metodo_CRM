# Defect register

Updated2026-11-20. This register tracks concrete defects, separately from unimplemented requirements and provider/owner blockers. Status requires an observed regression result; absence of an entry is not proof that the whole product is defect-free.

| ID | Severity | Reproduction and expected behavior | Correction / evidence | Status |
|---|---|---|---|---|
| BUG001 |Low|Feb29 occurrence in common year1 returned `1-03-01`; calendar dates must retain four-digit years.|Padding correction in shared/calendar.ts; pure range regression in tests/agenda-overlays.test.ts passed in the first focused run. Full new-snapshot CI remains pending.|FIX_IMPLEMENTED_CI_PENDING|
| BUG002 |High dependency inventory|Prisma/config6.19.3 installed Effect3.21.0 affected by GHSA-7589-6fvf-x4pw. No CRM HTTP-controlled TemplateLiteral path was found.|Scoped3.22.1 override, one installed copy; controlled before-timeout/after-rejection proof, ordinary controls, Prisma generate and audit0 passed. Full snapshot verification pending; no production rollout.|FIX_IMPLEMENTED_VERIFICATION_PENDING|
| BUG003 |Medium|A legacy paymentDay=0 made contract detail throw and could abort internal reminder generation, preventing owner repair.|A reproduced failing pure test established the exception. Shared deadline calculation now flags INVALID_PAYMENT_DAY, preserves other valid deadlines and skips monthly payments. Writes still reject invalid days; detail offers a specific repair instruction. Current regression/CI verification pending.|FIX_IMPLEMENTED_VERIFICATION_PENDING|

Critical/high findings block release. Record source commit, regression and closure evidence when resolving a defect. Test-fixture omissions and approval/runtime outages belong in verification/progress records rather than being presented as product defects.
