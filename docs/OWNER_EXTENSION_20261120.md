# Owner instruction —2026-11-20

Metodo CRM’i mevcut çalışmadan devral ve kapsamlı bir futbol ofisi operasyon platformuna dönüştür.

Rolün yalnız verilen ekranları kodlamak değil; ürün mimarı, geliştirici, kalite sorumlusu ve operasyon tasarımcısı olarak çalışmaktır. Kullanıcının tekrar tekrar “devam” demesini beklemeden, yetkilendirilmiş ve engellenmeyen işleri sürdür.

Mevcut gereksinimlerin tamamı geçerlidir. Aşağıdaki talimatlar önceki kapsamın üzerine eklenir.

1. MEVCUT ÇALIŞMAYI DEVRAL

Önce mevcut çalışma klasörünü, Git dalını ve kaydedilmemiş değişiklikleri doğrula. Ardından şunları oku:

- AGENTS.md
- SPEC.md
- docs/REQUIREMENTS.md
- PROGRESS.md
- SESSION_PLAN.md
- docs/acceptance-matrix.md
- docs/NEXT_SESSIONS.md
- docs/AGENDA_IMPLEMENTATION.md
- İlgili özellik matrisi ve güvenlik belgeleri.

Depoyu yeniden oluşturma. Mevcut kullanıcı çalışmalarını koru. Tamamlanmış özellikleri tekrar yazma.

İlk somut işin, önceki çalışmadan kalan ajanda sözleşme/doğum günü katmanlarını ve tamamlanmamış testlerini devralmak olsun. Kaydedilmemiş kodu incele, eksiklerini düzelt ve gerçekten çalıştırarak doğrula. Önceki başarılı test sonuçlarını yeni değişikliklerin sonucu gibi kullanma.

Sonra 15. paketin kalan dashboard, tarih katmanları ve görev adaptörlerini planla uygulamaya devam et.

Mevcut React/TypeScript, Fastify, Prisma, tek sahipli Google OIDC, sunucu oturumları ve TR/EN mimarisini koru. Mimari değişiklik ancak somut gerekçe ve göç planıyla önerilebilir.

2. ÖNCEKİ KAPSAMI EKSİKSİZ KORU

54 paketlik mevcut plan, M1–M45, R1–R26, G1–G15 ve şartnamedeki yenilikler geçerlidir.

Kulüp/oyuncu yönetimi, transferler, sözleşmeler, finans, scout, kişiler, belgeler, ajanda, Work Log, gizlilik, yedekleme, PWA, paylaşım ve diğer mevcut gereksinimlerden hiçbirini yeni özellikler uğruna çıkarma.

Yeni sponsorluk ve medya kapsamını SPEC.md, AGENTS.md, SESSION_PLAN.md ve kabul matrisine işle. Mevcut A–J aşamalarını yeniden numaralandırmadan, gerekirse K ve L aşamaları ve ek iş paketleri oluştur.

Yeni işler için bağımlılıkları, kabul ölçütlerini ve testleri belirt. Genişleyen kapsamın hâlâ kesin olarak54 pakette biteceğini iddia etme.

Çekirdek pilotu gereksiz yere geciktirme. Yeni panellerin ortak altyapısını mevcut modüllerle birlikte kur; kapsamın tamamı bitmeden genişletilmiş ürünün nihai kabulünü kapatma.

3. YENİ KAPSAM: OYUNCU SPONSORLUK PANELİ

Her oyuncudan ve merkezî sponsorluk ekranından erişilen bir sponsorluk çalışma alanı oluştur.

Şunları kapsasın:

