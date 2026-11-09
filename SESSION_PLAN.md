# Metodo CRM — 54 oturumluk uygulama planı

Owner-approved 2026-11-03. An oturum is a verified work package, not a message count or time guarantee. Pilot: 29. Final: 54. Work may continue across chats without waiting for 'devam'. Preserve the current checkout; one writer, no new worktree. This file and PROGRESS.md are durable state.

## Authoritative decisions

- SPEC.md includes docs/REQUIREMENTS.md; SPEC update 1 overrides older rules. A is merged, B remains draft PR #2.
- Existing React/TypeScript/Fastify/Prisma/single-owner OIDC/TR+EN architecture stays.
- Owner selected existing Supabase PostgreSQL 17 production; preserve local PostgreSQL 16 and test compatibility in CI on 16/17.
- Render Free, one application container, Supabase DB/private persistent files; no paid upgrades. Free hosting sleeps and has ephemeral disk: no 24/7 SLA. Never deploy a test-login stub publicly.
- Gmail bridge runs via Codex's read-only plugin, not a fictitious plugin inside the CRM server. Only pending proposals, original excerpts, Message-ID dedupe; no sending.
- No automated commercial-site fetching/crawling/parsing. TFF only on owner click with robots permission and CSV fallback, never scheduled. Market/contract data manual with source/date/method. Live licensed providers deferred; interfaces and permitted file imports only.
- OCR/transcription local by default. External processing disabled until per-document exact payload preview/consent. Owner dictation only; no third-party conversations.
- No automatic business-data deletion by default. Per-table durations do not enable deletion. Preview/version/owner confirmation and logged purge required.
- Sensitive proposal values/excerpts also encrypted and masked in audit. Preview confirmation binds record versions/content; changed previews require a fresh confirmation.
- Backups containing sensitive data encrypted by default; manifest counts + canonical business-data checksums. Monthly local Windows helper restores only into temporary DB, marks missed runs and catches up on next start.
- No real minor, medical or guardian production records until H acceptance. No fabricated football data or banking/identity identifiers.
- Required CSP frame-ancestors includes https://sites.google.com and https://*.google.com; no X-Frame-Options.

## Current package ledger

