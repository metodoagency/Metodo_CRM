export const agendaTr = {
  agendaContracts: 'Sözleşme tarihlerini göster', agendaBirthdayShow: 'Doğum günlerini 60 saniye göster', agendaBirthdayHide: 'Doğum günlerini gizle',
  agendaBirthdayHelp: 'Doğum günü tarihleri gizlidir. Gösterilen her kayıt için yalnız alan adıyla erişim kaydı tutulur. Görünüm değişince veya 60 saniye dolunca temizlenir.',
  agendaLayerExport: 'Tarih katmanları ICS dosyasına eklenmez; yalnız görüşmeler indirilir.', agendaBirthday: 'Doğum günü', agendaNoDisplayedEvents: 'Görüntülenen katmanlarda kayıt yok.',
  agendaPageIncomplete: 'Bu tarih için bu sayfada kayıt yok. Diğer sayfaları da kontrol edin.',
  agendaBirthdayError: 'Doğum günleri gösterilemedi. Yeniden açıkça göstererek deneyin.', agendaBirthdayExpired: 'Doğum günleri şu anda gizli.',
  agendaContractPage: 'Sözleşme tarihleri: {{total}} kayıt · {{warnings}} uyarı · sayfa {{page}}', agendaBirthdayPage: 'Doğum günleri: {{total}} kayıt · sayfa {{page}}',
  agendaContractPrevious: 'Önceki sözleşme tarihleri', agendaContractNext: 'Sonraki sözleşme tarihleri', agendaBirthdayPrevious: 'Önceki doğum günlerini göster', agendaBirthdayNext: 'Sonraki doğum günlerini göster',
  agendaSkippedPayment: '{{name}}: {{month}} ayında tanımlanan ödeme günü yok; tarih üretilmedi.', agendaInvalidContract: '{{name}}: tarih veya ödeme günü verisini kontrol edin.',
  agendaPartialContracts: 'Bu sayfa {{count}} / {{total}} sözleşme tarihi içerir; diğer kayıtlar için sözleşme sayfasını değiştirin.', agendaPartialBirthdays: 'Bu sayfa {{count}} / {{total}} doğum günü içerir. Her sayfa ayrı gösterilir ve erişimi kaydedilir.',
};
export const agendaEn: Record<keyof typeof agendaTr, string> = {
  agendaContracts: 'Show contract dates', agendaBirthdayShow: 'Show birthdays for 60 seconds', agendaBirthdayHide: 'Hide birthdays',
  agendaBirthdayHelp: 'Birthday dates are private. Each displayed record logs access by field name only. Dates clear when the view changes or 60 seconds expire.',
  agendaLayerExport: 'Date layers are excluded from ICS; only meetings are downloaded.', agendaBirthday: 'Birthday', agendaNoDisplayedEvents: 'No records in the displayed layers.',
  agendaPageIncomplete: 'No records for this date on this page. Check the other pages too.',
  agendaBirthdayError: 'Birthdays could not be shown. Explicitly reveal them again to retry.', agendaBirthdayExpired: 'Birthdays are currently hidden.',
  agendaContractPage: 'Contract dates: {{total}} records · {{warnings}} warnings · page {{page}}', agendaBirthdayPage: 'Birthdays: {{total}} records · page {{page}}',
  agendaContractPrevious: 'Previous contract dates', agendaContractNext: 'Next contract dates', agendaBirthdayPrevious: 'Show previous birthdays', agendaBirthdayNext: 'Show next birthdays',
  agendaSkippedPayment: '{{name}}: the configured payment day does not exist in {{month}}; no date was invented.', agendaInvalidContract: '{{name}}: check the date or payment-day data.',
  agendaPartialContracts: 'This page contains {{count}} of {{total}} contract dates; change the contract page for other records.', agendaPartialBirthdays: 'This page contains {{count}} of {{total}} birthdays. Each page is revealed and audited separately.',
};