- Sponsor/marka kaydı, sektör, web adresi, ilişkili kişiler ve ilişki geçmişi.
- Oyuncu, marka, kampanya, fırsat ve sözleşme bağlantıları.
- Fırsat pipeline’ı: araştırma, temas, teklif, görüşme, anlaşma, aktif, tamamlandı, kaybedildi/iptal.
- Aşama geçiş tarihleri, sonraki aksiyon, sorumlu ve kaybetme/iptal nedeni.
- Teklifler, karşı teklifler ve anlaşmanın sürüm geçmişi.
- Başlangıç/bitiş tarihleri, bölge, kategori ve sahibin kaydettiği münhasırlık notları.
- Nakdî ve ayni sponsorlukların ayrı takibi.
- Ödeme planı, beklenen/tahsil edilen tutar, kalan alacak ve gecikme.
- Para birimi, kaynak, tarih ve yöntem notu.
- Ajans geliri/komisyon bağlantısı; mevcut finans altyapısını yeniden kullan.
- Sözleşme ve dosyalara güvenli bağlantılar.
- Yaklaşan yenilemeler ve yerine getirilmemiş yükümlülükler.

Sponsor iletişim kişilerini mevcut kişi diziniyle ilişkilendir. E-posta ve telefon için ikinci, korumasız bir veri kopyası oluşturma.

Sponsorluk yükümlülükleri ayrı takip edilebilsin:

- Gönderi, story, video, fotoğraf çekimi, etkinlik katılımı ve marka aktivasyonu.
- Adet, format, hedef tarih, bağlı oyuncu, kampanya ve ilgili sosyal hesap.
- Brief, tasarım, inceleme, onay, hazır ve sahibin işaretlediği yayınlandı/tamamlandı durumları.
- Gerçek tamamlanma tarihi ve sahibin eklediği kanıt bağlantısı.
- Revizyonlar, gecikme nedeni ve sonraki görev.

Sözleşme metninden hukuki sonuç üretme. Kategori/tarih çakışmaları varsa bunları “kontrol gerektiren olası çakışma” olarak, dayandığı kayıtlarla göster.

Bilinmeyen ayni değerleri veya para birimi dönüşümlerini uydurma. Farklı para birimlerini kaynaksız tek toplamda birleştirme.

4. YENİ KAPSAM: SOSYAL MEDYA VE TASARIM OPERASYON PANELİ

Oyuncu, kampanya ve maç bazında çalışan bir içerik operasyon alanı oluştur.

Sosyal hesap kayıtları şu bilgileri tutabilsin:

- Platform, kullanıcı adı ve sahibin girdiği profil bağlantısı.
- Bağlı oyuncu ve içerik tercihleri.
- Dil, format, marka şablonu ve kullanım hakkı notları.

Platform şifrelerini CRM’de saklama. Mevcut kaynak politikasını değiştirmeden sosyal platformlardan otomatik veri toplama veya gönderim ekleme.

İçerik işleri şu alanları kapsasın:

- Başlık ve brief.
- Oyuncu/oyuncular, maç, sponsor ve kampanya bağlantıları.
- İçerik türü: matchday, sonuç, performans, duyuru, sponsorluk, özel gün veya sahibin tanımladığı kategori.
- Format, planlanan tarih, son teslim, sorumlu ve öncelik.
- Tasarım dosyaları, sürümler ve geri bildirimler.
- Onay, hazır olma ve manuel yayın kaydı.
- Harcanan süre ve gerekiyorsa dış kaynak maliyeti.
- Fotoğraf, logo ve görsel kullanım hakkı bilgileri.

Liste, Kanban ve takvim görünümleri sun. Oyuncu kartından ilgili içerik işlerine ve dosyalarına gidilebilsin.

Dışarıya otomatik paylaşım yapılmasın. “Yayınlandı” durumu sahibin açık işlemiyle ve tarih/kanıt bilgisiyle kaydedilsin. Tasarımın hazır olması yayınlandığı anlamına gelmesin.

5. FİKSTÜRLE BAĞLANTILI MATCHDAY İŞ AKIŞI

Kayıtlı fikstürü sosyal medya operasyonuna bağla.

Sahip bir oyuncuyu ilgili maça bağladığında veya izin verilen kuralları etkinleştirdiğinde, yapılandırılabilir içerik görevleri ve iç bildirimler üret:

