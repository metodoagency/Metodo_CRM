import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { istanbulToday, presentationChannels } from '../shared/domain';
import { presentationCreate, presentationResults, presentationUpdate, type MatrixInfo, type PresentationInfo } from '../shared/presentations';
import type { NamedRecord } from '../shared/transfer-requests';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';

export function PresentationResult({ value }: { value: typeof presentationResults[number] }) {
  const { t } = useTranslation();
  const colors = {
    PENDING: 'text-slate-700 dark:text-slate-300', INTERESTED: 'text-emerald-800 dark:text-emerald-400',
    OFFERED: 'text-sky-800 dark:text-sky-400', REJECTED: 'text-rose-800 dark:text-rose-400', WAITING: 'text-amber-800 dark:text-amber-400',
  };
  return <span className={colors[value]}>{t(`presentationResult_${value}`)}</span>;
}

export function Presentations() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const [view, setView] = useState<'log' | 'Club' | 'Person'>('log');
  const [page, setPage] = useState(1);
  const [overdue, setOverdue] = useState(params.get('overdue') === 'true');
  const [editing, setEditing] = useState<PresentationInfo | 'new'>();
  const focus = params.get('presentation');
  const opened = useQuery({ queryKey: ['presentation', focus], enabled: !!focus,
    queryFn: () => api<PresentationInfo>(`/api/presentations/${focus}`) });
  const list = useQuery({
    queryKey: ['presentations', page, overdue], enabled: view === 'log',
    queryFn: () => api<{ items: PresentationInfo[]; total: number }>(`/api/presentations?page=${page}&overdue=${overdue}`),
  });
  const items = focus && opened.data ? [opened.data] : list.data?.items;
  return <>
    <div className="flex flex-wrap justify-between gap-3"><h1>{t('presentations')}</h1>
      <button className="primary" onClick={() => setEditing('new')}>{t('presentationAdd')}</button></div>
    <div className="flex flex-wrap gap-2 my-5" role="group" aria-label={t('presentationView')}>
      {(['log', 'Club', 'Person'] as const).map(value => <button key={value} className={view === value ? 'primary' : 'secondary'}
        aria-pressed={view === value} onClick={() => setView(value)}>{t(value === 'log' ? 'presentationLog' : value === 'Club' ? 'presentationClubMatrix' : 'presentationPersonMatrix')}</button>)}
    </div>
    {view !== 'log' ? <PresentationMatrix key={view} axis={view} onEdit={setEditing} /> : <>
      {focus && <Link className="text-accent" to="/presentations">{t('allRecords')}</Link>}
      <label className="field my-3"><span><input type="checkbox" checked={overdue} onChange={event => { setOverdue(event.target.checked); setPage(1); }} /> {t('presentationOverdue')}</span></label>
      {(list.isError || opened.isError) && <ErrorMessage />}
      {list.isPending && <p role="status">{t('loading')}</p>}
      {items && (!items.length ? <Empty /> : <div className="panel table-wrap"><table>
        <thead><tr>{['player', 'club', 'person', 'recommendationDate', 'presentationChannel', 'status', 'presentationFollowUp', 'presentationActions'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td><Link to={`/record/Player/${item.player.id}`}>{item.player.name}</Link></td>
          <td><Link to={`/record/Club/${item.club.id}`}>{item.club.name}</Link></td>
          <td><Link to={`/record/Person/${item.person.id}`}>{item.person.name}</Link></td>
          <td>{displayDay(item.date, i18n.language)}</td><td>{t(`presentationChannel_${item.channel}`)}</td>
          <td><PresentationResult value={item.result} /></td><td>{displayDay(item.followUpDate, i18n.language)}</td>
          <td><button className="secondary" onClick={() => setEditing(item)}>{t('presentationEdit')}</button></td>
        </tr>)}</tbody>
      </table></div>)}
      {!focus && (page > 1 || (list.data?.total ?? 0) > 50) && <Paging page={page} more={page * 50 < (list.data?.total ?? 0)} onChange={setPage} label={t('presentationLog')} />}
    </>}
    {editing && <PresentationEditor record={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
  </>;
}

const day = (value: string) => value.slice(0, 10);
const displayDay = (value: string, language: string) => new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
  day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric', timeZone: 'Europe/Istanbul',
}).format(new Date(value));

