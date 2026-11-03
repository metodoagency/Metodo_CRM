# Türkçe kurulum

Bu sürüm temel geliştirme aşamasıdır; tüm CRM modülleri tamamlanmadı.

1. Node 22.12+ ve tercihen Docker kurun. `milestone/a-foundation` dalını açın.
2. `.env.example` dosyasını `.env` olarak kopyalayın. Gerçek e-posta adresinizi `ALLOWED_EMAILS` alanına yazın. Google OAuth istemci bilgilerini yalnızca yerel `.env` veya barındırma servisinin gizli ayarlarına ekleyin.
3. Sırayla `npm install`, `npm run db:up`, `npm run db:migrate`, `npm run seed:example`, `npm run dev` çalıştırın. Arayüz 5173, API 3000 portundadır.
4. `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build`, `npm run i18n:check`, `npm run compliance:check`, `npm run security:check` ile doğrulayın. Testler ayrı yerel veritabanlarını kullanır.
5. Canlıya almak için README içindeki Railway + Supabase adımlarını uygulayın. Üretimde iki ayrı şifreleme anahtarı, Google OAuth, izinli e-posta ve TLS doğrulaması açık veritabanı bağlantısı zorunludur.
6. Railway tarafından gerçekten verilen HTTPS adresini Google Sites → Ekle → Yerleştir → URL alanına yapıştırın. Giriş iframe içinde engellenirse uygulamanın “Yeni sekmede aç” düğmesini kullanın. Tarayıcı üçüncü taraf çerezlerini engelliyorsa uygulamayı ayrı sekmede kullanın.

Proxy başlıklarına üretimde de varsayılan olarak güvenilmez. `TRUSTED_PROXY_CIDRS` yalnızca doğrulanmış ağ geçidi IP/CIDR adresleriyle doldurulmalıdır. API ve veritabanına sorgu gönderen sağlık uçları sorgudan önce IP başına 600/dakika; doğrulanmış API oturumları ayrıca oturum başına 300/dakika; giriş uçları IP başına 10/dakika ile sınırlıdır. Birden fazla sunucu örneğinde ortak sayaç veya doğrulanmış ağ geçidi sınırı gerekir.

Uyum dosyaları henüz sahip tarafından incelenmedi. Gerçek sağlık ve veli verilerini G aşaması tamamlanmadan girmeyin. Güncel testler, Google Sites taslağı ve kalan işler PROGRESS.md dosyasındadır.
