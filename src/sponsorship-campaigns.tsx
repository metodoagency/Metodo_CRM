import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { campaignCreate, campaignPatch, type CampaignRecord } from '../shared/pipeline';
import { ApiError, api } from './api';
import { ErrorMessage, Modal } from './components';
import { usePrivateRequest } from './use-private-request';

export function CampaignEditor({ row: initial, close, saved }: { row?: CampaignRecord; close: () => void; saved: () => void }) {
  const [row] = useState(initial); const { t } = useTranslation(); const request = usePrivateRequest(); const [invalid, setInvalid] = useState(false);
  return <Modal title={t(row ? 'campaignEdit' : 'campaignAdd')} onClose={close}><form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const fields = { name: form.get('name'), startDate: form.get('startDate') || null, endDate: form.get('endDate') || null };
    const input = row ? campaignPatch.safeParse({ ...fields, version: row.version }) : campaignCreate.safeParse({ ...fields, isExample: form.get('example') === 'on' });
    if (!input.success) { setInvalid(true); return; } setInvalid(false); void request.run(row ? `/api/campaigns/${row.id}` : '/api/campaigns', input.data, saved, row ? 'PATCH' : 'POST');
  }}><fieldset disabled={request.busy}><label className="field">{t('campaignName')}<input name="name" minLength={2} maxLength={160} required defaultValue={row?.name} /></label><label className="field">{t('campaignStart')}<input name="startDate" type="date" min="0001-01-01" max="9999-12-31" defaultValue={row?.startDate ?? ''} /></label><label className="field">{t('campaignEnd')}<input name="endDate" type="date" min="0001-01-01" max="9999-12-31" defaultValue={row?.endDate ?? ''} /></label>{!row && <label className="flex gap-2 my-3"><input name="example" type="checkbox" />{t('example')}</label>}{invalid && <p className="error" role="alert">{t('pipelineInvalid')}</p>}{request.error !== undefined && <p className="error" role="alert">{t(request.error instanceof ApiError && request.error.status === 409 ? 'pipelineConflict' : 'pipelineInvalid')}</p>}<button className="primary mt-4">{t('save')}</button></fieldset></form></Modal>;
}
export function CampaignManager({ close, refresh }: { close: () => void; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation(); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [editing, setEditing] = useState<CampaignRecord>(); const generation = useRef(0);
  const query = useQuery({ queryKey: ['campaigns', 'manager', q, page], queryFn: () => api<{ items: CampaignRecord[]; total: number }>(`/api/campaigns?${new URLSearchParams({ q, page: String(page) })}`) });
  const date = (v: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(v));
  if (editing) { const opening = generation.current; return <CampaignEditor row={editing} close={() => { generation.current++; setEditing(undefined); }} saved={() => { if (opening !== generation.current) return; generation.current++; setEditing(undefined); void refresh(); }} />; }
  return <Modal title={t('campaignManage')} onClose={close}><label className="field">{t('pipelineCampaignSearch')}<input value={q} maxLength={100} onChange={e => { setQ(e.target.value); setPage(1); }} /></label>{query.isError && <ErrorMessage />}{!query.isError && query.data?.items.map(row => <article className="panel panel-body my-3" key={row.id}><h3>{row.name}</h3>{row.startDate && <p className="muted mt-2">{t('campaignStart')}: {date(row.startDate)}</p>}{row.endDate && <p className="muted mt-2">{t('campaignEnd')}: {date(row.endDate)}</p>}<button className="secondary mt-3" onClick={() => { generation.current++; setEditing(row); }}>{t('campaignEdit')}</button></article>)}{query.data && !query.data.items.length && <p className="muted my-4">{t('campaignEmpty')}</p>}{query.data && <div className="flex gap-2 mt-4"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= query.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div>}</Modal>;
}