- Brief hazırlığı.
- Matchday tasarımı.
- İçerik kontrolü/onayı.
- Paylaşım zamanı yaklaşması.
- İsteğe bağlı maç sonrası içerik takibi.

Öncelik ve süreler sahibi tarafından belirlenebilsin. Örneğin maçtan48 saat önce hazırlık ve belirlenen paylaşım saatinden önce son kontrol gibi kurallar desteklenebilir; bunları değiştirilebilir ayar yap.

Hatırlatmalar yalnız mevcut kayıtlı fikstürden üretilsin. Zamanlanmış hatırlatma çalışması yeni TFF isteği başlatamasın.

Şunları doğru ele al:

- Ertelenen, iptal edilen veya saati değişen maç.
- Oyuncunun kulüp değişikliği.
- Aynı maçın tekrar içe aktarılması.
- Bir oyuncunun aynı maç için birden fazla içerik işi.
- Bir tasarımda birden fazla oyuncu.
- Eski hedefe bağlı bildirimin güncelliğini kaybetmesi.
- Uyuyan sunucuda kaçırılmış çalışmanın kontrollü telafisi.

Kimlikler ve sürümler üzerinden idempotency sağla; tekrar çalışan iş aynı görevi çoğaltmasın. Tarih değişikliklerinde sahibin düzenlediği taslağı veya tamamlanmış işi sessizce değiştirme.

Kadro ve ilk11 durumu bilinmiyorsa bunu açıkça belirt. Oyuncunun oynayacağını varsayma. Sağlık verisinden otomatik sonuç üretme.

6. OYUNCU BAŞINA TASARIM VE HİZMET RAPORU

Her oyuncu için tarih aralığına göre şunlar görülebilsin:

- Açılan içerik işi.
- Tamamlanan ve onaylanan tasarım.
- Bekleyen işler.
- Revizyon sayısı.
- Format uyarlamaları.
- Manuel yayın kaydı.
- Matchday içerik kapsamı.
- Sponsorluk teslimatları.
- Harcanan süre ve kayıtlı maliyet.

“Tasarım”, “revizyon”, “format uyarlaması” ve “yayın” farklı ölçüler olsun. Aynı tasarımın yeni sürümünü yeni tasarım sayma.

Birden fazla oyuncuya bağlı işlerde oyuncu bazlı hizmet görünümü ile ofis genelindeki benzersiz tasarım toplamını ayır. Çift sayımı önle.

Her KPI’ın tanımı, formülü, tarih filtresi ve kaynak kayıtları görülebilsin. Eksik veri sıfır performans gibi sunulmasın.

Sosyal medya erişim/etkileşim verileri başlangıçta manuel veya sahibin sağladığı dosyalarla girilebilsin. Resmî API seçeneklerini yalnız mevcut politikaya uygun, ayrıca değerlendirilecek adaptör önerileri olarak ele al.

7. YARATICI ÜRÜN GELİŞTİRME YETKİN

Gereksinimleri uygularken ofisin gerçek işlerini kolaylaştıracak öneriler geliştir.

Örneğin:

- Oyuncu bazında bu hafta yapılması gerekenler.
- Yaklaşan maçlar için içerik hazırlık durumu.
- Geciken sponsor teslimatları.
- Uzun süredir içerik üretilmeyen oyuncular.
- Tasarım iş yükü ve kapasite görünümü.
- Onay bekleyen işlerin yaşlandırılması.
- Toplantı öncesi oyuncu/sponsor özeti.
- Sözleşme, transfer ve medya işlerini birleştiren günlük aksiyon listesi.

Mevcut G özelliklerini yeniden yazmak yerine kullan.

Önerileri INNOVATIONS.md içinde şu bilgilerle kaydet:

- Çözdüğü somut sorun.
- Kullanıcı faydası.
- Gereken veri ve bağımlılıklar.
- Tahmini uygulama büyüklüğü.
- Gizlilik/maliyet etkisi.
- Kabul ölçütü.
- Durum ve karar gerekçesi.

