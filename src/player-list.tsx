import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PlayerAvatar } from './player-photo';
import { PlayerFit } from './player-suitability';
import { ageOn, positions, statuses } from '../shared/domain';
import { formatMarketAmount } from '../shared/player-market';
import { playerColumns, playerFilters, playerParams, playerSorts, playerTagBatch, playerViewInput, type PlayerColumn, type PlayerFilters, type PlayerListRow, type PlayerView } from '../shared/player-list';
import { api, apiBlob, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import type { List } from './types';

const columnLabels: Record<PlayerColumn, string> = {
  position: 'position', age: 'playerAge', club: 'club', league: 'playerLeague', score: 'playerScore', fit: 'playerFit',
  marketValue: 'playerMarketValue', contractEnd: 'playerContractEnd', availability: 'playerAvailability', status: 'status', tags: 'playerTags',
};
const sortLabels = { name: 'name', primaryPosition: 'position', status: 'status', levelScore: 'playerScore', marketValue: 'playerMarketValue', contractEndDate: 'playerContractEnd', availability: 'playerAvailability' };
type View = PlayerView | { id: string; version: number; name: string; unavailable: true };
const defaults = () => playerFilters.parse({});

export function PlayerDatabase({ onCreate }: { onCreate: () => void }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [filters, setFilters] = useState<PlayerFilters>(defaults);
  const [columns, setColumns] = useState<PlayerColumn[]>([...playerColumns]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlayerListRow[]>([]);
  const [viewId, setViewId] = useState('');
  const [modal, setModal] = useState<'view' | 'tags' | 'deleteView'>();
  const list = useQuery({ queryKey: ['players', playerParams(filters, page).toString()], queryFn: () => api<{ items: PlayerListRow[]; total: number }>(`/api/players?${playerParams(filters, page)}`) });
  const views = useQuery({ queryKey: ['player-views'], queryFn: () => api<View[]>('/api/players/views') });
  const selectedView = views.data?.find(view => view.id === viewId);
  const refresh = () => { void client.invalidateQueries(); setSelected([]); };
  const statusChange = useMutation({
    mutationFn: ({ row, status }: { row: PlayerListRow; status: string }) => api(`/api/records/Player/${row.id}`, { method: 'PATCH', body: body({ version: row.version, changes: { status } }) }), onSuccess: refresh,
  });
  const exportCsv = useMutation({ mutationFn: () => apiBlob(`/api/players/export?${playerParams(filters)}`), onSuccess: blob => {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'Player.csv'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  const removeView = useMutation({ mutationFn: () => api(`/api/players/views/${selectedView?.id}`, { method: 'DELETE', body: body({ version: selectedView?.version }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['player-views'] }); setViewId(''); setModal(undefined); } });
  function change(next: PlayerFilters) { setFilters(next); setPage(1); setSelected([]); setViewId(''); }
  function toggle(row: PlayerListRow, checked: boolean) {
    setSelected(rows => checked ? [...rows.filter(item => item.id !== row.id), row] : rows.filter(item => item.id !== row.id));
  }
  const date = (value: string) => new Intl.DateTimeFormat(document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: document.documentElement.lang === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  function cell(column: PlayerColumn, row: PlayerListRow) {
    switch (column) {
      case 'position': return t(row.primaryPosition);
      case 'age': return row.birthDate ? <PlayerAge key={row.id} id={row.id} /> : '—';
      case 'club': return row.currentClub ? <Link className="text-accent" to={`/record/Club/${row.currentClub.id}`}>{row.currentClub.name}</Link> : '—';
      case 'league': return row.currentLeague?.name ?? '—';
      case 'score': return row.levelScore ?? '—';
      case 'fit': return row.levelScore && row.birthDate ? <PlayerFit key={`${row.id}:${row.version}`} id={row.id} name={row.name} /> : <span className="muted">{t('playerFitUnassessed')}</span>;
      case 'marketValue': return row.marketValue && row.marketValueCurrency ? formatMarketAmount(row.marketValue, row.marketValueCurrency, i18n.language) : row.marketValue ?? '—';
      case 'contractEnd': return row.contractEndDate ? date(row.contractEndDate) : '—';
      case 'availability': return t(row.availability, { defaultValue: row.availability });
      case 'tags': return row.tags.join(' · ') || '—';
      case 'status': return <select className="player-status-select" aria-label={`${t('status')} · ${row.name}`} value={row.status} disabled={statusChange.isPending} onChange={event => statusChange.mutate({ row, status: event.target.value })}>
        {statuses.map(status => <option key={status} value={status}>{t(status)}</option>)}
      </select>;
    }
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1>{t('players')}</h1>
      <div className="flex gap-2"><button className="secondary" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>{t('playerExport')}</button><button className="primary" onClick={onCreate}>{t('new')}</button></div>
    </div>
    <div className="tabs">{[undefined, ...statuses].map(status => <button key={status ?? 'all'} className={filters.status === status ? 'selected' : ''} onClick={() => change({ ...filters, status })}>{t(status ?? 'all')}</button>)}</div>
    <PlayerFilterControls filters={filters} onChange={change} />
    <div className="panel panel-body my-4 flex flex-wrap items-end gap-3">
      <label className="field flex-1">{t('playerViewChoose')}<select aria-label={t('playerViewChoose')} value={viewId} onChange={event => {
        const view = views.data?.find(row => row.id === event.target.value);
        if (view && !('unavailable' in view)) { setFilters(view.filters); setColumns(view.columns); setPage(1); setSelected([]); }
        setViewId(event.target.value);
      }}><option value="">{t('select')}</option>{views.data?.map(view => <option key={view.id} value={view.id} disabled={'unavailable' in view}>{view.name}{'unavailable' in view ? ` · ${t('playerViewUnavailable')}` : ''}</option>)}</select></label>
      <button className="secondary mb-4" onClick={() => setModal('view')}>{t('playerViewSave')}</button>
      <button className="secondary mb-4" disabled={!selectedView} onClick={() => { removeView.reset(); setModal('deleteView'); }}>{t('playerViewDelete')}</button>
      <details className="mb-4"><summary>{t('playerColumns')}</summary><div className="flex flex-wrap gap-3 mt-3">{playerColumns.map(column => <label key={column} className="flex items-center gap-2">
        <input type="checkbox" checked={columns.includes(column)} disabled={columns.length === 1 && columns.includes(column)} onChange={event => setColumns(current => event.target.checked ? playerColumns.filter(key => current.includes(key) || key === column) : current.filter(key => key !== column))} />{t(columnLabels[column])}
      </label>)}</div></details>
    </div>
    {views.isError && <ErrorMessage />}
    {(list.isError || statusChange.isError) && <><ErrorMessage /><button className="secondary my-3" onClick={refresh}>{t('refreshPreview')}</button></>}
    {exportCsv.isError && (exportCsv.error instanceof ApiError && exportCsv.error.code === 'EXPORT_FILTER_REQUIRED' ? <p className="error" role="alert">{t('playerExportLimit')}</p> : <ErrorMessage />)}
    {!!selected.length && <div className="notice my-3 flex flex-wrap justify-between gap-3"><span>{t('playerSelected', { count: selected.length })}</span><button className="secondary" onClick={() => setModal('tags')}>{t('playerBulkTags')}</button></div>}
    {list.isPending ? <p role="status">{t('loading')}</p> : list.data && <section className="panel">
      {!list.data.items.length ? <Empty /> : <div className="table-wrap"><table><thead><tr>
        <th><input type="checkbox" aria-label={t('playerSelectPage')} checked={list.data.items.every(row => selected.some(item => item.id === row.id))} onChange={event => setSelected(event.target.checked ? list.data!.items : [])} /></th>
        <th>{t('name')}</th>{columns.map(column => <th key={column}>{t(columnLabels[column])}</th>)}
      </tr></thead><tbody>{list.data.items.map(row => <tr key={row.id}>
        <td><input type="checkbox" aria-label={t('playerSelect', { name: row.name })} checked={selected.some(item => item.id === row.id)} onChange={event => toggle(row, event.target.checked)} /></td>
        <td><Link className="row-name" to={`/record/Player/${row.id}`}><PlayerAvatar id={row.id} version={row.version} available={row.photo} /><span>{row.name}{row.isExample && <small className="block muted">{t('example')}</small>}</span></Link></td>
        {columns.map(column => <td key={column}>{cell(column, row)}</td>)}
      </tr>)}</tbody></table></div>}
      <div className="pagination"><span>{t('page', { page, total: list.data.total })}</span><div className="flex gap-2">
        <button className="secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected([]); }}>{t('previous')}</button>
        <button className="secondary" disabled={page * 50 >= list.data.total} onClick={() => { setPage(page + 1); setSelected([]); }}>{t('next')}</button>
      </div></div>
    </section>}
    {modal === 'view' && <SavePlayerView filters={filters} columns={columns} onClose={() => setModal(undefined)} />}
    {modal === 'tags' && <TagPlayers rows={selected} onClose={() => setModal(undefined)} onSave={() => { refresh(); setModal(undefined); }} />}
    {modal === 'deleteView' && selectedView && <Modal title={t('playerViewDelete')} onClose={() => setModal(undefined)}>
      <p>{selectedView.name}</p>{removeView.isError && <ErrorMessage />}
      <div className="form-footer"><button className="danger" disabled={removeView.isPending} onClick={() => removeView.mutate()}>{t('delete')}</button></div>
    </Modal>}
  </>;
}

function PlayerFilterControls({ filters, onChange }: { filters: PlayerFilters; onChange: (filters: PlayerFilters) => void }) {
  const { t } = useTranslation();
  const [clubSearch, setClubSearch] = useState('');
  const options = useQuery({ queryKey: ['player-options'], queryFn: () => api<{ leagues: { id: string; name: string }[]; availability: string[]; tags: string[] }>('/api/players/options') });
  const clubs = useQuery({ queryKey: ['player-club-options', clubSearch], queryFn: () => api<List>(`/api/clubs?q=${encodeURIComponent(clubSearch)}`) });
  return <details className="panel panel-body mt-4" open><summary>{t('playerFilters')}</summary>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 mt-4">
      <label className="field">{t('searchLabel')}<input placeholder={t('search')} value={filters.q} maxLength={100} onChange={event => onChange({ ...filters, q: event.target.value })} /></label>
      <label className="field">{t('position')}<select aria-label={t('position')} value={filters.position ?? ''} onChange={event => onChange({ ...filters, position: event.target.value as PlayerFilters['position'] || undefined })}>
        <option value="">{t('all')}</option>{positions.map(position => <option key={position} value={position}>{t(position)}</option>)}
      </select></label>
      <label className="field">{t('playerAvailability')}<select aria-label={t('playerAvailability')} value={filters.availability ?? ''} onChange={event => onChange({ ...filters, availability: event.target.value || undefined })}>
        <option value="">{t('all')}</option>{options.data?.availability.map(value => <option key={value} value={value}>{t(value, { defaultValue: value })}</option>)}
      </select></label>
      <label className="field">{t('playerClubSearch')}<input value={clubSearch} maxLength={100} onChange={event => setClubSearch(event.target.value)} /></label>
      <label className="field">{t('club')}<select aria-label={t('club')} value={filters.clubId ?? ''} onChange={event => onChange({ ...filters, clubId: event.target.value || undefined })}>
        <option value="">{t('all')}</option>{filters.clubId && !clubs.data?.items.some(row => row.id === filters.clubId) && <option value={filters.clubId}>{t('club')}</option>}
        {clubs.data?.items.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}
      </select></label>
      <label className="field">{t('playerLeague')}<select aria-label={t('playerLeague')} value={filters.leagueId ?? ''} onChange={event => onChange({ ...filters, leagueId: event.target.value || undefined })}>
        <option value="">{t('all')}</option>{options.data?.leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
      </select></label>
      <label className="field">{t('playerScoreMin')}<input type="number" min={1} max={10} step={0.5} value={filters.scoreMin ?? ''} onChange={event => onChange({ ...filters, scoreMin: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label className="field">{t('playerScoreMax')}<input type="number" min={1} max={10} step={0.5} value={filters.scoreMax ?? ''} onChange={event => onChange({ ...filters, scoreMax: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label className="field">{t('playerContractBefore')}<input type="date" value={filters.contractBefore ?? ''} onChange={event => onChange({ ...filters, contractBefore: event.target.value || undefined })} /></label>
      <label className="field">{t('playerTag')}<input list="player-tags" maxLength={40} value={filters.tag ?? ''} onChange={event => onChange({ ...filters, tag: event.target.value || undefined })} /></label>
      <datalist id="player-tags">{options.data?.tags.map(tag => <option key={tag} value={tag} />)}</datalist>
      <label className="field">{t('playerCurrency')}<select aria-label={t('playerCurrency')} value={filters.currency ?? ''} onChange={event => onChange({ ...filters, currency: event.target.value as PlayerFilters['currency'] || undefined, sort: !event.target.value && filters.sort === 'marketValue' ? 'name' : filters.sort })}>
        <option value="">{t('all')}</option>{['TRY', 'EUR', 'USD', 'GBP'].map(currency => <option key={currency} value={currency}>{currency}</option>)}
      </select></label>
      <label className="field">{t('playerSort')}<select aria-label={t('playerSort')} value={filters.sort} onChange={event => onChange({ ...filters, sort: event.target.value as PlayerFilters['sort'] })}>
        {playerSorts.map(sort => <option key={sort} value={sort} disabled={sort === 'marketValue' && !filters.currency}>{t(sortLabels[sort])}</option>)}
      </select></label>
      <label className="field">{t('playerDirection')}<select aria-label={t('playerDirection')} value={filters.direction} onChange={event => onChange({ ...filters, direction: event.target.value as PlayerFilters['direction'] })}>
        <option value="asc">{t('playerAscending')}</option><option value="desc">{t('playerDescending')}</option>
      </select></label>
    </div>
    {(options.isError || clubs.isError) && <ErrorMessage />}
    <button className="secondary" onClick={() => { setClubSearch(''); onChange(defaults()); }}>{t('playerFilterReset')}</button>
  </details>;
}

function PlayerAge({ id }: { id: string }) {
  const { t } = useTranslation(); const [age, setAge] = useState<number>();
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
  const reveal = useMutation({ mutationFn: () => api<{ value: string | null }>(`/api/records/Player/${id}/reveal`, { method: 'POST', body: body({ field: 'birthDate' }) }), onSuccess: result => {
    if (!mounted.current) return;
    clearTimeout(timer.current); setAge(result.value ? ageOn(result.value) : undefined); timer.current = setTimeout(() => setAge(undefined), 60000);
  } });
  return <>{age === undefined ? <button className="text-accent" disabled={reveal.isPending} onClick={() => reveal.mutate()}>{t('playerRevealAge')}</button>
    : <span>{age} <button className="text-accent" onClick={() => { clearTimeout(timer.current); setAge(undefined); }}>{t('hide')}</button></span>}{reveal.isError && <ErrorMessage />}</>;
}

function SavePlayerView({ filters, columns, onClose }: { filters: PlayerFilters; columns: PlayerColumn[]; onClose: () => void }) {
  const { t } = useTranslation(); const client = useQueryClient();
  const save = useMutation({ mutationFn: (name: string) => api('/api/players/views', { method: 'POST', body: body(playerViewInput.parse({ name, filters, columns })) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['player-views'] }); onClose(); } });
  return <Modal title={t('playerViewSave')} onClose={onClose}><form onSubmit={event => { event.preventDefault(); save.mutate(String(new FormData(event.currentTarget).get('name'))); }}>
    <label className="field">{t('name')}<input name="name" required maxLength={100} /></label>{save.isError && <ErrorMessage />}
    <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
  </form></Modal>;
}

function TagPlayers({ rows, onClose, onSave }: { rows: PlayerListRow[]; onClose: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const tag = useMutation({ mutationFn: (form: FormData) => api('/api/players/tags', { method: 'POST', body: body(playerTagBatch.parse({
    records: rows.map(row => ({ id: row.id, version: row.version })), tag: form.get('tag'), mode: form.get('mode'),
  })) }), onSuccess: onSave });
  return <Modal title={t('playerBulkTags')} onClose={onClose}><form onSubmit={event => { event.preventDefault(); tag.mutate(new FormData(event.currentTarget)); }}>
    <ul className="muted mb-4">{rows.map(row => <li key={row.id}>{row.name}</li>)}</ul>
    <label className="field">{t('playerTag')}<input name="tag" required maxLength={40} /></label>
    <label className="field">{t('playerBulkTags')}<select name="mode" aria-label={t('playerBulkTags')}><option value="add">{t('playerTagAdd')}</option><option value="remove">{t('playerTagRemove')}</option></select></label>
    {tag.isError && (tag.error instanceof ApiError && tag.error.status === 409 ? <p className="error" role="alert">{t('playerSelectionStale')}</p> : <ErrorMessage />)}
    <div className="form-footer"><button className="primary" disabled={tag.isPending}>{t('save')}</button></div>
  </form></Modal>;
}
