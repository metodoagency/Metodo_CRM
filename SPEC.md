# Metodo CRM specification

The complete baseline in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) is incorporated by reference. This amendment is authoritative where earlier text conflicts. All prior owner instructions remain in force unless explicitly replaced here: TypeScript, TR/EN, owner OIDC, CSRF, encryption, provenance/approval, truthful tests, milestone PRs/green CI, public HTTPS deployment and publication of the app in Google Sites. Preserve all existing work and real data. Continue independent work when owner input is pending.

## SPEC update 1 — 2026-11-03

### Data acquisition policy (replaces P4 and every earlier scraping permission)

- No automated fetching, crawling, scraping or parsing of Transfermarkt or any other commercial site, under any circumstances, including personal use. Do not implement such code. Opening a link for the owner to read manually is allowed.
- TFF pages may be read only on an owner-triggered check, after robots.txt explicitly permits the target path. Disallow, inaccessible robots or check failure uses CSV import. Never schedule TFF fetching. Retain identifying User-Agent, host rate limit and cache rules from the baseline where compatible.
- Market values and contract data are entered manually with sourceUrl, date and method note.
- Licensed providers are deferred. An adapter interface may be designed, but implement no provider now. Record this decision in PROGRESS.md.
- Owner-forwarded/selected mailbox messages are read through the Gmail plugin read-only. Parsed messages become UpdateProposals with original excerpts; no canonical writes without owner approval. Gmail sending remains forbidden.
- Optional enabled transcription runs locally on owner-dictated notes. Never record third-party conversations.

### Required minimum data protection

- Bilingual first-login privacy notice describing data categories, purpose, retention and the owner as data controller; acceptance/version is tracked.
- Retention and previewed purge per table. Default is no automatic business-data deletion; the owner chooses. Duration settings alone do not enable deletion.
- Field-level sensitive view/access logs record events only, never values.
- Sensitive-data backup exports are encrypted by default.
- Bilingual breach checklist page with steps and an owner-editable contact field.
- Local contract/OCR/transcription adapters process locally. External processing is Tier A: each document/use requires owner consent and a preview of the exact payload before transmission.

### Milestone sequence

A Foundation; B Clubs/players; C Transfers; D Matches/documents; E Network/operations; F Hardening; **G Additional workflows** below. Preserve the previous G Medical/minors/data operations as H, previous H Money/deals as I, and previous I Intelligence/network as J. No original scope is removed. Minimum controls apply across all milestones; they cannot be deferred past production use.

| ID | Required feature |
|---|---|
| G1 | Gmail read-only mailbox bridge; owner sender/domain rules; proposal shows original excerpt |
| G2 | Local PDF contract reader extracts signed/start/end dates, salary, bonuses, release amount/dates and buyout; source excerpt per field; owner approves each field independently |
| G3 | Ordered offers/counter-offers per transfer: fee, salary, bonuses, add-ons, date, party and status |
| G4 | Configurable transfer checklist with owner deadlines/statuses; no legal interpretation |
| G5 | Salary/bonus/fee scenario total-cost comparison with displayed formulas; no valuation |
| G6 | Optional local voice transcription into Work Log, confirmation before saving |
| G7 | Missing-data score per record with exact empty fields |
| G8 | Natural-language create/suggest/find command bar; exact database-change preview and confirmation before commit |
| G9 | Since-last-login digest of approvals, changed records and deadlines |
| G10 | Monthly latest-backup restore into temporary database; compare counts/checksums and record mismatches/result |
| G11 | Scout heatmap grouped by league, position and score band |
| G12 | Duplicate-person merge with side-by-side field choice and timeline log |
| G13 | Template-based pre-meeting brief from linked entity timelines |
| G14 | Installable mobile quick-capture PWA; preserve baseline prohibition on offline business-data caching |
| G15 | Sensitive field view/access log without field values |

### Required tests

1. Static lint/test prevents commercial-site scraping paths and HTTP-client acquisition paths for Transfermarkt. A manual outbound link is not an acquisition path.
2. Privacy notice appears on first login in both languages.
3. Contract reader writes no canonical field without per-field approval.
4. Every external processing adapter rejects absent per-document consent or unapproved exact payload preview.
5. Monthly backup verification compares counts and checksums and reports mismatches.

These features remain NOT DONE until their implementation and tests pass. Track each requirement and evidence in PROGRESS.md/feature matrix. Source code or schema alone does not count as acceptance.
