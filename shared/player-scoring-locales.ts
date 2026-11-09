export const scoringTr = {
  scoringTitle: 'Oyuncu puanlaması', scoringEdit: 'Puan gir', scoringWeights: 'Puan ağırlıkları', scoringWeight: 'Ağırlık',
  scoringWeightsHint: 'Eşit ağırlık için 1, 1, 1 girin. Yeni ağırlıklar sonraki puan kaydında kullanılır.',
  scoringHistory: 'Puan geçmişi', scoringNote: 'Puanlama notu', scoringSaveWeights: 'Puan ağırlıklarını kaydet',
  scoringPreview: 'Hesaplanan seviye puanı', scoringUnrated: 'Puanlama bekliyor',
  timeline_level_score: '{name} · seviye puanı kaydedildi',
  criterion_reflexes: 'Kurtarış', criterion_distribution: 'Ayakla oyun', criterion_command: 'Çıkış',
  criterion_duels: 'İkili mücadele', criterion_buildUp: 'Geriden oyun kurma', criterion_positioning: 'Pozisyon alma',
  criterion_recovery: 'Geri dönüş', criterion_crossing: 'Orta', criterion_oneOnOne: 'Bire bir',
  criterion_interception: 'Top kesme', criterion_passing: 'Pas', criterion_vision: 'Oyun görüşü',
  criterion_workRate: 'Çalışma temposu', criterion_creativity: 'Yaratıcılık', criterion_finishing: 'Bitiricilik',
  criterion_dribbling: 'Top sürme', criterion_movement: 'Hareketlilik', criterion_holdUp: 'Top tutma',
};

export const scoringEn: Record<keyof typeof scoringTr, string> = {
  scoringTitle: 'Player scoring', scoringEdit: 'Enter scores', scoringWeights: 'Score weights', scoringWeight: 'Weight',
  scoringWeightsHint: 'Enter 1, 1, 1 for equal weights. New weights apply the next time you save a score.',
  scoringHistory: 'Score history', scoringNote: 'Scoring note', scoringSaveWeights: 'Save score weights',
  scoringPreview: 'Calculated level score', scoringUnrated: 'Awaiting assessment',
  timeline_level_score: '{name} · level score saved',
  criterion_reflexes: 'Shot stopping', criterion_distribution: 'Distribution', criterion_command: 'Command of area',
  criterion_duels: 'Duels', criterion_buildUp: 'Build-up play', criterion_positioning: 'Positioning',
  criterion_recovery: 'Recovery', criterion_crossing: 'Crossing', criterion_oneOnOne: 'One on one',
  criterion_interception: 'Interception', criterion_passing: 'Passing', criterion_vision: 'Vision',
  criterion_workRate: 'Work rate', criterion_creativity: 'Creativity', criterion_finishing: 'Finishing',
  criterion_dribbling: 'Dribbling', criterion_movement: 'Movement', criterion_holdUp: 'Hold-up play',
};
