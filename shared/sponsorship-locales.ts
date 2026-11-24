const strings = {
  Brand: ['Marka', 'Brand'], BrandContact: ['Marka kişi bağlantısı', 'Brand contact link'],
  modelBrand: ['Markalar', 'Brands'], modelBrandContact: ['Marka kişi bağlantıları', 'Brand contact links'],
  sponsorship: ['Sponsorluk', 'Sponsorship'], brandDirectory: ['Marka ağı', 'Brand network'],
  brandIntro: ['Markaları ve irtibat kişilerini aynı yerde yönetin. Kişilerin iletişim bilgileri mevcut kişi dosyasında korunur.', 'Manage brands and their contacts together. Contact details remain protected in the existing person record.'],
  brandAdd: ['Marka ekle', 'Add brand'], brandEdit: ['Markayı düzenle', 'Edit brand'], brandName: ['Marka adı', 'Brand name'],
  brandSector: ['Sektör', 'Sector'], brandWebsite: ['Resmî web sitesi (HTTPS)', 'Official website (HTTPS)'], brandOpenWebsite: ['Web sitesini aç', 'Open website'],
  brandRelationship: ['İlişki durumu', 'Relationship status'], brandContacts: ['Bağlı kişiler', 'Linked contacts'], brandContactCount: ['{{count}} bağlı kişi', '{{count}} linked contacts'],
  brandContactAdd: ['İrtibat kişisi bağla', 'Link contact'], brandContactEdit: ['İrtibat görevini düzenle', 'Edit contact role'], brandContactRole: ['Markadaki görevi', 'Role at this brand'],
  brandContactStart: ['Görev başlangıcı (biliniyorsa)', 'Role start (if known)'], brandContactEnd: ['Görev bitişi (biliniyorsa)', 'Role end (if known)'],
  brandContactRemove: ['Kişi bağlantısını çöpe taşı', 'Move contact link to Trash'], brandContactRemoveHelp: ['Yalnız bu marka bağlantısı Çöp Kutusuna taşınır. Kişi dosyası ve diğer marka bağlantıları korunur.', 'Only this brand link moves to Trash. The person record and other brand links are preserved.'],
  brandContactInTrash: ['Bu kişi bağlantısı Çöp Kutusunda. Bağlantıyı oradan geri yükleyin.', 'This contact link is in Trash. Restore it there.'], brandContactExists: ['Bu kişi markaya zaten bağlı.', 'This person is already linked to the brand.'],
  brandDelete: ['Markayı çöpe taşı', 'Move brand to Trash'], brandDeleteHelp: ['Marka Çöp Kutusuna taşınacak. Kişi dosyaları silinmez. Markayı geri yüklediğinizde mevcut bağlantıları yeniden görünür.', 'The brand moves to Trash. Person records are preserved. Existing links become visible when the brand is restored.'],
  brandExample: ['Bu bir örnek marka kaydı', 'This is an example brand'], brandUnknown: ['Belirtilmedi', 'Not specified'],
  brandContactOpen: ['Kişi dosyasını aç', 'Open person record'], brandTimeline: ['Marka ilişki geçmişi', 'Brand relationship history'],
  brandConflict: ['Kayıt veya bağlantı değişti. Taslağınız korunuyor; güncel kaydı açıp tekrar deneyin. Çöp Kutusundaki bağlantılar oradan geri yüklenir.', 'The record or link changed. Your draft is preserved; reopen the current record and try again. Links in Trash must be restored there.'],
  brandInvalid: ['Marka ve bağlantı alanlarını kontrol edin. Örnek kaydın adı Örnek ile başlamalı; web sitesi HTTPS olmalı.', 'Check the brand and contact fields. Example names must start with Örnek; websites must use HTTPS.'],
} as const;
export const sponsorshipTr = Object.fromEntries(Object.entries(strings).map(([key, pair]) => [key, pair[0]])) as { [K in keyof typeof strings]: string };
export const sponsorshipEn = Object.fromEntries(Object.entries(strings).map(([key, pair]) => [key, pair[1]])) as { [K in keyof typeof strings]: string };
