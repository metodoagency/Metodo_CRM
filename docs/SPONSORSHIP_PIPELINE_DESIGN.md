# Next sponsorship slice — Campaign and multi-player opportunities

Read-only architecture review recorded2026-11-24. **Core slice implemented; package55 remains partial.** See SPONSORSHIP_PIPELINE.md and PROGRESS.md for actual evidence and remaining social-account/typed Task/file work; core, membership and Kanban/Campaign evidence is complete for the recorded immutable source commits. Continue from the working Brand/BrandContact directory; do not create a second directory or finance ledger. This preserves the next concrete package55 step while the current immutable CI runs.

## Data boundaries

- One shared Campaign for sponsorship/media: owner envelope, name, optional known dates and explicit linked sources. Media reuses the same identity later. Keep social account metadata/account-reference foundation in package55/60 acceptance; Campaign alone does not close55.
- SponsorshipOpportunity references the Brand and optional Campaign. Store the global operational stage, known last-contact date, next action/date and owner or an existing responsible Person record. Responsible Persons are not login accounts.
- OpportunityPlayer has a unique opportunity/player pair and its own stage/outcome/reason/next action. One player's agreement/win never changes other players or the global stage. Adding/removing a player retains dated history; removing one participant cannot destroy the shared opportunity or other players' records.
- Opportunity contacts use an explicit dependent join to the existing brand/Person relationship. Do not put a mandatory contact FK on the canonical shared opportunity that causes Person/link purge to cascade through the whole deal. Responsible-record removal may require explicit reassignment; never silently assign work to another person.
- Dated stage events are append-only and distinguish global from player changes. Avoid a currentHistoryId FK back from its parent: lifecycle deletionOrder rejects cycles. Current stage stays scalar; ordered event history is separate. Versions are evidence, not new identities.
- Keep free-text negotiation excerpts/private document references protected. Reuse ExternalResource's encrypted URL/reveal boundary; do not store private URLs in ordinary sourceUrl/provenance/timeline. New sensitive slots must join encryption/masking/rotation/view-log/backup registries.
- Do not add amount/FX/in-kind allocation fields or fake financial totals in this slice. Original-currency considerations, installment/receipt and commission integration follow the real finance dependency in57; one opportunity amount can never be multiplied by player count.

## Commands and UI

Use a typed sponsorship-parent service, not core.delegate/requireEntity's generic Request fallback. Explicitly register any later Task/Meeting/file parent; the directory currently opens none of those types. All parent ownership/live/brand correspondence must be rechecked in the transaction.

Expose opportunity list/detail/create and distinct global/player transition preview+confirmation commands. A signed preview binds session/owner, exact field changes, target records and versions, source membership/contacts, expiry and one-time consumption. Terminal global completed/lost/cancelled and terminal player outcomes require a reason. Do not infer a legal agreement, fee or publication from an operational stage.

Create/update canonical state, dated history and related timeline entries in one serializable transaction. A stale/concurrent confirmation fails without losing the UI draft or retrying canonical writes. Lists/Kanban show global stage separately from each player's result, next action, contact and source links. Unknown dates remain unknown. Multi-player selection survives search/paging in component memory; no business browser storage.

## Required evidence

Two players, one accepted/one declined; global stage unchanged by either player transition; stale/concurrent/replayed previews create one event only; foreign/deleted/mismatched brand contacts rejected; parent/contact/player cleanup preserves the shared opportunity and other players; changed previews reject confirmation; no sensitive text/URL in ordinary logs/CSV; example/lifecycle/retention/default-no-deletion integration; actual temporary restore preserves all canonical/history rows and checksums; TR/EN mobile/axe and exact16/17 CI. All new tables remain within72-package scope. Core/player/Campaign/membership/Kanban evidence is recorded throughd33ea2f CI45452199860. Full SP1/SP2/package55 remain partial until account foundation and typed Task/file integration are implemented and verified.
