import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { istanbulToday } from '../shared/domain';
import { formatMarketAmount, marketCurrencies } from '../shared/player-market';
import { mandateCreate, mandateUpdate, saleConfidentialities, saleCreate, saleStatuses, saleUpdate, type ClubMandate, type ClubSale } from '../shared/sales';
import type { NamedRecord } from '../shared/transfer-requests';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import { RecordPicker } from './presentations';

type Page<T> = { items: T[]; more: boolean };
export function ClubSales({ clubId }: { clubId: string }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'sales' | 'mandates'>('sales');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClubMandate | ClubSale | 'new'>();
  const query = useQuery({
    queryKey: ['club-sales', clubId, tab, page],
    queryFn: () => api<Page<ClubMandate | ClubSale>>(`/api/clubs/${clubId}/${tab}?page=${page}`),
  });
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
    day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric', timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
  return <section className="panel panel-body mt-5">
    <h2>{t('salesWorkspace')}</h2><p className="muted my-3">{t('salesMandateHelp')}</p>
    <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label={t('salesWorkspace')}>
      {(['sales', 'mandates'] as const).map(value => <button key={value} className={tab === value ? 'primary' : 'secondary'}
        aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1); setEditing(undefined); }}>{t(value === 'sales' ? 'salesWorkspace' : 'salesMandates')}</button>)}
      <button className="secondary ml-auto" onClick={() => setEditing('new')}>{t(tab === 'sales' ? 'salesAdd' : 'mandateAdd')}</button>
    </div>
    {query.isError && <ErrorMessage />}{query.isPending && <p role="status">{t('loading')}</p>}
    {query.data && (!query.data.items.length ? <Empty /> : <ul className="divide-y">{query.data.items.map(item => <li key={item.id} className="py-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Link className="text-accent" to={`/record/Player/${item.player.id}`}>{item.player.name}</Link>
        <button className="secondary" onClick={() => setEditing(item)}>{t('askingAmount' in item ? 'salesEdit' : 'mandateEdit')}</button>
      </div>
      {'askingAmount' in item ? <>
        <p className="mt-2">{formatMarketAmount(item.askingAmount, item.currency, i18n.language)} · {t(`salesStatus_${item.status}`)} · {t(`salesConfidentiality_${item.confidentiality}`)}</p>
        <p className="muted">{t(item.authorized ? 'mandateCurrent' : 'mandateInactive')}</p>
      </> : <p className="muted mt-2">{item.name} · {date(item.startDate)} — {date(item.endDate)} · {t(item.current ? 'mandateCurrent' : 'mandateInactive')}</p>}
      <p className="whitespace-pre-wrap break-words text-sm mt-2">{item.scope}</p>
    </li>)}</ul>)}
    {(page > 1 || query.data?.more) && <div className="pagination">
      <button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button>
      <button className="secondary" disabled={!query.data?.more} onClick={() => setPage(value => value + 1)}>{t('next')}</button>
    </div>}
    {editing && <ClubSaleEditor clubId={clubId} tab={tab} record={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
  </section>;
}

function ClubSaleEditor({ clubId, tab, record, onClose }: {
  clubId: string; tab: 'sales' | 'mandates'; record?: ClubMandate | ClubSale; onClose: () => void;
}) {
  const { t } = useTranslation(); const client = useQueryClient();
  const [player, setPlayer] = useState<NamedRecord | undefined>(record?.player);
  const [invalid, setInvalid] = useState(false);
  const sale = record && 'askingAmount' in record ? record : undefined;
  const mandate = record && 'startDate' in record ? record : undefined;
  const save = useMutation({
    mutationFn: (input: object) => api(record ? `/api/${tab}/${record.id}` : `/api/clubs/${clubId}/${tab}`, {
      method: record ? 'PATCH' : 'POST', body: body(input),
    }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const fields = Object.fromEntries(values);
    const data = tab === 'sales' ? { ...fields, askingAmount: String(fields.askingAmount).replace(',', '.') } : {
      ...fields, sourceUrl: fields.sourceUrl || null, documentRef: fields.documentRef || null,
      exclusive: values.has('exclusive'),
    };
    const schema = tab === 'sales' ? record ? saleUpdate : saleCreate : record ? mandateUpdate : mandateCreate;
    const input = schema.safeParse({ ...data, ...(record ? { version: record.version } : { playerId: player?.id }) });
    setInvalid(!input.success); if (input.success) save.mutate(input.data);
  }
  const title = tab === 'sales' ? record ? 'salesEdit' : 'salesAdd' : record ? 'mandateEdit' : 'mandateAdd';
  return <Modal title={t(title)} onClose={onClose}><form onSubmit={submit}>
    {record ? <p className="muted mb-3">{record.player.name}</p> : <RecordPicker type="Player" value={player} onChange={setPlayer} />}
    {tab === 'sales' ? <>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="field">{t('salesAmount')}<input name="askingAmount" inputMode="decimal" required maxLength={19} defaultValue={sale?.askingAmount} /></label>
        <label className="field">{t('salesCurrency')}<select name="currency" defaultValue={sale?.currency ?? 'EUR'}>{marketCurrencies.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="field">{t('salesConfidentiality')}<select name="confidentiality" defaultValue={sale?.confidentiality ?? 'PRIVATE'}>{saleConfidentialities.map(value => <option key={value} value={value}>{t(`salesConfidentiality_${value}`)}</option>)}</select></label>
        <label className="field">{t('salesStatus')}<select name="status" defaultValue={sale?.status ?? 'OPEN'}>{saleStatuses.map(value => <option key={value} value={value}>{t(`salesStatus_${value}`)}</option>)}</select></label>
      </div>
      <label className="field">{t('salesScope')}<textarea name="scope" required maxLength={4000} defaultValue={sale?.scope} /></label>
    </> : <>
      <label className="field">{t('name')}<input name="name" required minLength={2} maxLength={160} defaultValue={mandate?.name} /></label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="field">{t('mandateStart')}<input type="date" name="startDate" required defaultValue={mandate?.startDate.slice(0, 10) ?? istanbulToday()} /></label>
        <label className="field">{t('mandateEnd')}<input type="date" name="endDate" required defaultValue={mandate?.endDate.slice(0, 10)} /></label>
      </div>
      <label className="field">{t('mandateScope')}<textarea name="scope" required maxLength={4000} defaultValue={mandate?.scope} /></label>
      <label className="field">{t('mandateSource')}<input type="url" name="sourceUrl" defaultValue={mandate?.sourceUrl ?? ''} /></label>
      <label className="field">{t('mandateDocument')}<input name="documentRef" maxLength={1000} defaultValue={mandate?.documentRef ?? ''} /></label>
      <label className="field"><span><input type="checkbox" name="exclusive" defaultChecked={mandate?.exclusive ?? false} /> {t('mandateExclusive')}</span></label>
    </>}
    {invalid && <p role="alert" className="error">{t('invalid')}</p>}
    {save.isError && (save.error instanceof ApiError && ['MANDATE_REQUIRED', 'SALE_EXISTS', 'STALE_VERSION'].includes(save.error.code)
      ? <p role="alert" className="error">{t(save.error.code === 'MANDATE_REQUIRED' ? 'salesNeedMandate' : save.error.code === 'SALE_EXISTS' ? 'salesAlreadyExists' : 'contextChanged')}</p> : <ErrorMessage />)}
    <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
  </form></Modal>;
}