Onaylı kapsam içindeki küçük, geri alınabilir iyileştirmeleri uygula. Yeni ücret, harici veri aktarımı, farklı veri edinme politikası veya esaslı kapsam değişikliği gerektiren kararları sahibine bırak.

Yalnız öneri listesi üretip uygulamayı bırakma. Seçilen öneriyi çalışan davranış, test ve kanıtla teslim et.

8. VERİ, GİZLİLİK VE İLETİŞİM SINIRLARI

Mevcut SPEC update1 ve güvenlik kuralları bütün yeni modüllerde geçerlidir:

- Transfermarkt ve diğer ticari siteler için scraping/crawl/parser kodu yazma.
- TFF kontrolü yalnız sahibin açık tetiklemesi ve hedef yolu izin veren robots kontrolüyle çalışsın; hata/engel durumunda CSV kullanılsın.
- TFF isteği zamanlanmasın.
- Fikstür kaynağı kuralını sessizce genişletme. TFF kapsamı dışındaki kaynak ihtiyacını Owner input needed bölümüne kaydet.
- Canlı lisanslı veri sağlayıcı uygulaması ekleme; mevcut ertelenmiş adaptör kararını koru.
- Gmail yalnız okunabilir; alınan içerik öneriye dönüşür.
- Harici kişi, kulüp, oyuncu veya sponsora otomatik mesaj ya da sosyal paylaşım gönderme.
- Sahibin kendi özetleri yalnız mevcut şartnamedeki açık kapsam ve yapılandırma içinde değerlendirilebilir.
- Harici belge/görsel/ses işleme öncesinde gönderilecek içeriği göster ve belge bazında ayrı onay al.
- Yerel işleme varsayılan olsun.
- Hassas alanlar ve hassas öneri alıntıları şifreli, maskeli ve değer içermeyen erişim günlükleriyle korunsun.
- Yeni tablolar saklama, önizlemeli purge, Trash, yedek ve geri yükleme kapsamına girsin.
- Varsayılan otomatik silme olmasın.
- Banka/kimlik/kart bilgisi alanları ekleme.
- Gerçek sağlık, veli ve reşit olmayan üretim verileri için mevcut H kabul sınırını koru.
- Maç videoları için mevcut bağlantı temelli kuralı koru.
- PWA çevrimdışı iş verisi saklamasın.
- Örnekler açıkça kurgusal ve isExample=true olsun.

Bir eklentinin bağlı olması, veri toplama veya dışarıya gönderim izni sayılmaz.

9. ARAÇLAR VE OTONOM ÇALIŞMA

Göreve katkısı olan bağlı araçları ve alt ajanları kullan. Bütün eklentileri sırf yüklü oldukları için kullanma; gereksiz veri aktarımı, yeni hesap veya ikinci CRM oluşturma.

Aynı checkout’ta tek kaynak kodu yazarı olsun. Alt ajanlara bağımsız, salt okunur mimari, güvenlik, veri doğruluğu ve kullanıcı deneyimi incelemeleri ver.

Mevcut servis bağlantılarını doğrulamadan “erişim yok” veya “hazır” deme. Daha önce verilmiş ilgili onayları tekrar isteme.

Gerçek engelleri PROGRESS.md / Owner input needed altında somut biçimde kaydet:

- Gereken kesin bilgi/işlem.
- Neden gerektiği.
- Hangi işi engellediği.
- Bu sırada devam eden bağımsız işler.

Araç kotası, otomatik onay incelemesi veya ortam hatası nedeniyle çalışmayan işlemi gerçekleşmiş sayma; kontrolü aşmaya çalışma.

Yalnız ücretsiz kaynakları kullan. Ücretli plan, satın alma, ödeme bilgisi veya maliyet doğuracak hizmet başlatma.

10. KALİTE HEDEFİ VE TESTLER

“Sıfır hata” bir mühendislik hedefidir; mutlak hatasızlık garantisi verme.

Bir özelliği ancak gerçek kullanıcı akışı çalışıyor, sunucu doğrulaması tamam, ilgili testler geçmiş ve kalan sınırlamalar yazılmışsa tamamlandı say.