function Paging({ page, more, onChange, label }: { page: number; more: boolean; onChange: (value: number) => void; label: string }) {
  const { t } = useTranslation();
  return <div className="pagination gap-3 flex-wrap"><span>{label} · {page}</span><div className="flex gap-2">
    <button className="secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>{t('previous')}</button>
    <button className="secondary" disabled={!more} onClick={() => onChange(page + 1)}>{t('next')}</button>
  </div></div>;
}

function PresentationMatrix({ axis, onEdit }: { axis: 'Club' | 'Person'; onEdit: (value: PresentationInfo) => void }) {
  const { t, i18n } = useTranslation();
  const [rowPage, setRowPage] = useState(1); const [playerPage, setPlayerPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', playerQ: '' });
  const [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ['presentation-matrix', axis, rowPage, playerPage, filters],
    queryFn: () => api<MatrixInfo>(`/api/presentation-matrix?${new URLSearchParams({ axis, rowPage: String(rowPage), playerPage: String(playerPage), ...filters })}`),
  });
  const open = useMutation({
    mutationFn: (id: string) => api<PresentationInfo>(`/api/presentations/${id}`), onSuccess: onEdit, onError: () => setError(true),
  });
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    setFilters({ q: String(fields.get('q') ?? '').trim(), playerQ: String(fields.get('playerQ') ?? '').trim() });
    setRowPage(1); setPlayerPage(1);
  }
  const data = query.data;
  const cells = new Map(data?.cells.map(cell => [`${cell.targetId}:${cell.playerId}`, cell]));
  return <>
    <p className="muted mb-3">{t('presentationLatest')}</p>
    <form onSubmit={search} className="flex flex-wrap items-end gap-3 my-4">
      <label className="field">{t(axis === 'Club' ? 'requestClubSearch' : 'presentationPersonSearch')}<input name="q" maxLength={100} /></label>
      <label className="field">{t('matchSearch')}<input name="playerQ" maxLength={100} /></label>
      <button className="secondary">{t('searchLabel')}</button>
    </form>
    {(query.isError || error) && <ErrorMessage />}
    {query.isPending && <p role="status">{t('loading')}</p>}
    {data && (!data.rows.length || !data.players.length ? <Empty /> : <>
      <div className="panel table-wrap"><table><caption className="sr-only">{t(axis === 'Club' ? 'presentationClubMatrix' : 'presentationPersonMatrix')}</caption>
        <thead><tr><th>{t(axis)}</th>{data.players.map(player => <th key={player.id}><Link to={`/record/Player/${player.id}`}>{player.name}</Link></th>)}</tr></thead>
        <tbody>{data.rows.map(target => <tr key={target.id}><th scope="row"><Link to={`/record/${axis}/${target.id}`}>{target.name}</Link></th>
          {data.players.map(player => { const cell = cells.get(`${target.id}:${player.id}`); return <td key={player.id}>{cell
            ? <button className="secondary" disabled={open.isPending} onClick={() => open.mutate(cell.id)}
              aria-label={`${t(`presentationResult_${cell.result}`)} ${displayDay(cell.date, i18n.language)} · ${target.name} · ${player.name}`}>
              <span className="flex flex-col gap-1"><PresentationResult value={cell.result} /><small>{displayDay(cell.date, i18n.language)}</small></span>
            </button> : '—'}</td>; })}
        </tr>)}</tbody>
      </table></div>
      <Paging page={rowPage} more={data.rowsMore} onChange={setRowPage} label={t(axis)} />
      <Paging page={playerPage} more={data.playersMore} onChange={setPlayerPage} label={t('players')} />
    </>)}
  </>;
}