| No | İş | Kabul ölçütü | Durum |
|---|---|---|---|
| 01 | Devir ve kabul matrisi | Planı kaydet; eski durumları ayır; M/R/G ve yenilikleri test kanıtlarıyla eşle. | DONE |
| 02 | Ücretsiz yayın altyapısı | Render + Supabase 17 + Google OIDC; gerçek HTTPS sağlık/giriş; stub yok. | IN_PROGRESS |
| 03 | Gizlilik ve ihlal sayfası | TR/EN ilk giriş bildirimi, sürüm kaydı, ihlal adımları ve sahip iletişim alanı. | DONE |
| 04 | Saklama ve erişim günlüğü | Tüm tablolarda varsayılan otomatik silme yok; önizlemeli purge; değersiz hassas alan erişim kaydı. | DONE |
| 05 | Güvenli dosya ve işlem onayı | 10 MB, MIME/magic-byte, EXIF temizliği, özel depolama, beş dakikalık indirme; belge başına harici işlem onayı. | IN_PROGRESS |
| 06 | Ortak belge motoru | TR/EN PDF/DOCX, tek veri kaynağı, fallback, sürüm/kaynak ve hassas veri hariç tutma. | DONE |
| 07 | Kulüp ağı | M1: ülke/bölge ağacı, sayılar, gerçek koordinatlar, tüm bağlı detay panelleri. | DONE |
| 08 | Personel ve güncellemeler | M3/M4 R1/R2: kaynaklı öneri onayı, doğru kişi/görev, sürüm/digest, sahip tetiklemeli robots izinli TFF. | IN_PROGRESS |
| 09 | Oyuncu veritabanı | M5: dört panel, arama/sıralama/filtre, kayıtlı görünüm, toplu etiket, güvenli CSV. | IN_PROGRESS |
| 10 | Oyuncu kartı | M6: puan/alt kriter/ağırlık/geçmiş, lig uygunluğu, manuel değer/kaynak/tarih/yöntem, temiz rich text ve profil çıktısı. | IN_PROGRESS |
| 11 | Kişiler ve doğum günleri | M14/M15 R8: görev çakışması, önemli tarihler, İstanbul saati; B kabul/CI/güvenlik. | NOT_STARTED |
| 12 | Talepler ve eşleştirme | M9/M10 R7: Kanban, eksik veri normalizasyonu, kapsam ve açıklamalar. | NOT_STARTED |
| 13 | Öneri ve sunumlar | M10–M12 R3: atomik öneri, sunum matrisi, yetkili satış listesi, temel kulüp yetkisi ve öneri dosyası. | NOT_STARTED |
| 14 | Sözleşmeler | M7: manuel kaynaklı tarihler/yöntem, şifreli maaş, nötr kontrol listesi ve süre takibi. | NOT_STARTED |
| 15 | Ajanda ve bildirimler | M2 ajanda M24 R4: ICS, görev, dashboard, okuma/erteleme/dedupe; C kabul. | NOT_STARTED |
| 16 | Fikstürler | M2 R9: anonim TFF HTML testleri, robots ve CSV fallback, hiçbir planlı fetch yok. | NOT_STARTED |
| 17 | GPS ve performans | M8: kolon eşleme, satır hataları, idempotent import, metrik ve anomali kontrolü. | NOT_STARTED |
| 18 | Galeri ve transfer CV | M8/M23 R10: hak notları, klip URL, doğru bölüm sırası, PDF metni/DOCX XML; D kabul. | NOT_STARTED |
| 19 | Menajer ağı | M13: ortak oyuncular, harita ve çift yönlü ilişkiler. | NOT_STARTED |
| 20 | Araçlar ve dış kaynak | M16/M17: abonelik/yenileme/karar/teslimat ve ilişkiler. | NOT_STARTED |
| 21 | Muhasebe ve Work Log | M17/M21: decimal tutar/kur ve rapor; gün/hafta/ay çalışma kayıtları. | NOT_STARTED |
| 22 | Etkinlikler ve konuşmacılar | M18/M19: tarihli pipeline, program, masraf ve takip görevleri. | NOT_STARTED |
| 23 | Scout raporları | M20: rapor, puan, kaynak ve serbest isimden onaylı oyuncu kaydı. | NOT_STARTED |
| 24 | Asistan | M22 R13: kaynak kayıtlı sorgu, yoksa bilgi yok; AI kapalı varsayılan ve tam yük onayı; E kabul. | NOT_STARTED |
| 25 | Yedek ve yönetim | M25 R12: tablo CSV import, şifreli hassas yedek, sürümlü önizlemeli restore, eksik hassas alanı koruma. | NOT_STARTED |
| 26 | İlişki sıcaklığı ve özet | Açıklanabilir sıcaklık/aksiyon ve timeline tabanlı toplantı özeti; G13 ortak uygulaması. | NOT_STARTED |
| 27 | Digest, vCard ve PWA | Haftalık uygulama özeti, vCard, shell-only cache, mobil capture ve başarısız formu koruma; G14. | NOT_STARTED |
| 28 | Çekirdek kalite | TR/EN tüm ana yollar axe; mobil/klavye/global arama; 10.000 oyuncuda yerel p95 <500ms. | NOT_STARTED |
| 29 | Pilot ve Google Sites | Gerçek HTTPS/OIDC/CSP/iframe/fallback doğrulaması; yetişkin ve sağlık/veli verisi içermeyen pilot; F kabul. | NOT_STARTED |
| 30 | Gmail köprüsü | G1: Codex plugin read-only; kural/alıntı/Message-ID; öneri-only, gönderim yok. | NOT_STARTED |
| 31 | Sözleşme okuyucu | G2: yerel PDF/OCR adayları ve alan başına kaynak alıntısı/onay; kanoniğe izinsiz yazma yok. | NOT_STARTED |
| 32 | Müzakere ve kontrol listesi | G3/G4: sıralı teklif/karşı teklif ve sahip tanımlı adım/deadline; sürüm kontrolü. | NOT_STARTED |
| 33 | Senaryo hesaplayıcı | G5: ücret/maaş/bonus/ek ödeme decimal toplamı ve formüller; değerleme yok. | NOT_STARTED |
| 34 | Yerel ses notları | G6: sahibi başlatır, yerel transkripsiyon, kayıttan önce metin onayı; debrief. | NOT_STARTED |
| 35 | Eksik veri ve komutlar | G7/G8/G9: eksik alan listesi/skoru; kesin sorgu/değişiklik onayı; son giriş özeti. | NOT_STARTED |
| 36 | Aylık yedek doğrulama | G10: yerel yardımcı, geçici PostgreSQL, sayı/checksum karşılaştırması, bozulma ve kaçırılmış çalışma kaydı. | NOT_STARTED |
| 37 | Scout ısı haritası | G11: lig/pozisyon/puan bandı sayıları DB ile eşleşir. | NOT_STARTED |
| 38 | Kişi birleştirme | G12: yan yana alan seçimi, linkleri koruma, maskeli log; G1–G15 kanıtları ve G kabul. | NOT_STARTED |
| 39 | Reşit olmayanlar | M29 R17: şifreli veli, onaylı 18 yaş geçişi; otomatik veli silme yok. | NOT_STARTED |
| 40 | Sağlık ve görsel hakları | M30/M31 R18: her hassas okuma kaydı, export dışlamaları, fotoğraf hak kontrolü; H kabul. | NOT_STARTED |
| 41 | Anlaşmalar ve yetkiler | M26: pipeline, kapanış nedeni, decimal olasılık ağırlıklı tahmin ve mandate. | NOT_STARTED |
| 42 | Komisyon ve alacak | M27 R16: %100 bölüşüm, taksit toplamı, KDV/yuvarlama ve yaşlandırma sınırları. | NOT_STARTED |
| 43 | Transfer süreçleri | M28: adım sırası, belge/istisna nedeni, engel widget'ı ve timeline. | NOT_STARTED |
| 44 | Dönem ve finans profili | M42/M43 R23/R24: kaynaklı dönem/lisans/manuel finans ve kullanıcı tıklamalı opsiyonel TCMB; I kabul. | NOT_STARTED |
| 45 | Dosyalar ve taşınma | M32/M39: nötr kontrol listeleri, deadline dedupe, kapanış nedeni, maskeli okul verisi. | NOT_STARTED |
| 46 | Şablon ve basın | M33/M41: tipli yer tutucu, onaylı şablon, reproducible snapshot ve manuel yayın. | NOT_STARTED |
| 47 | Paydaş ve performans merkezi | M34/M35: mevcut kişi, lisanslı kullanıcı dosyası CSV, DATA_PROVIDER provenance ve per-90; canlı provider yok. | NOT_STARTED |
| 48 | Karşılaştırma ve benzerlik | M36 R25/R26: dört oyuncu, kısa listeler, dakika eşiği, eksik veri ve deterministik z-score. | NOT_STARTED |
| 49 | Scout operasyon ve iletişim | M40/M38: görev/rapor/masraf onayı, kapsama sayıları ve manuel iletişim; Gmail G1'i tekrar kullan. | NOT_STARTED |
| 50 | KPI ve portföy | M45: tanımlı/saf hesaplar, kaynak kayıt/CSV, portföy sağlığı ve genişletilmiş aksiyonlar. | NOT_STARTED |
| 51 | İç endeks ve emsaller | PVI faktörleri, emsal medyan/IQR/örneklem, zamanlama ve açıklanabilir öneriler; piyasa değeri iddiası yok. | NOT_STARTED |
| 52 | Güvenli paylaşım | M37 R19: en çok 30 gün, 410, hash passcode, watermark, hassas/PRIVATE dışlama. | NOT_STARTED |
| 53 | Bütünleşik kabul | Tüm gereksinim kanıtları, güvenlik/yük/restore/rollback provası; gerçek veriye dokunma. | NOT_STARTED |
| 54 | Son yayın ve teslim | Doğrulanmış app ve Sites URL, komut/kılavuz/yedek/bakım; J ve %100 nihai kabul. | NOT_STARTED |

