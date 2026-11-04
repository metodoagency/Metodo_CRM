import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, ApiError, body } from './api';
import { Badge, Empty, ErrorMessage, Modal } from './components';
import { geographyKey } from './club-explorer';
import { clubLocationInput, hasCoordinates, type ClubGeography, type ClubSection, type ClubSectionRow } from '../shared/club-network';
import type { ClubRecord } from './types';

const sections = {
  overview: 'overview', staff: 'clubStaff', ageTeams: 'clubAgeTeams', players: 'players',
  requests: 'requests', updates: 'clubUpdates', relationship: 'clubRelationship', meetings: 'clubMeetings',
  notes: 'clubNotes', sources: 'clubFollowSources', stakeholders: 'clubStakeholders', finance: 'clubFinance',
} as const;
const playerScopes = { squad: 'clubSquad', suggested: 'clubSuggested', sales: 'clubSales', mandated: 'clubMandated' } as const;
type Tab = keyof typeof sections;

export function ClubWorkspace({ club, overview }: { club: ClubRecord; overview: ReactNode }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');
  return <div className="mt-5">
    <nav className="club-tabs" aria-label={t('clubDetails')}>
      {(Object.keys(sections) as Tab[]).map(key => <button key={key} className="secondary"
        aria-pressed={tab === key} onClick={() => setTab(key)}>{t(sections[key])}</button>)}
    </nav>
    {tab === 'overview' ? <><ClubLocation club={club} />{overview}</> : <ClubSectionPanel key={tab} section={tab} club={club} />}
  </div>;
}

function ClubLocation({ club }: { club: ClubRecord }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const geography = useQuery({ queryKey: geographyKey, queryFn: () => api<ClubGeography>('/api/clubs/geography') });
  const country = geography.data?.countries.find(row => row.id === club.countryId);
  const region = geography.data?.regions.find(row => row.id === club.regionId && row.countryId === country?.id);
  return <section className="panel panel-body mt-5">
    <div className="flex flex-wrap justify-between gap-3">
      <div>
        <h2>{t('clubGeography')}</h2>
        <p className="muted mt-2">{[country?.name, region?.name, club.city].filter(Boolean).join(' · ') || t('clubUnassigned')}</p>
        <p className="muted">{hasCoordinates(club) ? `${club.lat}, ${club.lng}` : t('clubLocationMissing')}</p>
        {club.stadium && <p className="muted mt-2">{t('clubStadium')} · {club.stadium}</p>}
      </div>
      <button className="secondary self-start" disabled={!geography.data} onClick={() => setEditing(true)}>{t('clubEditLocation')}</button>
    </div>
    {geography.isError && <ErrorMessage />}
    {editing && geography.data && <ClubLocationForm club={club} geography={geography.data} onClose={() => setEditing(false)} />}
  </section>;
}

