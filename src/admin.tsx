import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, body } from './api';
import { ErrorMessage, Modal } from './components';
import type { FieldSource } from '../shared/provenance';

export type Impact = { total: number; counts: Record<string, number>; previewToken: string; canPurge?: boolean };
export function ImpactList({ plan }: { plan: Impact }) {
  const { t } = useTranslation();
  return <section aria-label={t('dependencyPreview')}><h2 className="mt-5">{t('dependencyPreview')}</h2><p className="subtitle">{t('dependencyTotal', { count: plan.total })}</p><dl>{Object.entries(plan.counts).map(([type, count]) => <div className="detail-field" key={type}><dt>{t(`model${type}`)}</dt><dd>{count}</dd></div>)}</dl>{plan.canPurge === false && <p className="notice">{t('purgeBlocked')}</p>}</section>;
}
export function FieldEvidence({ sources }: { sources: Record<string, FieldSource> }) {
  const { t, i18n } = useTranslation();
  return <section className="panel"><div className="panel-header"><h2>{t('fieldEvidence')}</h2></div><div className="panel-body">{Object.entries(sources).map(([field, source]) => <div className="list-line" key={field}><div className="flex-1"><strong>{t(`field_${field}`)}</strong><p className="muted mt-2">{t(source.verificationStatus === 'VERIFIED' ? 'sourceVerified' : source.verificationStatus === 'PARTIAL' ? 'sourcePartial' : 'sourceUnverified')}</p><p className="muted mt-2">{t('retrieved')} · {new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', dateStyle: 'medium' }).format(new Date(source.retrievedAt))}</p></div>{source.sourceUrl ? <a className="text-accent" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{t('source')}</a> : <span className="muted">{t('manualSource')}</span>}</div>)}</div></section>;
}
export function AdminControls() {
  const { t } = useTranslation(); const client = useQueryClient(); const [confirming, setConfirming] = useState(false); const [agreed, setAgreed] = useState(false);
  const preview = useQuery({ queryKey: ['example-preview'], queryFn: () => api<Impact>('/api/admin/examples/preview'), enabled: confirming });
  const cleanup = useMutation({ mutationFn: () => api('/api/admin/examples/cleanup', { method: 'POST', body: body({ previewToken: preview.data?.previewToken }) }), onSuccess: () => { setConfirming(false); setAgreed(false); void client.invalidateQueries(); } });
  return <><section className="panel panel-body mt-6"><h2>{t('cleanupExamples')}</h2><p className="subtitle my-4">{t('cleanupHelp')}</p><button className="danger" onClick={() => { setConfirming(true); setAgreed(false); }}>{t('cleanupExamples')}</button></section>{confirming && <Modal title={t('cleanupExamples')} onClose={() => setConfirming(false)}>{preview.isPending && <p role="status">{t('previewLoading')}</p>}{preview.isError && <ErrorMessage />}{preview.data && <><ImpactList plan={preview.data} /><label className="field mt-5"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />{t('cleanupConfirm')}</label></>}{cleanup.isError && <ErrorMessage />}<div className="form-footer"><button className="secondary" onClick={() => { setAgreed(false); void preview.refetch(); }}>{t('refreshPreview')}</button><button className="danger" disabled={!agreed || !preview.data?.total || cleanup.isPending} onClick={() => cleanup.mutate()}>{t('cleanupExamples')}</button></div></Modal>}</>;
}
