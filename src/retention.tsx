import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import { ImpactList } from './admin';
import type { RetentionCatalog, RetentionPlan, SensitiveView } from '../shared/retention';

export function RetentionControls() {
  const { t } = useTranslation(); const cache = useQueryClient();
  const [table, setTable] = useState('Club'); const [confirming, setConfirming] = useState(false); const [agreed, setAgreed] = useState(false);
  const catalog = useQuery({ queryKey: ['retention'], queryFn: () => api<RetentionCatalog>('/api/admin/retention') });
  const plan = useMutation({ mutationFn: () => api<RetentionPlan>('/api/admin/retention/preview', { method: 'POST', body: body({ table }) }) });
  const save = useMutation({ mutationFn: (days: string) => {
    const periods = { ...catalog.data?.periods }; if (days) periods[table] = Number(days); else delete periods[table];
    return api('/api/settings', { method: 'PATCH', body: body({ version: catalog.data?.version, retentionDays: periods }) });
  }, onSuccess: () => { plan.reset(); void cache.invalidateQueries({ queryKey: ['retention'] }); void cache.invalidateQueries({ queryKey: ['settings'] }); }, onError: () => { void cache.invalidateQueries({ queryKey: ['retention'] }); } });
  const purge = useMutation({ mutationFn: () => api('/api/admin/retention/purge', { method: 'POST', body: body({ table: plan.data?.table, asOf: plan.data?.asOf, previewToken: plan.data?.previewToken }) }), onSuccess: () => { setConfirming(false); plan.reset(); void cache.invalidateQueries(); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(String(new FormData(event.currentTarget).get('days') ?? '')); }
  return <section className="panel panel-body mt-6 space-y-4"><h2>{t('retention')}</h2><p className="subtitle">{t('retentionHelp')}</p><p className="muted">{t('retentionScope')}</p>
    <label className="field">{t('retentionTable')}<select aria-label={t('retentionTable')} value={table} onChange={event => { setTable(event.target.value); plan.reset(); save.reset(); purge.reset(); }}>{catalog.data?.tables.filter(row => row.mode === 'softDeleted').map(row => <option key={row.type} value={row.type}>{t(`model${row.type}`)}</option>)}</select></label>
    {catalog.data && <form key={`${table}:${catalog.data.version}`} onSubmit={submit} className="space-y-4"><label className="field">{t('retentionDays')}<input type="number" min={1} max={3650} name="days" placeholder={t('retentionNever')} defaultValue={catalog.data.periods[table] ?? ''} /></label><p className="muted">{t('retentionPeriodHint')}</p><button className="primary" disabled={save.isPending}>{t('save')}</button></form>}
    <p className="muted">{t('retentionSecurity')}</p>{save.isSuccess && <p role="status">{t('retentionSaved')}</p>}{purge.isSuccess && <p role="status">{t('retentionPurged')}</p>}{(catalog.isError || save.isError) && <ErrorMessage />}
    <button className="secondary" disabled={!catalog.data} onClick={() => { setAgreed(false); setConfirming(true); purge.reset(); plan.mutate(); }}>{t('retentionPreview')}</button>
    {confirming && <Modal title={t('retentionPreview')} onClose={() => setConfirming(false)}>{plan.isPending && <p role="status">{t('previewLoading')}</p>}{plan.data && <><ImpactList plan={plan.data} />{!plan.data.total ? <p className="notice">{t('retentionEmpty')}</p> : <><div className="table-wrap max-h-72 overflow-auto"><table><thead><tr><th>{t('retentionTable')}</th><th>{t('recordId')}</th><th>{t('recordVersion')}</th></tr></thead><tbody>{plan.data.records.map(row => <tr key={`${row.type}:${row.id}`}><td>{t(`model${row.type}`)}</td><td>{row.id}</td><td>{row.version}</td></tr>)}</tbody></table></div><label className="flex gap-3 mt-4"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />{t('retentionConfirm')}</label></>}</>}{(plan.isError || purge.isError) && <ErrorMessage />}<div className="form-footer"><button className="secondary" onClick={() => { setAgreed(false); purge.reset(); plan.mutate(); }}>{t('refreshPreview')}</button><button className="danger" disabled={!agreed || !plan.data?.total || !plan.data.canPurge || purge.isPending || plan.isPending} onClick={() => purge.mutate()}>{t('retentionPurge')}</button></div></Modal>}
  </section>;
}

export function SensitiveAccessLog() {
  const { t, i18n } = useTranslation(); const [page, setPage] = useState(1);
  const log = useQuery({ queryKey: ['access-log', page], queryFn: () => api<{ page: number; total: number; items: SensitiveView[] }>(`/api/admin/access-log?page=${page}`) });
  return <section className="panel panel-body mt-6 space-y-4"><h2>{t('accessLog')}</h2><p className="subtitle">{t('accessLogHelp')}</p>{log.isPending && <p role="status">{t('loading')}</p>}{log.isError && <ErrorMessage />}{log.data && (!log.data.items.length ? <Empty /> : <div className="table-wrap"><table><thead><tr><th>{t('accessTime')}</th><th>{t('retentionTable')}</th><th>{t('recordId')}</th><th>{t('accessField')}</th><th>{t('accessActor')}</th></tr></thead><tbody>{log.data.items.map(row => <tr key={row.id}><td>{new Intl.DateTimeFormat(i18n.language, { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(row.occurredAt))}</td><td>{t(`model${row.entityType}`)}</td><td>{row.entityId}</td><td>{t(row.field === 'breachContact' ? 'breachContact' : row.field)}</td><td>{t('owner')}</td></tr>)}</tbody></table></div>)}<div className="flex gap-3"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={!log.data || page * 50 >= log.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div></section>;
}
