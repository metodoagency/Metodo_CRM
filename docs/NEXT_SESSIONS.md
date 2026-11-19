# Metodo CRM — sonraki oturumlar

19.11.2026. Oturum numaraları [onaylanan 54 paketlik planla](../SESSION_PLAN.md) aynıdır. Oturum bir iş paketidir; tek mesaj veya belirli gün sayısı değildir. Tamamlanan paketler yeniden kurulmaz. Kabul durumu ve test kanıtları [PROGRESS.md](../PROGRESS.md) ve [kabul matrisinde](acceptance-matrix.md) tutulur.

## Açık erken paketler

| Paket | Kalan somut iş |
|---|---|
| 02 | Mevcut Cloud projesinin sahibi hesapla onaylanmış OAuth istemcisini oluştur; sırları Render'a kaydet; gerçek sahip girişi, HTTPS sağlık ve yetkisiz erişimi doğrula. Eski projeID’si her iki açık hesapta erişim reddediyor; erişim düzeltmesinden sonra açılan doğru proje bağlantısı bekleniyor. |
| 05 | Mevcut güvenli dosya akışını üretimde özel Supabase depolaması, kısa süreli indirme ve silme kuyruğuyla doğrula. |
| 08 | Personel CSV akışını koru; temsili anonim TFF personel sayfası veya sahibin başlattığı kesin sayfa kontrolüyle robots izinli kontrolü tamamla. Zamanlanmış veya ticari site isteği ekleme. |
| 11 | M14/M15 tamam. Kalan M4 ve B güvenlik/CI kapısı doğrulandıktan sonra B kabulünü kapat. |

Bu erişim işleri, bağımsız CRM geliştirmelerini durdurmaz. Paket 13, eşzamanlı satış düzeltmesi dahil, 8edb823 için PostgreSQL 16/17 CI geçtikten sonra tamamlandı. Paket 14 de 5c516b4 için PostgreSQL 16/17 CI geçtikten sonra tamamlandı. 10/54 paket tamam, 5 paket devam ediyor (15 dahil), 39 paket başlamadı. Resmî aşama kabulü A kapısı nedeniyle %10.

## Geliştirme sırası