Özellikle test et:

- Owner kapsamı, kimlik doğrulama ve CSRF.
- Eski sürüm, değişen önizleme ve tekrar gönderim.
- Aynı işin eşzamanlı iki kez oluşturulması.
- Maç saati değişince görev/bildirim güncelliği.
- Aynı fikstür/dosyanın tekrar içe aktarılması.
- Tasarım/revizyon/format sayımlarında çift sayım.
- Sponsorluk teslimat ve tahsilat toplamları.
- Para birimi ve decimal hesapları.
- İstanbul tarihi, saat dilimi, ay/yıl sınırı ve artık gün.
- Gizli verinin log, genel sorgu, CSV, ICS ve paylaşımda bulunmaması.
- Süreli gösterimin geç yanıt veya görünüm değişikliğiyle yeniden açılmaması.
- Onaysız kanonik yazı ve harici işlem yapılmaması.
- Yeni kayıtların Trash, purge ve yedekten dönüşü.
- TR/EN, klavye kullanımı, mobil görünüm ve axe.
- Üretimde test girişinin bulunmaması.

Gerçek sonuçları komut, commit ve ortam bilgisiyle kaydet. Eski test sayısını yeni commit’e taşımak veya çalıştırılmayan testi geçmiş göstermek yasak.

Kritik/yüksek açık kusurları kapatmadan nihai kabul verme. Diğer kusurları önem, yeniden üretme adımı ve regresyon testiyle BUGS.md içinde izle.

Aşama PR’larını kabul ölçütleri, kesin uygulama commit’inin CI’ı ve gerekli güvenlik incelemesi geçmeden birleştirme.

11. İLERLEME VE TESLİM

Her tamamlanan iş paketinde şunları kaydet:

- Kullanıcının artık yapabildiği işlem.
- Veri modeli/API/migration değişiklikleri.
- Gerçek test sonuçları ve kanıtları.
- Commit/PR.
- Açık kusurlar ve engeller.
- Sonraki somut iş.

İlerlemeyi üç ayrı ölçüyle raporla:

- Mevcut A–J kapsamının kabul kapıları.
- Yeni sponsorluk/medya kapsamının kabulü.
- Tamamlanan/toplam iş paketleri.

Bunları iş gücü yüzdesi gibi sunma. Şema, taslak ekran veya kısmi test tamamlanmış özellik değildir. Eski yüzdeleri doğrulamadan tekrar etme; çelişen durum belgelerini düzelt.

Çalışma kesilirse bütün devam bilgisi dosyalarda kalsın. Bir sonraki çalışma tamamlananları yeniden kurmadan son eksik işten ilerleyebilsin.

12. YAYIN VE NİHAİ KABUL

Mevcut Render Free, Supabase ve Google OAuth kararlarını koru. Kalıcı dosyalar özel depolamada, gizli anahtarlar yalnız sunucuda olsun.

Google Sites’a uygulamayı yerleştirme işini de kapsamda tut. Çalışan HTTPS uygulaması ve gerçek sahip girişi doğrulanmadan yayını hazır ilan etme.

Sunucu:
- frame-ancestors içinde https://sites.google.com ve https://*.google.com bulundursun.
- X-Frame-Options göndermesin.
- Üretimde test-auth bulunmasın.
- Üçüncü taraf çerez engelinde yeni sekme giriş alternatifi sunsun.

Nihai teslimde çalışan uygulama ve Sites URL’leri, yerel çalıştırma komutları, dağıtım/geri alma adımları, kullanım kılavuzu ve doğrulanmış yedekten dönüş prosedürü ver.

Nihai kabul; önceki bütün gereksinimler ile yeni sponsorluk ve medya kapsamının tamamını kapsasın. Ücretsiz barındırmanın uyku/erişilebilirlik sınırlarını açıkça belirt.

Şimdi mevcut durumu doğrula, yarım işi tamamla ve uygulamaya geç. Yalnızca yeni bir plan veya genel öneri yanıtı verip durma.