function PresentationEditor({ record, onClose }: { record?: PresentationInfo; onClose: () => void }) {
  const { t } = useTranslation(); const client = useQueryClient();
  const [invalid, setInvalid] = useState(false);
  const [peers, setPeers] = useState<{ Club?: NamedRecord; Person?: NamedRecord; Player?: NamedRecord }>({});
  const save = useMutation({
    mutationFn: (input: object) => api(record ? `/api/presentations/${record.id}` : '/api/presentations', { method: record ? 'PATCH' : 'POST', body: body(input) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = record ? presentationUpdate.safeParse({ ...fields, version: record.version })
      : presentationCreate.safeParse({ ...fields, clubId: peers.Club?.id, personId: peers.Person?.id, playerId: peers.Player?.id });
    setInvalid(!parsed.success); if (parsed.success) save.mutate(parsed.data);
  }
  return <Modal title={t(record ? 'presentationEdit' : 'presentationAdd')} onClose={onClose}><form onSubmit={submit}>
    {record ? <p className="muted mb-3">{record.player.name} · {record.club.name} · {record.person.name}</p>
      : (['Club', 'Person', 'Player'] as const).map(type => <RecordPicker key={type} type={type} value={peers[type]} onChange={value => setPeers(prior => ({ ...prior, [type]: value }))} />)}
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="field">{t('recommendationDate')}<input name="date" type="date" required defaultValue={record ? day(record.date) : istanbulToday()} /></label>
      <label className="field">{t('presentationFollowUp')}<input name="followUpDate" type="date" required defaultValue={record ? day(record.followUpDate) : ''} /></label>
      <label className="field">{t('presentationChannel')}<select name="channel" defaultValue={record?.channel ?? 'IN_PERSON'}>{presentationChannels.map(value => <option key={value} value={value}>{t(`presentationChannel_${value}`)}</option>)}</select></label>
      <label className="field">{t('status')}<select name="result" defaultValue={record?.result ?? 'PENDING'}>{presentationResults.map(value => <option key={value} value={value}>{t(`presentationResult_${value}`)}</option>)}</select></label>
    </div>
    <label className="field">{t('presentationNote')}<textarea name="note" maxLength={4000} defaultValue={record?.note ?? ''} /></label>
    {invalid && <p className="error" role="alert">{t('invalid')}</p>}
    {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p role="alert" className="error">{t('contextChanged')}</p> : <ErrorMessage />)}
    <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
  </form></Modal>;
}

export function RecordPicker({ type, value, onChange }: {
  type: 'Club' | 'Person' | 'Player'; value?: NamedRecord; onChange: (record: NamedRecord | undefined) => void;
}) {
  const { t } = useTranslation(); const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const endpoint = { Club: 'clubs', Person: 'people', Player: 'players' }[type];
  const query = useQuery({ queryKey: ['record-picker', type, q],
    queryFn: () => api<{ items: NamedRecord[] }>(`/api/${endpoint}?q=${encodeURIComponent(q)}`) });
  const rows = query.data?.items ?? [];
  return <div className="mb-4">
    <div className="flex gap-2 items-end"><label className="field flex-1">{t('presentationSearchRecord', { type: t(type) })}<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setQ(search.trim()); } }} /></label>
      <button className="secondary" type="button" onClick={() => setQ(search.trim())}>{t('searchLabel')}</button></div>
    <label className="field"><span className="sr-only">{t(type)}</span>
      <select aria-label={t(type)} value={value?.id ?? ''} required onChange={event => onChange(rows.find(row => row.id === event.target.value))}>
        <option value="">{t('select')}</option>{value && !rows.some(row => row.id === value.id) && <option value={value.id}>{value.name}</option>}
        {rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>{query.isError && <ErrorMessage />}
  </div>;
}
