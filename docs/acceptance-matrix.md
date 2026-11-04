# Requirement acceptance matrix

Updated 2026-11-03. Each M row incorporates **every bullet** of its matching baseline subsection; each R/G row incorporates its entire rule in SPEC.md/baseline. A row becomes DONE only after all its clauses pass, with exact tests/commit/CI. PARTIAL evidence is not completion. 54-package ledger: [SESSION_PLAN.md](../SESSION_PLAN.md). Overall accepted progress remains10% (A gate only).

Live commercial/provider implementation is explicitly deferred by SPEC update1. M35 covers licensed owner-supplied files and interfaces only. Optional features remain disabled until configured and verified. No real minor/medical production data until H.

| Requirement | Capability | Sessions | Status | Existing evidence / pending verification |
|---|---|---|---|---|
| M1 | Kulüp ağı ve harita | 07 | PARTIAL | Implemented and passed locally. [PostgreSQL geography and club sections](../tests/api.test.ts), [browser filters, map and notes](../tests/e2e/club-network.ts), [TR/EN accessibility](../tests/e2e/a11y.spec.ts). Exact commit PostgreSQL 16/17 CI pending. Commercial RSS acquisition is superseded by SPEC update 1. |
| M2 | Ajanda ve fikstür | 15,16 | NOT_DONE | — |
| M3 | Kulüp güncellemeleri ve kaynaklar | 08 | PARTIAL | — |
| M4 | TFF personel | 08 | PARTIAL | — |
| M5 | Oyuncu veritabanı | 09 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M6 | Oyuncu kartı/profil | 06,10 | PARTIAL | Basic versioned profile PDF/DOCX, tests/documents.test.ts and player export browser flow. Scoring, league fit, history and the full card remain in10. |
| M7 | Sözleşmeler | 14 | NOT_DONE | — |
| M8 | Performans/GPS/CV | 17,18 | NOT_DONE | — |
| M9 | Talepler | 12 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M10 | Eşleştirme/öneri | 12,13 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M11 | Satış listesi | 13 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M12 | Sunum matrisi | 13 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M13 | Menajer ağı | 19 | NOT_DONE | — |
| M14 | Kişiler/çakışan görevler | 11 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M15 | Doğum/önemli gün | 11 | NOT_DONE | — |
| M16 | Araçlar | 20 | NOT_DONE | — |
| M17 | Operasyon/muhasebe | 20,21 | NOT_DONE | — |
| M18 | Etkinlikler | 22 | NOT_DONE | — |
| M19 | Konuşmacılar | 22 | NOT_DONE | — |
| M20 | Scout raporları | 23 | NOT_DONE | — |
| M21 | Work Log | 21 | NOT_DONE | — |
| M22 | Asistan | 24 | NOT_DONE | — |
| M23 | Galeri/klip | 18 | NOT_DONE | — |
| M24 | Dashboard/görev/bildirim | 15,26,50 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M25 | Yedek/yönetim | 04,25,38 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M26 | Deal pipeline | 41 | NOT_DONE | — |
| M27 | Komisyon/alacak | 42 | NOT_DONE | — |
| M28 | Transfer süreci | 32,43 | NOT_DONE | — |
| M29 | Veli/reşit olmayan | 39 | NOT_DONE | — |
| M30 | Sağlık | 40 | NOT_DONE | — |
| M31 | Görsel haklar | 40 | NOT_DONE | — |
| M32 | Uyuşmazlık | 45 | NOT_DONE | — |
| M33 | Şablonlar | 46 | NOT_DONE | — |
| M34 | Paydaşlar | 47 | NOT_DONE | — |
| M35 | Performans veri merkezi | 47 | NOT_DONE | — |
| M36 | Karşılaştırma/benzerlik | 48 | NOT_DONE | — |
| M37 | Güvenli paylaşım | 52 | NOT_DONE | — |
| M38 | İletişim/Gmail | 30,49 | NOT_DONE | — |
| M39 | Taşınma | 45 | NOT_DONE | — |
| M40 | Scout operasyon | 49 | NOT_DONE | — |
| M41 | Basın | 46 | NOT_DONE | — |
| M42 | Takvim/lisans | 44 | NOT_DONE | — |
| M43 | Kulüp finans profili | 44 | NOT_DONE | — |
| M44 | Veri operasyon/audit | 04,25,40 | PARTIAL | Foundation API tests; full baseline subsection remains pending |
| M45 | KPI | 50 | NOT_DONE | — |
| R1 | Coach departure | 08 | NOT_DONE | — |
| R2 | Coach appointment | 08 | NOT_DONE | — |
| R3 | Suggestion transaction | 13 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R4 | Notification dedupe | 11,15,44 | NOT_DONE | — |
| R5 | Verification source | 08,10 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R6 | Sensitive masking | 04,06,40,52 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R7 | Missing-data matching | 12 | NOT_DONE | — |
| R8 | Istanbul age/minor | 11 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R9 | TFF-only fixtures | 16 | NOT_DONE | — |
| R10 | CV defaults | 06,18 | NOT_DONE | — |
| R11 | Example cleanup | 01,25 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R12 | Backup/restore | 25 | NOT_DONE | — |
| R13 | AI consent | 05,24 | NOT_DONE | — |
| R14 | Embedding headers | 02,29,54 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R15 | Owner access | 02,03 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R16 | Commission arithmetic | 42 | NOT_DONE | — |
| R17 | Minor-to-adult | 39 | NOT_DONE | — |
| R18 | Medical access | 40 | NOT_DONE | — |
| R19 | Share rules | 52 | NOT_DONE | — |
| R20 | Pseudonymized purge | 40 | NOT_DONE | — |
| R21 | Outbound boundary | 30,40,53 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R22 | Neutral checklists | 14,40 | PARTIAL | tests/api.test.ts, tests/domain.test.ts, tests/acquisition-policy.test.ts; full milestone behavior still requires acceptance |
| R23 | Transfer countdown | 44 | NOT_DONE | — |
| R24 | Licence alerts | 44 | NOT_DONE | — |
| R25 | Per-90 | 47,48 | NOT_DONE | — |
| R26 | Similarity | 48 | NOT_DONE | — |
| G1 | SPEC update 1 G1 | 30 | NOT_DONE | — |
| G2 | SPEC update 1 G2 | 31 | NOT_DONE | — |
| G3 | SPEC update 1 G3 | 32 | NOT_DONE | — |
| G4 | SPEC update 1 G4 | 32 | NOT_DONE | — |
| G5 | SPEC update 1 G5 | 33 | NOT_DONE | — |
| G6 | SPEC update 1 G6 | 34 | NOT_DONE | — |
| G7 | SPEC update 1 G7 | 35 | NOT_DONE | — |
| G8 | SPEC update 1 G8 | 35 | NOT_DONE | — |
| G9 | SPEC update 1 G9 | 35 | NOT_DONE | — |
| G10 | SPEC update 1 G10 | 36 | NOT_DONE | — |
| G11 | SPEC update 1 G11 | 37 | NOT_DONE | — |
| G12 | SPEC update 1 G12 | 38 | NOT_DONE | — |
| G13 | SPEC update 1 G13 | 26 | NOT_DONE | — |
| G14 | SPEC update 1 G14 | 27 | NOT_DONE | — |
| G15 | SPEC update 1 G15 | 4 | DONE | tests/api.test.ts field-view metadata; tests/e2e/core.spec.ts timed reveal + value-free view log. Later sensitive modules must reuse this boundary. |
| N1 | Relationship temperature | 26 | NOT_DONE | — |
| N2 | Next best actions | 26 | NOT_DONE | — |
| N3 | Meeting brief | 26 | NOT_DONE | — |
| N4 | Weekly digest | 27 | NOT_DONE | — |
| N5 | vCard | 27 | NOT_DONE | — |
| N6 | PWA quick capture | 27 | NOT_DONE | — |
| N7 | Player Value Index | 51 | NOT_DONE | — |
| N8 | Comparable Transfers Book | 51 | NOT_DONE | — |
| N9 | Contract Timing Advisor | 14,51 | NOT_DONE | — |
| N10 | Match narratives | 12 | NOT_DONE | — |
| N11 | Meeting debrief | 34 | NOT_DONE | — |
| N12 | Portfolio health | 50 | NOT_DONE | — |
| N13 | Extended next actions | 50 | NOT_DONE | — |
| N14 | Anomaly checks | 10,17,51 | NOT_DONE | — |
