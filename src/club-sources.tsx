import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { clubSourceInput, clubSourceList, manualSourceUrl, sourceTrustLevels, type ClubSource } from '../shared/club-sources';
import { sourceTypes } from '../shared/provenance';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import type { List, RecordRow } from './types';

export function ClubSourceRegistry() {
  const [params] = useSearchParams();
  const parsed = clubSourceList.safeParse({ clubId: params.get('clubId') ?? undefined });
  const clubId = parsed.success ? parsed.data.clubId : undefined;
  return <SourceList key={clubId} clubId={clubId} />;
}

function SourceList({ clubId }: { clubId?: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClubSource | 'new'>();
  const [deleting, setDeleting] = useState<ClubSource>();
  const query = useQuery({ queryKey: ['source-registry', clubId, page], queryFn: () => api<{ items: ClubSource[]; more: boolean }>(`/api/sources?page=${page}${clubId ? `&clubId=${clubId}` : ''}`) });
  const club = useQuery({ queryKey: ['source-club', clubId], enabled: !!clubId, queryFn: () => api<RecordRow>(`/api/records/Club/${clubId}`) });
  const refresh = () => { void client.invalidateQueries(); setPage(1); };
  const remove = useMutation({ mutationFn: (source: ClubSource) => api(`/api/sources/${source.id}`, { method: 'DELETE', body: body({ version: source.version }) }),
    onSuccess: () => { setDeleting(undefined); refresh(); } });
  return <><h1>{t('sourceRegistry')}</h1>
    <div className="my-4 flex gap-3 flex-wrap items-center">
      <button className="primary" disabled={!!clubId && !club.data} onClick={() => setEditing('new')}>{t('sourceAdd')}</button>
      {club.data && <Link className="secondary" to={`/record/Club/${clubId}`}>{club.data.name}</Link>}
      {clubId && <Link className="secondary" to="/sources">{t('sourceAll')}</Link>}
    </div>
    <section className="panel panel-body">
      {query.isError && <ErrorMessage />}
      {query.isPending && <p role="status">{t('loading')}</p>}
      {query.data && (query.data.items.length ? <ul className="divide-y">{query.data.items.map(row => <li key={row.id} className="py-3 flex flex-wrap gap-3 justify-between">
        <div className="min-w-0 break-words">
          {manualSourceUrl.safeParse(row.url).success
            ? <a className="text-accent" href={row.url} target="_blank" rel="noopener noreferrer">{row.name}</a>
            : <strong>{row.name}</strong>}
          <p className="muted text-xs mt-2">{[t(`sourceType_${row.type}`), t(`sourceTrust_${row.trustLevel}`), t('sourceMethodManual')].join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-3">{row.clubs.map(item => <Link key={item.id} className="text-accent" to={`/record/Club/${item.id}`}>{item.name}</Link>)}</div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button className="secondary" onClick={() => setEditing(row)}>{t('sourceEdit')}</button>
          <button className="secondary" onClick={() => { remove.reset(); setDeleting(row); }}>{t('delete')}</button>
        </div>
      </li>)}</ul> : <Empty />)}
      {(page > 1 || query.data?.more) && <div className="pagination">
        <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
        <button className="secondary" disabled={!query.data?.more} onClick={() => setPage(page + 1)}>{t('next')}</button>
      </div>}
    </section>
    {editing && <SourceForm source={editing === 'new' ? undefined : editing} initialClub={club.data} onClose={() => setEditing(undefined)} onSaved={refresh} />}
    {deleting && <Modal title={t('delete')} onClose={() => setDeleting(undefined)}>
      <p>{deleting.name}</p><p className="muted mt-3">{t('sourceDeleteConfirm')}</p>
      {remove.isError && <ErrorMessage />}
      <div className="form-footer"><button className="danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{t('delete')}</button></div>
    </Modal>}
  </>;
}

function SourceForm({ source, initialClub, onClose, onSaved }: {
  source?: ClubSource; initialClub?: { id: string; name: string }; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [linked, setLinked] = useState(() => source ? source.linkedClubIds.map(id => ({ id, name: source.clubs.find(club => club.id === id)?.name })) : initialClub ? [initialClub] : []);
  const clubs = useQuery({ queryKey: ['source-club-options', search], enabled: search.trim().length > 0,
    queryFn: () => api<List>(`/api/clubs?q=${encodeURIComponent(search.trim())}`) });
  const save = useMutation({
    mutationFn: (form: FormData) => {
      const input = clubSourceInput.parse({ name: form.get('name'), type: form.get('type'), url: form.get('url'), trustLevel: form.get('trustLevel'), linkedClubIds: linked.map(row => row.id) });
      return api(source ? `/api/sources/${source.id}` : '/api/sources', { method: source ? 'PATCH' : 'POST', body: body(source ? { ...input, version: source.version } : input) });
    },
    onSuccess: () => { onSaved(); onClose(); },
  });
  const code = save.error instanceof ApiError ? save.error.code : undefined;
  return <Modal title={t(source ? 'sourceEdit' : 'sourceAdd')} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); save.mutate(new FormData(event.currentTarget)); }}>
      <label className="field">{t('name')}<input name="name" defaultValue={source?.name} required maxLength={160} /></label>
      <label className="field">{t('sourceAddress')}<input type="url" name="url" defaultValue={source?.url} required maxLength={2048} /></label>
      <label className="field">{t('sourceCategory')}<select name="type" aria-label={t('sourceCategory')} defaultValue={source?.type ?? 'MANUAL'}>
        {sourceTypes.map(type => <option key={type} value={type}>{t(`sourceType_${type}`)}</option>)}
      </select></label>
      <label className="field">{t('sourceTrust')}<select name="trustLevel" aria-label={t('sourceTrust')} defaultValue={source?.trustLevel ?? 'OFFICIAL'}>
        {sourceTrustLevels.map(level => <option key={level} value={level}>{t(`sourceTrust_${level}`)}</option>)}
      </select></label>
      <p className="notice mb-4">{t(source && source.scanMethod !== 'MANUAL' ? 'sourceLegacyMethod' : 'sourceMethodManual')}</p>
      <fieldset><legend>{t('sourceLinkedClubs')}</legend>
        <ul className="my-2 space-y-2">{linked.map(row => <li key={row.id}>
          <button className="secondary" type="button" onClick={() => setLinked(items => items.filter(item => item.id !== row.id))}>{t('sourceUnlink', { name: row.name ?? t('sourceClubUnavailable') })}</button>
        </li>)}</ul>
        <label className="field">{t('sourceClubSearch')}<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
        {clubs.isError && <ErrorMessage />}
        <ul className="space-y-2">{clubs.data?.items.filter(row => !linked.some(item => item.id === row.id)).map(row => <li key={row.id}>
          <button className="secondary" type="button" disabled={linked.length >= 100} onClick={() => { setLinked(items => [...items, { id: row.id, name: row.name }]); setSearch(''); }}>{t('sourceLink', { name: row.name })}</button>
        </li>)}</ul>
      </fieldset>
      {save.isError && (code === 'SOURCE_EXAMPLE_LINKS' || code === 'SOURCE_CLUB_UNAVAILABLE' || code === 'STALE_VERSION'
        ? <p className="error" role="alert">{t(code === 'SOURCE_EXAMPLE_LINKS' ? 'sourceExampleLinks' : code === 'SOURCE_CLUB_UNAVAILABLE' ? 'sourceLinkStale' : 'contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
