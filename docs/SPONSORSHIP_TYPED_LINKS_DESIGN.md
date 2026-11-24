# Sponsorship typed Task and resource links — implementation boundary

Recorded2026-11-24 from read-only architecture/lifecycle review of source d33ea2f. **Design only; not implemented or accepted.** Package55 stays partial. This is the next concrete follow-up after Kanban/Campaign CI, before building a second task, file or social-account system.

## Delivery order

1. Introduce independent shared parent-type constants for Brand, Campaign and SponsorshipOpportunity alongside the existing file/resource/task allowlists. Do not expand domain.entityTypes: generic CRUD, relations and export have a different contract. Avoid a runtime contracts↔external-resources import cycle.
2. Make file-parent dispatch explicit before widening its types. Brand/Campaign require the owner/live record. Opportunity uses opportunityLive, including its live Brand and optional Campaign. Missing participant/Person joins must not destroy the independent shared source. Never route a new type through core.requireEntity/delegate's Request fallback.
3. Extend task-parent's explicit switch with safe id/name projections for all three types. Complete create, relink, projection, recurrence and Trash restore checks before adding picker choices.
4. Add a new append-only migration after020 for ExternalResourceLink.brandId/campaignId/opportunityId and the three parent backrelations. Each nullable column needs a real RESTRICT FK, lookup index and resource/parent uniqueness across Trash. Replace the exactly-one-parent CHECK to include all nine parent columns. Preserve existing data, RLS and grants; do not edit an applied migration.
5. Add direct typed deep links before displaying linked source controls. Reuse /sponsorship?brand=, add ?opportunity= and ?campaign=. Resolve Campaign directly through a strict authenticated GET /api/campaigns/:id rather than its first50 list rows. Parameter changes preserve the other panel's independent state; URL back/forward and deleted/foreign targets need tests. Task and resource connection hrefs share the same path helper.
6. Reuse AttachmentPanel/ResourceWorkspace and Task editor/picker. Add paired type/id filters to taskQuery and guarded server queries for a reusable parent task panel. Owner's next-action text remains separate; linking a source never silently creates a Task.
7. Extend Attachment restore from its Contract-only parent check to validated typed file parents. ExternalResourceLink restore already uses resourceLinkParent + requireFileParent, while Task restore uses requireTaskLink. Parent purge removes only dependent joins and existing typed Task/Attachment dependants; it preserves the canonical ExternalResource and its other links. Brand/Campaign purge remains blocked by canonical opportunities.
8. Treat source errors as unavailable before exposing private resource controls. Unmount Brand/resource panels on parent404/error; abort and hide pending reveals on source/scope change. Independent library access to the same canonical resource remains available. No decrypted URL may survive in Query/Mutation caches, browser storage or a late response.
9. Verify actual new-schema encrypted recovery into a temporary PostgreSQL database. DMMF/scalar capture includes new FK fields automatically, but the schema hash changes: older bundles must not be silently treated as current. Keep the existing Task=0/consumed-receipt recovery assertion; add a separate typed-link fixture rather than weakening it.
10. Apply exact16/17 CI plus TR/EN browser/axe and required formal security review before milestone acceptance. Social-account foundation, offers, finance, media, automatic rules and managed uploads remain separate.

## Concrete files

- Shared types/schema/path: shared/contracts.ts, external-resources.ts, tasks.ts and a dependency-safe common parent/path module.
- Server guards: server/file-parent.ts, task-parent.ts, sponsorship-parent.ts.
- API/projection: server/tasks.ts, external-resources.ts, sponsorship-pipeline.ts and shared/contracts.ts route registry.
- Data/lifecycle: prisma/schema.prisma, new021 migration, server/lifecycle.ts.
- UI: src/files.tsx, external-resources.tsx, tasks.tsx, sponsorship.tsx, sponsorship-pipeline.tsx and sponsorship-campaigns.tsx.
- Evidence: existing Task/file/resource/schema suites plus a focused sponsorship-links API suite, recovery fixture and TR/EN browser deep-link/reveal cases. Register every new browser file in the existing config-driven runner.

## Required regressions

- Create/relink/recur/restore Task against each live type; reject foreign, wrong-type and missing targets.
- Opportunity becomes unavailable if Brand/Campaign disappears; its other player outcomes stay intact.
- Shared resource linked to several parents survives one parent's purge; its other link and standalone library row remain.
- XOR, FK and duplicate-link constraints reject invalid rows, including duplicate Trash links.
- Attachment restore fails while an indirect parent is unavailable.
- Deep links work for records outside the first page and support back/forward without discarding another open panel.
- Parent404 and a held reveal response never reopen a hidden URL.
- New typed links, Task data and protected metadata survive real temporary recovery with exact counts/checksums.
- Zero serious/critical axe violations in tested TR/EN/light/dark/mobile states.

Production FILE_STORAGE_MODE=drive remains fail-closed for generic binary uploads. This integration does not accept vault68 or authorize new storage, automatic website access, external processing, contact sending or social publication. Existing owner MFA/storage/review blockers stay independent.