function ClubLocationForm({ club, geography, onClose }: { club: ClubRecord; geography: ClubGeography; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [countryId, setCountry] = useState(geography.countries.some(row => row.id === club.countryId) ? club.countryId ?? '' : '');
  const [regionId, setRegion] = useState(geography.regions.some(row => row.id === club.regionId && row.countryId === countryId) ? club.regionId ?? '' : '');
  const mutation = useMutation({
    mutationFn: (input: unknown) => api(`/api/clubs/${club.id}/location`, { method: 'PATCH', body: body(clubLocationInput.parse(input)) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const numeric = (name: string) => values.get(name) === '' ? null : Number(values.get(name));
    mutation.mutate({
      version: club.version, countryId: countryId || null, regionId: regionId || null,
      lat: numeric('lat'), lng: numeric('lng'), city: values.get('city') || null,
      stadium: values.get('stadium') || null, relationStatus: values.get('relationStatus'), isTracked: values.has('isTracked'),
    });
  }
  return <Modal title={t('clubEditLocation')} onClose={onClose}>
    <form onSubmit={submit}>
      <label className="field">{t('clubCountry')}<select aria-label={t('clubCountry')} value={countryId} onChange={event => { setCountry(event.target.value); setRegion(''); }}>
        <option value="">{t('clubUnassigned')}</option>
        {geography.countries.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label className="field">{t('clubRegion')}<select aria-label={t('clubRegion')} value={regionId} onChange={event => setRegion(event.target.value)} disabled={!countryId}>
        <option value="">{t('select')}</option>
        {geography.regions.filter(row => row.countryId === countryId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">{t('clubLatitude')}<input type="number" name="lat" min={-90} max={90} step="any" defaultValue={club.lat ?? ''} /></label>
        <label className="field">{t('clubLongitude')}<input type="number" name="lng" min={-180} max={180} step="any" defaultValue={club.lng ?? ''} /></label>
      </div>
      <p className="muted text-xs mb-3">{t('clubCoordinateHint')}</p>
      <label className="field">{t('city')}<input name="city" maxLength={100} defaultValue={club.city ?? ''} /></label>
      <label className="field">{t('clubStadium')}<input name="stadium" maxLength={160} defaultValue={club.stadium ?? ''} /></label>
      <label className="field">{t('relationStatus')}<select aria-label={t('relationStatus')} name="relationStatus" defaultValue={club.relationStatus ?? 'NEW'}>
        {['NEW', 'WARM', 'ACTIVE', 'COLD'].map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></label>
      <label className="flex gap-2 items-center"><input type="checkbox" name="isTracked" defaultChecked={club.isTracked} />{t('tracked')}</label>
      {mutation.isError && (mutation.error instanceof ApiError && mutation.error.status === 409
        ? <ErrorMessage /> : <p className="error" role="alert">{t('clubInvalidLocation')}</p>)}
      <div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}

function ClubSectionPanel({ club, section }: { club: ClubRecord; section: ClubSection }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<keyof typeof playerScopes>('squad');
  const [addingNote, setAddingNote] = useState(false);
  const queryKey = ['club-section', club.id, section];
  const query = useQuery({ queryKey: [...queryKey, page, scope], queryFn: () => api<{ items: ClubSectionRow[]; more: boolean }>(`/api/clubs/${club.id}/sections/${section}?page=${page}&players=${scope}`) });
  const note = useMutation({
    mutationFn: (text: string) => api(`/api/clubs/${club.id}/notes`, { method: 'POST', body: body({ text }) }),
    onSuccess: () => { setPage(1); void client.invalidateQueries({ queryKey }); void client.invalidateQueries({ queryKey: ['timeline', 'Club', club.id] }); setAddingNote(false); },
  });
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  return <section className="panel panel-body mt-5">
    <h2>{t(sections[section])}</h2>
    {section === 'players' && <label className="field max-w-sm mt-4">{t('players')}
      <select aria-label={t('players')} value={scope} onChange={event => { setScope(event.target.value as typeof scope); setPage(1); }}>
        {(Object.keys(playerScopes) as (keyof typeof playerScopes)[]).map(key => <option key={key} value={key}>{t(playerScopes[key])}</option>)}
      </select></label>}
    {section === 'notes' && <><button className="secondary mt-3" onClick={() => { note.reset(); setAddingNote(true); }}>{t('clubAddNote')}</button>
      {club.notes && <p className="notice mt-3 whitespace-pre-wrap break-words">{club.notes}</p>}</>}
    {query.isError && <ErrorMessage />}
    {query.isPending && <p role="status">{t('loading')}</p>}
    {query.data && (!query.data.items.length ? <Empty /> : <ul className="divide-y mt-3">{query.data.items.map(row => <li key={row.id} className="py-3 break-words">
      {row.href ? row.external
        ? <a className="text-accent" href={row.href} target="_blank" rel="noopener noreferrer">{row.name}</a>
        : <Link className="text-accent" to={row.href}>{row.name}</Link> : <span className="whitespace-pre-wrap">{i18n.language === 'tr' ? row.name : row.nameEn ?? row.name}</span>}
      {row.label && <span className="ml-2"><Badge value={row.label} /></span>}
      {(row.date || row.details || section === 'staff') && <p className="muted text-xs mt-1">
        {row.date ? date(row.date) : null}{section === 'staff' ? ` · ${row.endDate ? date(row.endDate) : t('clubTenureOngoing')}` : null}{row.details ? ` · ${row.details}` : null}
      </p>}
    </li>)}</ul>)}
    {(page > 1 || query.data?.more) && <div className="pagination">
      <button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button>
      <button className="secondary" disabled={!query.data?.more} onClick={() => setPage(value => value + 1)}>{t('next')}</button>
    </div>}
    {addingNote && <Modal title={t('clubAddNote')} onClose={() => setAddingNote(false)}><form onSubmit={event => {
      event.preventDefault(); note.mutate(String(new FormData(event.currentTarget).get('text') ?? ''));
    }}>
      <label className="field">{t('clubNotes')}<textarea name="text" required maxLength={4000} /></label>
      {note.isError && <ErrorMessage />}
      <div className="form-footer"><button className="primary" disabled={note.isPending}>{t('save')}</button></div>
    </form></Modal>}
  </section>;
}
