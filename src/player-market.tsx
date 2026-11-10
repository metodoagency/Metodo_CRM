import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { istanbulToday } from '../shared/domain';
import { formatMarketAmount, marketCurrencies, marketWrite, type MarketCurrency, type MarketView } from '../shared/player-market';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';

function dateText(date: string, language: string) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(date));
}

export function PlayerMarketPanel({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['player-market', id, page], queryFn: () => api<MarketView>(`/api/players/${id}/market?page=${page}`) });
  const data = query.data;
  const current = data?.current;
  return <section className="panel panel-body mt-5">
    <div className="flex justify-between items-start gap-3 flex-wrap">
      <div><h2>{t('playerMarketValue')}</h2>
        {current && <p className="mt-2">{current.currency ? formatMarketAmount(current.amount, current.currency, i18n.language) : current.amount}
          {current.date && <> · {dateText(current.date, i18n.language)}</>}
          {current.sourceUrl && <> · <a className="text-accent" href={current.sourceUrl} target="_blank" rel="noopener noreferrer">{t('source')}</a></>}
        </p>}
      </div>
      <button className="secondary" disabled={!data} onClick={() => setEditing(true)}>{t('marketAdd')}</button>
    </div>
    {data?.profileUrl && <a className="text-accent inline-block mt-3" href={data.profileUrl} target="_blank" rel="noopener noreferrer">{t('marketOpenProfile')}</a>}
    {query.isError && <ErrorMessage />}
    {data && (!!data.items.length || page > 1) && <details className="mt-4">
      <summary>{t('marketHistory')}</summary>
      {!!data.items.length && <MarketChart items={data.items} preferred={current?.currency ?? undefined} />}
      <ul className="divide-y mt-3">{data.items.map(item => <li key={item.id} className="py-3 break-words">
        <strong>{formatMarketAmount(item.amount, item.currency, i18n.language)} · {dateText(item.date, i18n.language)}</strong>
        <p className="muted mt-2 whitespace-pre-wrap">{item.method}</p>
        <a className="text-accent" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t('source')}</a>
      </li>)}</ul>
      {(page > 1 || data.more) && <div className="pagination">
        <button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button>
        <button className="secondary" disabled={!data.more} onClick={() => setPage(value => value + 1)}>{t('next')}</button>
      </div>}
    </details>}
    {editing && data && <MarketForm id={id} snapshot={data} onClose={() => setEditing(false)} onSaved={() => { setPage(1); setEditing(false); }} />}
  </section>;
}

function MarketChart({ items, preferred }: { items: MarketView['items']; preferred?: MarketCurrency }) {
  const { t } = useTranslation();
  const currencies = marketCurrencies.filter(currency => items.some(item => item.currency === currency));
  const [selected, setSelected] = useState<MarketCurrency>();
  const currency = currencies.find(value => value === (selected ?? preferred)) ?? currencies[0];
  const series = items.filter(item => item.currency === currency).reverse().sort((a, b) => a.date.localeCompare(b.date));
  const amounts = series.map(item => {
    const [whole, fraction = ''] = item.amount.split('.');
    return BigInt(whole + fraction.padEnd(2, '0'));
  });
  const min = amounts.reduce((min, value) => value < min ? value : min, amounts[0]);
  const max = amounts.reduce((max, value) => value > max ? value : max, amounts[0]);
  const start = Date.parse(series[0].date);
  const duration = Date.parse(series[series.length - 1].date) - start;
  const points = amounts.map((value, index) => [
    duration ? 14 + 292 * (Date.parse(series[index].date) - start) / duration : 160,
    max === min ? 60 : 104 - Number((value - min) * 88n / (max - min)),
  ]);
  return <>
    <label className="field max-w-sm mt-3">{t('playerCurrency')}<select aria-label={t('playerCurrency')} value={currency} onChange={event => setSelected(event.target.value as MarketCurrency)}>
      {currencies.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <svg viewBox="0 0 320 120" className="score-history-chart" role="img" aria-label={t('marketChart')}>
      <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} />
      {points.map(([x, y], index) => <circle key={series[index].id} cx={x} cy={y} r={3} fill="currentColor" />)}
    </svg>
  </>;
}

function MarketForm({ id, snapshot, onClose, onSaved }: { id: string; snapshot: MarketView; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState(snapshot);
  const mutation = useMutation({
    mutationFn: (form: FormData) => {
      const profileUrl = String(form.get('profileUrl') ?? '').trim();
      return api(`/api/players/${id}/market`, { method: 'PATCH', body: body(marketWrite.parse({
        version: initial.version, amount: String(form.get('amount')).trim().replace(',', '.'), currency: form.get('currency'), date: form.get('date'),
        sourceUrl: form.get('sourceUrl'), method: form.get('method'), ...(profileUrl !== (initial.profileUrl ?? '') ? { profileUrl: profileUrl || null } : {}),
      })) });
    },
    onSuccess: () => { void client.invalidateQueries(); onSaved(); },
  });
  return <Modal title={t('marketAdd')} onClose={onClose}>
    <p className="muted mb-4">{t('marketHistoryHint')}</p>
    <form onSubmit={event => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}>
      <label className="field">{t('marketAmount')}<input name="amount" inputMode="decimal" required maxLength={19} /></label>
      <label className="field">{t('playerCurrency')}<select aria-label={t('playerCurrency')} name="currency" defaultValue={initial.current?.currency ?? 'TRY'}>
        {marketCurrencies.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="field">{t('marketDate')}<input name="date" type="date" defaultValue={istanbulToday()} max={istanbulToday()} required /></label>
      <label className="field">{t('sourceAddress')}<input name="sourceUrl" type="url" maxLength={2048} required /></label>
      <label className="field">{t('marketMethod')}<textarea name="method" maxLength={1000} required /></label>
      <label className="field">{t('marketProfile')}<input name="profileUrl" type="url" maxLength={2048} defaultValue={initial.profileUrl ?? ''} /></label>
      {mutation.isError && (mutation.error instanceof ApiError && mutation.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
