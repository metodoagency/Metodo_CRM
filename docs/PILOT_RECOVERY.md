# Encrypted pilot recovery helper

Implemented early package25 slice, 2026-11-24. It creates an encrypted recovery artifact and verifies it in a newly created local PostgreSQL database. It does not restore into the live application, close package25/G10/vault71, schedule monthly work or prove production Storage permissions.

## Commands

Run from the existing repository using Node22.12+ or24 and the existing `.env`. Keep the current FIELD keyring, previous FIELD keys and BLIND_INDEX_KEY in a separate owner-controlled location. The archive passphrase must be independent,20–1024 characters, in a private UTF-8 file outside `.local/backups`; do not put the passphrase in command arguments or chat. Do not regenerate application keys when moving a backup to another computer.

The source is `RECOVERY_SOURCE_DATABASE_URL`, otherwise `DIRECT_URL`, otherwise `DATABASE_URL`. Production source access needs the reviewed TLS configuration and migration metadata read permission; use the existing maintenance role. S3 reads need the existing HTTPS endpoint/private credentials. Never disable TLS or add a new paid storage plan.

```powershell
npm run backup:create -- --file .local/backups/pilot-2026-11-24.mcrm --passphrase-file .local/secrets/recovery-passphrase.txt --include-sensitive
npm run backup:verify -- --file .local/backups/pilot-2026-11-24.mcrm --passphrase-file .local/secrets/recovery-passphrase.txt
```

Create the separate passphrase file yourself in your trusted local editor. `--include-sensitive` is mandatory for creation: this is a complete encrypted recovery export, including encrypted sensitive fields, not a redacted CSV. Output files are exclusive writes under ignored `.local/backups`; an existing archive is never overwritten. Creation records only counts, format and encrypted archive hash in timeline/audit. An audit failure can leave an encrypted artifact but the command reports failure.

Verification requires an existing local PostgreSQL installation. `RECOVERY_LOCAL_DATABASE_URL` defaults to the same local development credentials at127.0.0.1:5432/postgres. Only literal loopback/localhost URLs without query overrides are accepted; the connected server address and database identity are checked again. The production source URL is never used as a restore destination. No owner credentials or URLs are printed.

Each verification writes a unique JSON result under `.local/backups/reports` and prints its relative `reportFile`. Repeated verification is supported; successful and failed runs have separate timestamps/results. Wrong passphrases and damaged artifacts fail and get a new failure report. A prior success is not a current success. Reports contain metadata/counts/errors, not field values. Retain the encrypted archive and its verification history separately from keys/passphrases.

For a local Docker database, the URL still points to loopback but PostgreSQL sees its exact container interface. Set `RECOVERY_LOCAL_SERVER_ADDRESS` only to the private IPv4 returned by `docker inspect` for that local container. No subnet-wide exception or remote URL is accepted. CI pins this address from its own service container; see the official [GitHub job context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context).

## Exact scope

- `Owner` and every compiled owner-scoped business table, including Trash, examples, protected provenance, resource links, timelines, notifications and existing Task recurrence identities.
- Sessions, OAuth attempts and the executable StorageDeletion outbox are explicitly excluded. Roles/passwords, environment/OAuth/S3/SMTP secrets, Supabase auth/storage schemas and executable migration metadata are not exported. Trusted local migrations build the destination schema.
- Manifest includes schema fingerprint, PostgreSQL version, original migration checksums and canonical verified LF/CRLF equivalents, field key IDs, table total/live/trashed/example counts and deterministic content checksums. A new/unrecognized database table or column fails instead of silently losing data.
- Decimal/BigInt, dates, timestamps, arrays and JSON use PostgreSQL scalar text. SQL NULL remains separate from JSON `null`; large JSON numbers never pass through JavaScript numeric conversion. Ciphertexts remain unchanged. Verification checks actual FIELD-key decryption and available blind indexes, not just ciphertext counts. This is not a semantic review of old records.
- Every live or trashed Attachment is included once per `(driver,key)`, with bytes, size, MIME and SHA-256. Missing/mismatched/unsupported objects fail. An absent legacy contentHash is computed for the snapshot without changing the original DB; this does not prove pre-backup integrity. Local reads reject linked/non-regular/oversized files. External Drive references are included as encrypted metadata; Drive contents are never downloaded or backed up.
- Current pilot limits:10MiB per Attachment,64MiB uncompressed archive payload and10,000 file objects. This is a bounded helper for the existing small-file path. Future large videos/native vault objects require the streaming/object backup work in71; exceeding these limits fails explicitly.

## Isolation and proof

The helper creates a random `metodo_recovery_...` database from template0, revokes PUBLIC connection access and verifies creator-only connection grants before migrations and before data loading. A separate local application role cannot connect. The same local cluster's superuser/OS owner remains trusted.

Only this newly created, empty database can receive rows. Foreign keys become deferrable solely there; all are checked IMMEDIATE before commit. No trigger disabling or replication-role bypass is used. Counts and content checksums are read back after commit. Missing parents roll back and verification fails. The helper drops only its own generated temporary database; cleanup failure prevents a successful result.

File bytes restore into a separate isolated memory target and are read back/hashed; those buffers are cleared afterward. This proves the pilot archive contains recoverable bytes, not that production bucket ACLs, provider quotas or future S3 object mapping have passed acceptance. No HTTP app, cron, processor, email, sharing endpoint or cleanup worker starts on restored data. ProcessingConsent/ShareLink records are historical data here; package25 must define revocation/new-consent semantics before any active-app restore.

Tests: `tests/recovery.test.ts` uses real PostgreSQL/migrations, mixed live/Trash objects, exact Decimal/JSON/date roundtrips, equal-count corruption, wrong keys/passwords, object loss/corruption, missing-parent rollback, separate-role connection denial, and actual repeated create/verify CLI commands. `tests/files.test.ts` covers bounded linked-file reads. Source production deployment/restore remains unverified until explicitly recorded.
