const strings = {
  dashboardClubCount: ['Kayıtlı kulüpler', 'Recorded clubs'],
  dashboardCustomize: ['Ana ekranı düzenle', 'Customize dashboard'], dashboardLayoutHelp: ['Bileşenleri sürükleyerek veya taşıma düğmeleriyle sıralayın. Görünürlük ve sıralama hesabınıza kaydedilir.', 'Reorder widgets by dragging or using the move buttons. Visibility and order are saved to your account.'],
  dashboard_summary: ['Ofis özeti', 'Office summary'], dashboard_todayTasks: ['Bugünkü açık görevler', 'Open tasks due today'], dashboard_tasks: ['Açık görevler · en yakın tarihler', 'Open tasks · earliest due dates'],
  dashboard_todayMeetings: ['Bugünkü görüşmeler', 'Meetings today'], dashboard_weekMeetings: ['Bu haftaki görüşmeler · Pazartesi–Pazar', 'Meetings this week · Monday–Sunday'], dashboard_deadlines: ['Hafta sonuna kadar sözleşme tarihleri', 'Contract dates through the end of this week'],
  dashboard_proposals: ['Onay bekleyen öneriler', 'Pending proposals'], dashboard_followUps: ['Geciken sunum takipleri', 'Overdue presentation follow-ups'], dashboard_activity: ['Son hareketler', 'Recent activity'],
  dashboardUp: ['{{name}}: yukarı taşı', 'Move {{name}} up'], dashboardDown: ['{{name}}: aşağı taşı', 'Move {{name}} down'], dashboardVisible: ['{{name}}: göster', 'Show {{name}}'],
  dashboardMoved: ['{{name}}, {{position}}. sıraya taşındı.', '{{name}} moved to position {{position}}.'], dashboardSaved: ['Ana ekran düzeni kaydedildi.', 'Dashboard layout saved.'],
  dashboardConflict: ['Ayarlar siz düzenlerken değişti. Taslağınız korunuyor. Güncel düzeni yüklemek taslağınızın yerini alır.', 'Settings changed while you were editing. Your draft is preserved. Loading the current layout replaces your draft.'],
  dashboardReload: ['Güncel düzeni yükle', 'Load current layout'], dashboardInvalidLayout: ['Kaydedilmiş düzen okunamadı; varsayılan görünüm gösteriliyor. Düzenleyip kaydederek onarabilirsiniz.', 'The saved layout could not be read; the default view is shown. Customize and save to repair it.'],
  dashboardAllHidden: ['Tüm bileşenler gizli. Ana ekranı düzenleyerek yeniden gösterebilirsiniz.', 'All widgets are hidden. Customize the dashboard to show them again.'],
  dashboardListLimit: ['İlk {{count}} kayıt gösteriliyor. Tüm kayıtları ilgili bölümde açın.', 'Showing the first {{count}} records. Open the related workspace for all records.'],
  dashboardDateWarning: ['Bir sözleşme tarihini kontrol etmek gerekiyor. Ayrıntıları ajandada açın.', 'A contract date needs review. Open the agenda for details.'],
  dashboardProtectedBirthdays: ['Doğum günlerini korumalı takvimde aç', 'Open birthdays in the protected calendar'],
} as const;
export const dashboardTr = Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[0]]));
export const dashboardEn = Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[1]]));
