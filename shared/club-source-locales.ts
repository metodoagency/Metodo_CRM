export const clubSourceTr = {
  sourceRegistry: 'Kaynak sicili', sourceAdd: 'Kaynak ekle', sourceEdit: 'Kaynağı düzenle',
  sourceAddress: 'Kaynak adresi', sourceCategory: 'Kaynak türü', sourceTrust: 'Güven düzeyi',
  sourceLinkedClubs: 'Bağlı kulüpler', sourceClubSearch: 'Bağlanacak kulübü ara', sourceClubUnavailable: 'Kullanılamayan kulüp',
  sourceUnlink: '{{name}} bağlantısını kaldır', sourceLink: '{{name}} kulübünü bağla', sourceAll: 'Tüm kaynaklar',
  sourceMethodManual: 'Elle açılır', sourceLegacyMethod: 'Eski tarama ayarı. Bu kaynak elle açılır.',
  sourceExampleLinks: 'Örnek kaynak adı Örnek ile başlamalı. Örnek ve gerçek kulüpleri ayrı kaynaklara bağlayın.',
  sourceLinkStale: 'Kulüp bağlantılarından biri artık kullanılamıyor. Kulüp seçimini yenileyin.',
  sourceDeleteConfirm: 'Kaynağı çöp kutusuna taşımayı onaylayın.',
  sourceType_OFFICIAL: 'Resmî', sourceType_TFF: 'TFF', sourceType_MEDIA: 'Medya', sourceType_SOCIAL: 'Sosyal medya',
  sourceType_MANUAL: 'Elle girilen', sourceType_AI_EXTRACTED: 'Belgeden çıkarılan', sourceType_DATA_PROVIDER: 'Veri sağlayıcı',
  sourceType_KAP: 'KAP', sourceType_DOCUMENT: 'Belge', sourceTrust_OFFICIAL: 'Resmî', sourceTrust_MEDIA: 'Medya', sourceTrust_SOCIAL_VERIFIED: 'Doğrulanmış sosyal medya',
};

export const clubSourceEn: Record<keyof typeof clubSourceTr, string> = {
  sourceRegistry: 'Source registry', sourceAdd: 'Add source', sourceEdit: 'Edit source',
  sourceAddress: 'Source URL', sourceCategory: 'Source type', sourceTrust: 'Trust level',
  sourceLinkedClubs: 'Linked clubs', sourceClubSearch: 'Search for a club to link', sourceClubUnavailable: 'Unavailable club',
  sourceUnlink: 'Unlink {{name}}', sourceLink: 'Link {{name}}', sourceAll: 'All sources',
  sourceMethodManual: 'Open manually', sourceLegacyMethod: 'Legacy scan setting. Open this source manually.',
  sourceExampleLinks: 'Use the example name prefix for example sources. Link example and real clubs to separate sources.',
  sourceLinkStale: 'A linked club is unavailable. Refresh the club selection.',
  sourceDeleteConfirm: 'Confirm moving this source to trash.',
  sourceType_OFFICIAL: 'Official', sourceType_TFF: 'TFF', sourceType_MEDIA: 'Media', sourceType_SOCIAL: 'Social media',
  sourceType_MANUAL: 'Manual', sourceType_AI_EXTRACTED: 'Extracted from a document', sourceType_DATA_PROVIDER: 'Data provider',
  sourceType_KAP: 'KAP', sourceType_DOCUMENT: 'Document', sourceTrust_OFFICIAL: 'Official', sourceTrust_MEDIA: 'Media', sourceTrust_SOCIAL_VERIFIED: 'Verified social media',
};
