export const clubTr = {
  reviewProposal: 'Güncellemeyi incele', approveProposal: 'Onayla ve uygula',
  selectedCoach: 'Ayrılan kişiyi seçin', chooseCoach: 'Bir kişi seçin', effectiveDate: 'Ayrılık tarihi',
  approvalSource: 'Doğrulama kaynağı URL', approvalPreview: 'Yalnızca seçilen kişinin bu kulüpte açık görevleri kapanır. Diğer çalışanlara dokunulmaz. İki gün sonrası için yüksek öncelikli takip görevi oluşturulur.',
  sourceApproval: 'Kaynağı ve uygulanacak değişikliği inceledim.', activeTenures: 'Kapanacak açık görev sayısı',
  unsupportedProposal: 'Bu güncelleme türünün uygulama akışı henüz hazır değil. Reddedebilir veya bekletebilirsiniz.',
  coachDepartureSummary: '{person} · {club} kulübündeki görevi sona erdi · {date}',
  coachFollowUp: 'Antrenör ayrılığı takibi · {club}', exampleTaskPrefix: 'Örnek · ',
  contextChanged: 'Kayıtlar değişti. Önizlemeyi yenileyip tekrar inceleyin.',
};
export const clubEn: Record<keyof typeof clubTr, string> = {
  reviewProposal: 'Review update', approveProposal: 'Approve and apply',
  selectedCoach: 'Select the departing person', chooseCoach: 'Choose a person', effectiveDate: 'Departure date',
  approvalSource: 'Verification source URL', approvalPreview: 'Only the selected person’s open tenures at this club will close. Other staff stay unchanged. A high-priority follow-up task is created for two days from today.',
  sourceApproval: 'I reviewed the source and the change to apply.', activeTenures: 'Open tenures to close',
  unsupportedProposal: 'The apply workflow for this update type is not ready. You can reject it or leave it pending.',
  coachDepartureSummary: '{person} · tenure at {club} ended · {date}',
  coachFollowUp: 'Coach departure follow-up · {club}', exampleTaskPrefix: 'Example · ',
  contextChanged: 'Records changed. Refresh the preview and review it again.',
};