## Acceptance and execution contract

Each package reports behavior delivered, API/schema/migration change, observed tests, commit/PR, remaining work and exact next step. Implement tests with the feature. Do not call partial code/schema/stubs DONE. Update the ledger only from actual evidence; related uncompleted requirements stay PARTIAL or NOT_DONE.

At each milestone: lint, TypeScript, build, real PostgreSQL integration, unit, i18n, compliance, security and applicable browser/axe checks; complete Codex Security review and no unresolved high/critical finding. Merge only exact-head green CI. WIP commits stay on their milestone branch. Shared features are built once with cross-references (G13 at26, G14 at27, G15 at04); later module-specific restrictions extend them.

Test critical failures: wrong coach/other staff unchanged; rollback on transaction error; source/approval enforcement; stale version/preview/replay; no default purge; masked logs/share/export; per-document consent; unchanged row counts with changed checksum must fail; real OAuth/iframe and blocked-cookie fallback. Local 10,000-example-player p95 <500ms, record hardware/plan. No serious/critical axe violations in TR/EN.

Acceptance percentage = accepted milestone gates /10, not effort. A10%; B(session11)20%; C15→30%; D18→40%; E24→50%; F29→60%; G38→70%; H40→80%; I44→90%; J/final54→100%. No public URL is reported until actual successful deployment.

## Resume

Read AGENTS.md, SPEC.md, this file, PROGRESS.md and acceptance matrix; inspect Git state. Resume the last unfinished package, preserving owner changes. Do independent work while real owner/provider blocks are recorded. Secrets belong only in ignored local configuration/provider secret settings, never chat/source/logs. If interrupted, commit WIP and save the exact next step. Do not recreate finished work.
