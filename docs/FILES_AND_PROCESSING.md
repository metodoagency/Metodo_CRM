# Private files and processing consent

Package05 implementation; production storage verification is still pending. Node22.12+ is required. New dependencies are pinned with the lockfile.

## Upload and storage

- Record cards accept one PDF, JPEG, PNG or WebP, up to10 MiB. Extra multipart fields/files, MIME/signature mismatches, corrupt images and videos are rejected. The multipart envelope is bounded too. DOCX upload is not enabled; generated DOCX exports belong to package06.
- Photos are decoded with a40-million-pixel cap, resized to at most1600×1600, and re-encoded as WebP without metadata. Checksums describe the stored bytes. Optional malware scanning is an injected adapter; enabling `CLAMAV_ENABLED` without one rejects uploads. No ClamAV service is silently assumed.
- Original filenames are metadata only. Storage uses random64-hex keys. Local development files are outside served directories with exclusive creation. Every local read requires an owner session. Production refuses the local storage fallback.
- Configure `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` through the provider secret surface. Production endpoints must use HTTPS. Confirm the selected bucket is **private** before enabling uploads. No browser receives storage credentials or unrestricted upload URLs.
- S3 uploads have private/no-store cache instructions and attachment disposition. Download-link issuance is authenticated, version-checked and logged without contents. Signed S3 downloads last300 seconds. Local development downloads are authenticated on every read. Changing the bucket/root requires an explicit object migration; do not repoint storage while records or cleanup jobs still reference its objects.

Supabase S3 keys bypass storage RLS and must remain server-only; use the endpoint/region from the existing project's S3 configuration. See [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication) and [supported S3 operations](https://supabase.com/docs/guides/storage/s3/compatibility). Photo metadata removal follows [sharp's default output behavior](https://sharp.pixelplumbing.com/api-output/#keepmetadata).

## Deletion and failed uploads

The `StorageDeletion` infrastructure outbox carries only owner, opaque key, driver, scheduling and retry metadata. It is protected from business-retention settings. Before a storage write a delayed cleanup job is committed. Successful attachment creation cancels that job in the same transaction. Failed writes/commits leave a retryable job; referenced objects are never removed.

Owner-confirmed record/example/retention purge creates file cleanup jobs atomically with attachment removal, including linked consent records. A response hook attempts cleanup after commit; daily maintenance and the Settings retry button consume outstanding jobs. Failed deletes stay queued. No business record is deleted because of a configured retention duration or file date alone. Parent trash/restore keeps files; downloads are blocked while the parent is trashed.

## Document processing boundary

No OCR, transcription or external processing provider is installed by this package. The adapter list is empty by default; the UI states that clearly. This does not complete G2/G6. `EXTERNAL_PROCESSING_ENABLED=false` is the default and blocks external adapters even if registered.

The reusable flow is preview → exact confirmation → single execution. A registered adapter declares its location, revision and destination. The current boundary accepts **text only**, with a document reference/checksum; it never sends the raw file or other records. Future binary/audio processing needs its own exact preview, not an extension hidden behind text consent.

The preview binds its document/version/hash, exact text, adapter revision/destination and10-minute expiry. Payload and result are AES-GCM encrypted, included in key rotation, and excluded from audit values. Preview views are logged without values. Missing consent, changed content/document/adapter, expiry, stale version and replay prevent invocation. Consent is consumed in a serializable transaction before invoking the adapter. Failed processing needs a fresh preview and approval. The adapter receives no canonical database handle; results remain encrypted drafts. Per-field proposal review belongs to the contract-reader package.

Verification covers actual PostgreSQL transactions, rollback, concurrent single execution, encrypted output, a loopback S3 protocol server, signed expiry, EXIF removal, file/path/type limits, outbox retry/reference protection, and a browser upload/download with TR/EN accessibility checks. Production Supabase upload/download/delete remains NOT VERIFIED until the private bucket and server credentials are configured.