| Oturum | Yapılacak iş | Bitişte kullanılabilen davranış |
|---|---|---|
| 15 (devam ediyor) | Bildirim/görev/toplantı/ICS doğrulandı. Sırada sözleşme ve korumalı doğum günü katmanları, dashboard düzeni ve kalan otomatik görev adaptörleri var. | Birleşik tarihli işler ve dashboard; ilgili güvenlik/CI kapıları sonrası C kabulü. |
| 16 | TFF fikstürü ve CSV | Yalnız sahip tetiklemesi + robots izni; hata halinde doğrulanmış CSV. |
| 17 | GPS ve performans CSV | Kolon eşleme/önizleme, satır hataları, tekrar kontrolü ve testli metrikler. |
| 18 | Galeri, klip ve transfer CV | Hak notlu görseller, zaman damgalı klipler, TR/EN PDF/DOCX; D kabulü. |
| 19 | Menajer ağı | Gerçek ilişki/koordinatlarla harita, ortak oyuncular ve çift yönlü gezinme. |
| 20 | Araç ve dış kaynak takibi | Abonelik, yenileme, karar, teslim tarihi ve bağlı kayıtlar. |
| 21 | Operasyon muhasebesi ve Work Log | Decimal para hesapları ve günlük/haftalık/aylık çalışma raporları. |
| 22 | Etkinlik ve konuşmacı süreçleri | Tarihli pipeline, program, görev, masraf ve hatırlatmalar. |
| 23 | Scout raporları | Kaynaklı değerlendirme ve serbest isimden onayla oyuncu kaydına bağlama. |
| 24 | Sorgu asistanı | Kaynak kayda bağlı sonuçlar, bulunmayan bilgide açık yanıt, onaysız dış çağrı engeli; E kabulü. |
| 25 | Yönetim, genel CSV ve yedek | Şifreli hassas yedek, manifest, önizlemeli geri yükleme ve mevcut hassas değerleri koruma. |
| 26 | İlişki sıcaklığı ve toplantı özeti | Görünür skor/gerekçe, sonraki iş ve timeline'dan şablonlu toplantı özeti; G13. |
| 27 | Haftalık özet, vCard ve PWA | İş verisini çevrimdışı saklamayan mobil hızlı kayıt; başarısız form metnini koruma; G14. |
| 28 | Çekirdek kalite | Mobil/klavye/global arama, TR/EN axe ve 10.000 örnek oyuncuda p95 hedefi. |
| 29 | Çekirdek pilot yayını | Gerçek HTTPS/OIDC, Sites iframe ve çerez engeli fallback'i; F kabulü. H öncesi gerçek sağlık/veli/reşit olmayan verisi yok. |
| 30 | Gmail salt okunur köprü | Codex'te seçilen mesajdan kural/alıntı/Message-ID içeren tekil öneri; gönderim yok. |
| 31 | Yerel sözleşme okuyucu | PDF'den kaynak alıntılı alan adayları; her alan ayrı onaylanmadan kanonik kayıt değişmez. |
| 32 | Müzakere ve transfer kontrol listesi | Sıralı teklif/karşı teklif, taraf/tarih/durum, sahip tanımlı adımlar. |
| 33 | Senaryo maliyet hesabı | Maaş/bonus/bonservis birleşimlerinin açık formüllerle toplam maliyeti; değerleme yok. |
| 34 | Yerel ses notu | Sahip diktesi, yerel transkripsiyon, kaydetmeden metin onayı. |
| 35 | Eksik veri, komut çubuğu ve giriş özeti | Boş alan listesi, kesin değişiklik önizlemesi/onayı, bekleyen onay ve yaklaşan işler. |
| 36 | Aylık yedek doğrulaması | Geçici PostgreSQL'e dönüş, sayı/checksum karşılaştırması ve kaçırılan çalışmanın kaydı. |
| 37 | Scout ısı haritası | Gerçek raporlardan lig/pozisyon/puan bandı sayıları. |
| 38 | Kişi birleştirme | Yan yana alan seçimi, ilişki koruma ve maskeli timeline; tüm G kanıtları ve G kabulü. |
| 39 | Reşit olmayanlar ve veli | Şifreli alanlar, sahip onaylı 18 yaş geçişi ve veli kaydını koruma. |
| 40 | Sağlık ve görsel hakları | Hassas erişim kayıtları, hak notlu paylaşım ve veri dışlama; H kabulü. |
| 41 | Anlaşma ve yetki pipeline'ı | Kapanış nedenleri, para birimine göre olasılık ağırlıklı tahmin. |
| 42 | Komisyon, taksit ve alacak | %100 bölüşüm, doğru taksit toplamı, KDV/yuvarlama ve yaşlandırma. |
| 43 | Transfer süreci | Sıralı adımlar, gerekli belge veya gerekçeli istisna ve engellenen iş widget'ı. |
| 44 | Transfer dönemleri ve kulüp finansı | Kaynaklı dönem/lisans, manuel finans profili, isteğe bağlı sahip tıklamalı TCMB; I kabulü. |
| 45 | Uyuşmazlık ve taşınma | Nötr kayıt/checklist, son tarih, kapanış nedeni ve korunan okul verisi. |
| 46 | Şablon ve basın merkezi | Tipli yer tutucular, eksik alanda çıktı engeli ve sahip onaylı manuel yayın. |
| 47 | Kulüp paydaşları ve performans merkezi | Mevcut kişiler, izinli lisanslı dosya içe aktarma ve per-90; canlı sağlayıcı yok. |
| 48 | Oyuncu karşılaştırma ve kısa liste | Eksik veri normalizasyonu, dakika eşiği ve deterministik benzerlik. |
| 49 | Scout görev/masraf ve iletişim günlüğü | Görevden rapora geçiş, masraf onayı, kapsama sayıları; dış mesaj gönderimi yok. |
| 50 | KPI ve portföy sağlığı | Görünür metrik tanımları, testli hesaplar ve kaynak kayıt bağlantısı. |
| 51 | İç oyuncu endeksi ve emsal defteri | Faktör/ağırlık/örneklem, medyan/IQR ve küçük örneklem uyarısı; piyasa değeri iddiası yok. |
| 52 | Güvenli paylaşım | En çok30 gün, iptal/sona ermede410, hash parola, hassas/PRIVATE içerik dışlama. |
| 53 | Bütünleşik kabul ve kurtarma | Güvenlik/yük/yedekten dönüş/rollback provası; gerçek veriyi silmeden tüm gereksinim kanıtları. |
| 54 | Son yayın ve teslim | Doğrulanmış uygulama/Sites URL'leri, kullanım ve bakım kılavuzu, yerel komutlar; J ve nihai kabul. |

## Codex çalışma düzeni

Mevcut projede aynı checkout ile devam edin. Tek kod yazan çalışma korunur; alt ajanlar bağımsız salt okunur incelemeler yapabilir. Her paket uygulama, ilgili testler, commit ve PROGRESS kaydıyla tamamlanır. Sonraki bağımsız paket için ayrıca “devam” beklenmez. Kesintide `SESSION_PLAN.md ve PROGRESS.md üzerinden son tamamlanmamış paketi sürdür` demeniz yeterlidir.

Kabul kapıları: A %10; B %20; C %30; D %40; E %50; F/pilot %60; G %70; H %80; I %90; J/son teslim %100. Bu yüzde harcanan emek veya yazılan kod yüzdesi değildir. Ücretsiz kaynak sınırı, ticari scraping yasağı, Gmail gönderim yasağı, onay ve hassas veri korumaları tüm oturumlarda geçerlidir.
