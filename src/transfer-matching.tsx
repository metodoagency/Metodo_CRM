import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchCriteria, matchingSettings, matchingSettingsFor, type MatchPage, type MatchingSettings } from '../shared/transfer-matching';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';

type Settings = { version: number; matchingWeights: unknown };
const sortOptions = ['score', 'coverage', 'name'] as const;
const pageSize = 25;

export function RequestMatches({ id, version }: { id: string; version: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <section className="panel panel-body my-5">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h2>{t('matchTitle')}</h2><button className="secondary" onClick={() => setOpen(true)}>{t('matchRun')}</button>
    </div>
    {open && <MatchDialog id={id} version={version} onClose={() => setOpen(false)} />}
  </section>;
}

function MatchDialog({ id, version, onClose }: { id: string; version: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<typeof sortOptions[number]>('score');
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
  const query = useQuery({
    queryKey: ['request-matches', id, version, settings.data?.version, q, sort, page],
    enabled: !!settings.data,
    queryFn: ({ signal }) => api<MatchPage>(`/api/requests/${id}/matches`, { method: 'POST', body: body({ q, sort, page }), signal }),
    gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(onClose, Math.max(0, query.dataUpdatedAt + data.expiresIn * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [data, onClose, query.dataUpdatedAt]);
  const formatter = new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
    dateStyle: 'medium', timeZone: 'UTC',
  });
  return <Modal title={t('matchTitle')} onClose={onClose}>
    <p className="muted mb-4">{t('matchRule')}</p>
    <form className="flex flex-wrap gap-2 items-end mb-3" onSubmit={event => { event.preventDefault(); setQ(search.trim()); setPage(1); }}>
      <label className="field flex-1">{t('matchSearch')}<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
      <button className="secondary">{t('searchLabel')}</button>
    </form>
    <label className="field mb-3">{t('matchSort')}<select value={sort} onChange={event => {
      setSort(event.target.value as typeof sortOptions[number]); setPage(1);
    }}>{sortOptions.map(key => <option key={key} value={key}>{t(`matchSort_${key}`)}</option>)}</select></label>
    {(query.isError || settings.isError) && (query.error instanceof ApiError && query.error.code === 'MATCH_FILTER_REQUIRED'
      ? <p className="error" role="alert">{t('matchFilterRequired')}</p> : <ErrorMessage />)}
    {(query.isFetching || settings.isPending) && <p className="muted" role="status">{t('loading')}</p>}
    {data && <>
      <p className="muted text-sm">{t('matchAsOf', { date: formatter.format(new Date(data.asOf)) })}</p>
      {!data.items.length ? <Empty /> : <ul className="divide-y">{data.items.map(item => {
        const unavailable = item.criteria.filter(check => check.points === null || check.reason === 'lateContract');
        return <li key={item.id} className="py-3 space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
            <Link className="font-semibold text-accent" to={`/record/Player/${item.id}`}>{item.name}</Link>
            {item.isExample && <span className="text-xs muted">{t('example')}</span>}
            <span>{item.score === null ? t('matchUnscored') : t('matchScoreValue', { score: item.score })}</span>
            <span className="muted">{t('matchCoverage', { coverage: item.coverage })}</span>
          </div>
          {unavailable.length > 0 && <p className="text-xs muted">{t('matchMissingSection')} · {unavailable.map(check => t(`matchCriteria_${check.criterion}`)).join(', ')}</p>}
          <details><summary className="cursor-pointer text-accent">{t('matchDetails')}</summary>
            <ul className="space-y-1 mt-2">{item.criteria.map(check => <li key={check.criterion}>
              {t(`matchCriteria_${check.criterion}`)} · {t(check.reason === 'partial' ? `matchPartial_${check.criterion}` : `matchReason_${check.reason}`)}
            </li>)}</ul>
          </details>
        </li>;
      })}</ul>}
      {(page > 1 || data.total > pageSize) && <div className="pagination flex-wrap"><span>{t('page', { page, total: data.total })}</span>
        <div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
          <button className="secondary" disabled={page * pageSize >= data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
      </div>}
    </>}
  </Modal>;
}

export function MatchingSettingsPanel() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
  return <section className="panel panel-body mt-5">
    <h2>{t('matchSettings')}</h2><p className="muted my-3">{t('matchWeightsHelp')}</p>
    {query.isError && <ErrorMessage />}
    {query.data && <MatchingSettingsForm key={query.data.version} settings={query.data} />}
  </section>;
}

function MatchingSettingsForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const defaults = matchingSettingsFor(settings.matchingWeights);
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (value: MatchingSettings) => api('/api/settings', { method: 'PATCH', body: body({ version: settings.version, matchingWeights: value }) }),
    onSuccess: response => { client.setQueryData(['settings'], response); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const minimum = values.get('levelMinimum');
    const parsed = matchingSettings.safeParse({
      weights: Object.fromEntries(matchCriteria.map(key => [key, Number(values.get(key))])),
      levelMinimum: minimum === '' ? null : Number(minimum),
    });
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  }
  return <form onSubmit={submit}>
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{matchCriteria.map(key => <label className="field" key={key}>
      {t(`matchCriteria_${key}`)}<input type="number" min="0" max="100" name={key} required defaultValue={defaults.weights[key]} />
    </label>)}</div>
    <label className="field max-w-sm">{t('matchMinimumLevel')}<input type="number" min="1" max="10" step="0.5" name="levelMinimum"
      placeholder={t('requestAny')} defaultValue={defaults.levelMinimum ?? ''} /></label>
    {invalid && <p className="error" role="alert">{t('invalid')}</p>}
    {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
    <button className="primary" disabled={save.isPending}>{t('matchSaveSettings')}</button>
  </form>;
}
