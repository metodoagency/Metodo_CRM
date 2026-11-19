export const notificationTr = {
  notificationCenter: 'Bildirim merkezi', notificationIntro: 'Sözleşme hatırlatmalarınızı okuyun veya erteleyin. Bekleyen onayları ve doğum günlerini ilgili ekranlardan açabilirsiniz.',
  notificationUnread: 'Okunmamış', notificationSnoozed: 'Ertelenmiş', notificationRead: 'Okunmuş',
  notificationMarkRead: 'Okundu işaretle', notificationSnooze1: '1 gün ertele', notificationSnooze7: '7 gün ertele',
  notificationUntil: 'Erteleme bitişi: {{date}}', notificationThreshold: '{{days}} gün eşiği',
  notificationCount: '{{count}} okunmamış sözleşme bildirimi',
  notificationConflict: 'Bildirim veya bağlı kayıt değişti. Listeyi yenileyip tekrar deneyin.', notificationRefresh: 'Listeyi yenile',
  notificationChanged: 'Bildirim güncellendi.', notificationTimeline: 'Bildirim durumu güncellendi',
};
export const notificationEn: Record<keyof typeof notificationTr, string> = {
  notificationCenter: 'Notification center', notificationIntro: 'Read or snooze contract reminders. Open pending approvals and birthdays in their respective screens.',
  notificationUnread: 'Unread', notificationSnoozed: 'Snoozed', notificationRead: 'Read',
  notificationMarkRead: 'Mark as read', notificationSnooze1: 'Snooze 1 day', notificationSnooze7: 'Snooze 7 days',
  notificationUntil: 'Snoozed until: {{date}}', notificationThreshold: '{{days}}-day threshold',
  notificationCount: '{{count}} unread contract notifications',
  notificationConflict: 'The notification or linked record changed. Refresh the list and try again.', notificationRefresh: 'Refresh list',
  notificationChanged: 'Notification updated.', notificationTimeline: 'Notification status updated',
};
