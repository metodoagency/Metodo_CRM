# Protected contract links and legacy evidence

Implemented compatibility slice, 2026-11-24. This does not close package67's immutable vault/version requirements or the pilot recovery gate.

## Runtime boundary

- New document URLs go to `Contract.privateDocumentLink` using AES-GCM. Existing non-Drive document URLs remain supported without weakening the canonical library's Drive validator.
- Private Drive/Docs source URLs and their complete original provenance entries go to encrypted `Contract.privateSourceEvidence`. Public sources and unchanged public provenance retain their exact values, source types and verification states.
- Ordinary contract responses return existence flags and null for hidden URLs. The editor never fills hidden fields; omitted URLs remain unchanged. Explicit document clear/replace and source replacement are owner actions.
- Versioned disclosure is owner/session/CSRF protected, audited by field name without values, no-store, and expires after60 seconds from the server request. The UI also bounds expiry from its request start, hides on focus/visibility changes and rejects delayed responses after hide/navigation. Private results and submitted URLs are not placed in TanStack mutation/query caches.
- Historical public timeline responses mask private URLs even before maintenance. The migration preserves original private diffs in encrypted AuditLog/TimelineEvent evidence, with a masked ordinary diff. These encrypted slots participate in key rotation and sensitive exclusion.

## Existing-data conversion

Keep a separately encrypted recovery copy and the existing encryption/blind-index keys before production maintenance. Do not seed examples or run destructive tests against a production URL. Run from the existing trusted maintenance environment with the correct owner database and keyring:

```powershell
npm run db:migrate
npm run data:protect-contract-links
```

Migration015 adds nullable compatibility columns only; SQL never contains keys or plaintext conversion. The application command covers owned rows including Trash. Each conversion checks the record version and atomically stores encrypted evidence before clearing its old plaintext slot. Each contract conversion writes a value-free event. Public evidence is preserved. Conflicting dual sources, unknown keys, corrupt ciphertext or stale versions stop the command rather than selecting or losing a source silently. Earlier successfully converted rows remain safe and a retry resumes idempotently. A completed second run reports zero changes. Counts alone do not prove a production recovery rehearsal.

`npm run keys:rotate` runs this compatibility pass before normal rotation. Only the new always-encrypted slots are in `encryptedFields`; the legacy mixed plaintext `documentLink` column is never blindly decrypted. Retain previous keys until database and backup rotation is verified.

No URL is fetched, permission changed, Drive file migrated/deleted or original document content altered. A disclosure audit proves CRM link display, not actual reading of the remote document. Move future document/version organization through the canonical resource/vault work; do not auto-copy a binary file.

## Verification

`tests/contract-evidence-api.test.ts` covers private/public replacement, exact public provenance preservation, mixed legacy/deleted rows, idempotency, stale guards, rollback after audit failure, conflict rejection, corrupt/empty ciphertext, nested-array masking and owner disclosure guards. `tests/e2e/contracts.spec.ts` covers the existing manual contract lifecycle, TR/EN private links, sparse editing, absolute expiry and a deliberately late response with AbortSignal ignored. Final acceptance requires the exact source commit's PostgreSQL16/17 CI.
