# Previewed sponsorship membership and responsibility

Implemented2026-11-24 within partial package55 and the original bounded private-pilot10 slice. The full package's account foundation, Kanban, Campaign editor and typed Task/file integration remain open. No new login account, financial ledger, external request or outbound communication is introduced.

## Owner workflow

On an opportunity, add an existing Player, add an existing BrandContact for the whole opportunity or a particular player link, remove a link into Trash, restore a removed link or select a new responsible Person. Choosing the record owner is explicit; missing/deleted responsible Persons never silently reassign work.

Every command first shows exact link/source/Trash/history changes, target names/IDs and versions. Confirmation binds the normalized command, allocated record/event IDs, authenticated session, opportunity path, whole source graph, selected external parents, relevant retention/Trash versions and expiry with a purpose-separated HMAC. Inside a Serializable transaction the server rebuilds the plan and rejects changed, stale, forged, expired, concurrent or replayed confirmation. Preview does not change canonical records.

Player/brand-link uniqueness includes Trash. Adding a removed link returns an explicit restore instruction instead of creating a copy. Restore changes deletion/version metadata only: stage, outcome and encrypted next action remain intact. Links whose Player/Person is unavailable may still be removed while the opportunity itself is available. A removed player's scoped contact rows remain intact and temporarily unavailable; restoring that player restores their parent availability without recreating contacts.

Responsible replacement does not rewrite the former join's personId. It creates a new join or explicitly previews restoration of a previous join, places the former assignment into Trash and records UNLINK/LINK events with a shared batch. Migration020 replaces the former all-history responsible index with one active responsible per opportunity, plus a unique opportunity/person pair across Trash. Player/brand uniqueness is unchanged. Generic Trash restore checks active responsible conflicts even when the current Person is unavailable, restores PERSON mode and appends LINK in the same transaction.

History returns recorded public labels rather than relabeling old events with the current responsible person's name. Example child ownership follows its source/linked parent; removing an example former responsible does not remove a real new responsible or the shared opportunity. New example link labels retain the linked person's/player's identity with an example prefix when required. Existing historical events are not rewritten.

## UI and protection

Private request/response state remains outside Query/Mutation caches. After a successful edit, only the safe canonical DTO is applied immediately to the opportunity query before closing the editor; invalidation refreshes lists/history/Trash. This prevents a rapid next command from opening on an old source version while preserving cancel/unmount generation checks. Private values/ciphertexts and approval plans are never cached. Existing private disclosure cancellation/scope/404 protections remain.

Removed links show whether their parent chain and capacity permit restoration. The owner can inspect blocked links; capacity and uniqueness are enforced again on the server, not inferred from a disabled button. No canonical Player, Person, Brand, private action or terminal result is deleted by unlink.

All retained joins and history remain in encrypted full recovery and checksum manifests. Tests restore both a trashed old responsible and an active new responsible into an isolated temporary database. Default automatic business deletion remains disabled.

## API and evidence

- `GET /api/sponsorship/opportunities/:id/membership/trash`
- `POST /api/sponsorship/opportunities/:id/membership/preview`
- `POST /api/sponsorship/opportunities/:id/membership/confirm`

Strict command variants: ADD/REMOVE/RESTORE_PLAYER, ADD/REMOVE/RESTORE_CONTACT and SET_RESPONSIBLE. All writes retain normal owner, Origin and CSRF checks. Generic `/api/trash/:id/restore` remains available with the strengthened typed parent checks.

Evidence: `tests/sponsorship-membership.test.ts`, previous pipeline/directory tests, `tests/recovery.test.ts`, TR/EN mobile/dialog/full-page axe in `tests/e2e/membership.spec.ts` plus existing private-response regressions. The main E2E driver derives all projects from Playwright configuration, including these tests. Exact final source CI and acceptance are recorded in PROGRESS.md.
