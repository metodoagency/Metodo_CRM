import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, body } from './api';
import { ErrorMessage, Modal } from './components';
import { manualSourceUrl, type FieldSource } from '../shared/provenance';
import type { RecordType } from './types';

export type Impact = { total: number; counts: Record<string, number>; previewToken: string; canPurge?: boolean };
export function ImpactList({ plan }: { plan: Impact }) {
  const { t } = useTranslation();
  return <section aria-label={t('dependencyPreview')}><h2 className="mt-5">{t('dependencyPreview')}</h2><p className="subtitle">{t('dependencyTotal', { count: plan.total })}</p><dl>{Object.entries(plan.counts).map(([type, count]) => <div className="detail-field" key={type}><dt>{t(`model${type}`)}</dt><dd>{count}</dd></div>)}</dl>{plan.canPurge === false && <p className="notice">{t('purgeBlocked')}</p>}</section>;
}
export function FieldEvidence({ sources, record }: { sources: Record<string, FieldSource>; record: { type: RecordType; id: string; version: number } }) {
  const { t, i18n } = useTranslation();
  const cache = useQueryClient();
  const [review, setReview] = useState<{ field: string; sourceUrl: string; version: number }>();
  const verify = useMutation({
    mutationFn: (input: NonNullable<typeof review>) => api(`/api/records/${record.type}/${record.id}/verify-field`, { method: 'POST', body: body(input) }),
    onSuccess: async () => { await cache.invalidateQueries(); setReview(undefined); },
  });
  return <section className="panel"><div className="panel-header"><h2>{t('fieldEvidence')}</h2></div><div className="panel-body">
    {Object.entries(sources).map(([field, source]) => {
      const url = manualSourceUrl.safeParse(source.sourceUrl);
      return <div className="list-line flex-wrap" key={field}>
      <div className="flex-1"><strong>{t(`field_${field}`)}</strong><p className="muted mt-2">{t(source.verificationStatus === 'VERIFIED' ? 'sourceVerified' : source.verificationStatus === 'PARTIAL' ? 'sourcePartial' : 'sourceUnverified')}</p><p className="muted mt-2">{t('retrieved')} · {new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', dateStyle: 'medium' }).format(new Date(source.retrievedAt))}</p></div>
      {url.success ? <a className="text-accent" href={url.data} target="_blank" rel="noopener noreferrer">{t('source')}</a> : <span className="muted">{t(source.sourceUrl ? 'invalidEvidenceUrl' : 'manualSource')}</span>}
      {url.success && source.verificationStatus !== 'VERIFIED' && <button className="secondary" onClick={() => { verify.reset(); setReview({ field, sourceUrl: url.data, version: record.version }); }}>{t('verifyField')}</button>}
    </div>;
    })}
  </div>
    {review && <Modal title={t('verifyField')} onClose={() => setReview(undefined)}>
      <p className="subtitle">{t('verifyFieldHint')}</p>
      <p className="mt-3"><strong>{t(`field_${review.field}`)}</strong> · {t('sourceVerified')}</p>
      <a className="text-accent break-all" href={review.sourceUrl} target="_blank" rel="noopener noreferrer">{review.sourceUrl}</a>
      {verify.isError && <ErrorMessage />}
      <div className="form-footer"><button className="primary" disabled={verify.isPending} onClick={() => verify.mutate(review)}>{t('verifyField')}</button></div>
    </Modal>}
  </section>;
}
export function AdminControls() {
  const { t } = useTranslation(); const client = useQueryClient(); const [confirming, setConfirming] = useState(false); const [agreed, setAgreed] = useState(false);
  const preview = useQuery({ queryKey: ['example-preview'], queryFn: () => api<Impact>('/api/admin/examples/preview'), enabled: confirming });
  const cleanup = useMutation({ mutationFn: () => api('/api/admin/examples/cleanup', { method: 'POST', body: body({ previewToken: preview.data?.previewToken }) }), onSuccess: () => { setConfirming(false); setAgreed(false); void client.invalidateQueries(); } });
  return <><section className="panel panel-body mt-6"><h2>{t('cleanupExamples')}</h2><p className="subtitle my-4">{t('cleanupHelp')}</p><button className="danger" onClick={() => { setConfirming(true); setAgreed(false); }}>{t('cleanupExamples')}</button></section>{confirming && <Modal title={t('cleanupExamples')} onClose={() => setConfirming(false)}>{preview.isPending && <p role="status">{t('previewLoading')}</p>}{preview.isError && <ErrorMessage />}{preview.data && <><ImpactList plan={preview.data} /><label className="field mt-5"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />{t('cleanupConfirm')}</label></>}{cleanup.isError && <ErrorMessage />}<div className="form-footer"><button className="secondary" onClick={() => { setAgreed(false); void preview.refetch(); }}>{t('refreshPreview')}</button><button className="danger" disabled={!agreed || !preview.data?.total || cleanup.isPending} onClick={() => cleanup.mutate()}>{t('cleanupExamples')}</button></div></Modal>}</>;
}
