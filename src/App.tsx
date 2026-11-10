import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Link, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Building2, Users, UserRound, ArrowLeftRight, ShieldCheck, Trash2, Settings, Search, Sun, Moon, Bell, Plus, ArrowUpRight, CalendarDays, CheckCircle2, Menu, LogOut, ChevronRight, Globe2, Eye, Download, Link2, ExternalLink } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, body, loadSession } from './api';
import languageInstance from './i18n';
import { Modal, Empty, ErrorMessage, Badge } from './components';
import { AdminControls, FieldEvidence, ImpactList, type Impact } from './admin';
import { IncidentChecklist, PrivacyNotice } from './privacy';
import { RetentionControls, SensitiveAccessLog } from './retention';
import { AttachmentPanel, FileMaintenance } from './files';
import { ProfileExport } from './profile-export';
import { ClubExplorer, clubSearchParams } from './club-explorer';
import { ClubWorkspace } from './club-workspace';
import { Proposals } from './proposals';
import { ClubSourceRegistry } from './club-sources';
import { PlayerDatabase } from './player-list';
import { PlayerScoringPanel, ScoringWeightsPanel } from './player-scoring';
import { PlayerMarketPanel } from './player-market';
import { PlayerPhotoPanel } from './player-photo';
import { LeagueTiersPanel, PlayerFit } from './player-suitability';
import { PlayerBiography } from './player-biography';
import { PlayerCardPanel } from './player-card';
import { hasCoordinates, type ClubFilters } from '../shared/club-network';
import type { PrivacyState } from '../shared/privacy';
import type { ClubRecord, List, RecordRow, RecordType, Overview, Timeline } from './types';
import { clubInput, playerInput, personInput, requestInput, positions, statuses, relationTypes, relationInput, suggestionInput } from '../shared/domain';

const pages = [
  { path: '/', key: 'dashboard', icon: LayoutDashboard }, { path: '/clubs', key: 'clubs', icon: Building2 },
  { path: '/players', key: 'players', icon: Users }, { path: '/people', key: 'people', icon: UserRound },
  { path: '/requests', key: 'requests', icon: ArrowLeftRight }, { path: '/proposals', key: 'proposals', icon: ShieldCheck },
  { path: '/sources', key: 'sourceRegistry', icon: Link2 },
];
const endpoints = { Club: 'clubs', Player: 'players', Person: 'people', Request: 'requests' };
function useDate() { const { i18n } = useTranslation(); return (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value)); }
function useRecords(type: RecordType) { return useQuery({ queryKey: [endpoints[type]], queryFn: () => api<List>(`/api/${endpoints[type]}`) }); }
function useRefresh() { const client = useQueryClient(); return () => { void client.invalidateQueries(); }; }

export function App() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: loadSession });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<{ language: string; theme: string; version: number }>('/api/settings'), enabled: !!session.data });
  const privacy = useQuery({ queryKey: ['privacy'], queryFn: () => api<PrivacyState>('/api/privacy'), enabled: !!session.data });
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [create, setCreate] = useState<RecordType>();
  useEffect(() => { document.title = t('brand') + ' ' + t('crm'); document.documentElement.lang = i18n.language; }, [t, i18n.language]);
  useEffect(() => { if (settings.data?.language) void languageInstance.changeLanguage(settings.data.language); }, [settings.data?.language]);
  useEffect(() => { if (settings.data?.theme) document.documentElement.classList.toggle('dark', settings.data.theme === 'dark'); }, [settings.data?.theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable=true]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'k' || event.key === '/') { event.preventDefault(); setSearch(true); }
    };
    const focus = () => { void client.invalidateQueries({ queryKey: ['session'] }); };
    window.addEventListener('keydown', handler); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('focus', focus); };
  }, [client]);
  async function preference(data: Record<string, string>) {
    await api('/api/settings', { method: 'PATCH', body: body({ ...data, version: settings.data?.version }) }); await client.invalidateQueries({ queryKey: ['settings'] });
  }
  if (session.isPending) return <div className="login-wrap" role="status">{t('loading')}</div>;
  if (!session.data) return <Login onLogin={() => { void client.invalidateQueries({ queryKey: ['session'] }); }} />;
  if (privacy.isPending || settings.isPending) return <main className="login-wrap" role="status">{t('loading')}</main>;
  if (privacy.isError) return <main className="login-wrap"><ErrorMessage /><button className="secondary" onClick={() => { void privacy.refetch(); }}>{t('privacyRetry')}</button></main>;
  if (privacy.data.acknowledgementRequired) return <main className="p-6"><PrivacyNotice state={privacy.data} required /></main>;
  return <>
    {menu && <button className="mobile-scrim" aria-label={t('close')} onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'open' : ''}`}>
      <Link to="/" className="brand"><Globe2 size={27} className="text-accent" />{t('brand')}<span>{t('crm')}</span></Link>
      <div className="nav-label">{t('workspace')}</div>
      <nav aria-label={t('workspace')}>{pages.map(p => <NavLink key={p.path} to={p.path} end={p.path === '/'} className="nav-item" onClick={() => setMenu(false)}><p.icon size={18} />{t(p.key)}</NavLink>)}</nav>
      <div className="mt-8"><NavLink to="/trash" className="nav-item"><Trash2 size={18} />{t('trash')}</NavLink><NavLink to="/settings" className="nav-item"><Settings size={18} />{t('settings')}</NavLink><NavLink to="/privacy" className="nav-item"><ShieldCheck size={18} />{t('privacyTitle')}</NavLink><NavLink to="/incident" className="nav-item"><ShieldCheck size={18} />{t('breachTitle')}</NavLink></div>
      <div className="sidebar-footer"><div className="flex items-center gap-3"><div className="avatar"><UserRound size={18} /></div><div><div className="text-xs font-medium">{t('owner')}</div><div className="muted text-[10px] mt-1">{t('private')}</div></div><button className="ml-auto icon-button" aria-label={t('logout')} onClick={() => { void api('/api/logout', { method: 'POST' }).then(() => client.clear()); window.setTimeout(() => location.reload(), 300); }}><LogOut size={15} /></button></div></div>
    </aside>
    <div className="main"><header className="topbar">
      <div className="flex gap-3 items-center"><button className="icon-button mobile-menu" aria-label={t('menu')} onClick={() => setMenu(true)}><Menu size={18} /></button><button className="search-box" onClick={() => setSearch(true)}><Search size={17} /><span>{t('search')}</span><span className="shortcut">{t('searchLabel')}</span></button></div>
      <div className="flex items-center gap-3"><button className="secondary" title={t('language')} onClick={() => { void preference({ language: i18n.language === 'tr' ? 'en' : 'tr' }); }}>{t(i18n.language === 'tr' ? 'en' : 'tr')}</button><button className="icon-button" aria-label={t(settings.data?.theme === 'dark' ? 'light' : 'dark')} onClick={() => { void preference({ theme: settings.data?.theme === 'dark' ? 'light' : 'dark' }); }}>{settings.data?.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button><Link to="/proposals" className="icon-button" aria-label={t('notification')}><Bell size={16} /></Link></div>
    </header><main className="content"><Routes>
      <Route path="/" element={<Dashboard onCreate={() => setCreate('Club')} />} />
      <Route path="/clubs" element={<Records type="Club" onCreate={() => setCreate('Club')} />} />
      <Route path="/players" element={<PlayerDatabase onCreate={() => setCreate('Player')} />} />
      <Route path="/people" element={<Records type="Person" onCreate={() => setCreate('Person')} />} />
      <Route path="/requests" element={<Records type="Request" onCreate={() => setCreate('Request')} />} />
      <Route path="/record/:type/:id" element={<Detail />} />
      <Route path="/trash" element={<Trash />} /><Route path="/proposals" element={<Proposals />} />
      <Route path="/sources" element={<ClubSourceRegistry />} />
      <Route path="/settings" element={<Preferences />} />
      <Route path="/privacy" element={<PrivacyNotice state={privacy.data} />} /><Route path="/incident" element={<IncidentChecklist />} />
    </Routes><p className="footer-note">{t('foundation')} · {t('foundationNote')}</p></main></div>
    {create && <CreateRecord type={create} onClose={() => setCreate(undefined)} />}
    {search && <GlobalSearch onClose={() => setSearch(false)} />}
  </>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation(); const [error, setError] = useState(false);
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api<{ configured: boolean; testMode: boolean }>('/auth/status') });
  const embedded = window.self !== window.top;
  return <div className="login-wrap"><div className="panel login-card"><div className="brand"><Globe2 className="text-accent" />{t('brand')}<span>{t('crm')}</span></div><h1>{t('welcome')}</h1><p className="subtitle mt-3 mb-7">{t('loginIntro')}</p>
    {embedded ? <><p className="notice mb-5">{t('iframeHint')}</p><a href="/auth/google" target="_blank" rel="noopener noreferrer" className="primary w-full"><ExternalLink size={16} />{t('openNew')}</a><button className="secondary w-full mt-3" onClick={onLogin}>{t('checkSession')}</button></> : <a href="/auth/google" className="primary w-full" aria-disabled={!status.data?.configured}>{t('login')}</a>}
    {status.data && !status.data.configured && <p className="notice mt-4">{t('authMissing')}</p>}
    {status.data?.testMode && <button className="secondary mt-4 w-full" onClick={() => { void api('/auth/test', { method: 'POST', body: body({ email: 'owner@example.com' }) }).then(onLogin).catch(() => setError(true)); }}>{t('testLogin')}</button>}
    {error && <ErrorMessage />}<div className="flex items-center gap-2 muted text-[10px] mt-8"><ShieldCheck size={14} />{t('private')}</div>
  </div></div>;
}

function Dashboard({ onCreate }: { onCreate: () => void }) {
  const { t, i18n } = useTranslation(); const date = useDate();
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/overview') });
  const d = q.data;
  return <><div className="flex justify-between gap-4 items-center"><div><div className="eyebrow">{t('today')} · {date(new Date().toISOString())}</div><h1>{t('overview')}</h1><p className="subtitle">{t('overviewSub')}</p></div><button className="primary" onClick={onCreate}><Plus size={16} />{t('new')}</button></div>
    {q.isError && <ErrorMessage />}
    <div className="metric-grid">{[{ key: 'activeClubs', value: d?.clubs, icon: Building2, to: '/clubs' }, { key: 'playerCount', value: d?.players, icon: Users, to: '/players' }, { key: 'openRequests', value: d?.requests, icon: ArrowLeftRight, to: '/requests' }, { key: 'pendingProposals', value: d?.proposals, icon: ShieldCheck, to: '/proposals' }].map(m => <Link key={m.key} to={m.to} className="panel metric"><div className="metric-top"><span>{t(m.key)}</span><m.icon size={18} /></div><div className="metric-value">{m.value ?? '—'}</div><div className="metric-footer">{t('allRecords')}<ArrowUpRight size={12} /></div></Link>)}</div>
    {!!d?.pendingUpdates?.length && <section className="panel panel-body mb-6">
      <h2>{t('proposals')}</h2>
      {d.pendingUpdates.map(row => <Link key={row.id} className="list-line" to={`/proposals?proposal=${row.id}`}>
        <span>{row.type === 'injury' ? t('clubUpdate_injury') : row.name}</span><ChevronRight size={14} className="ml-auto muted" />
      </Link>)}
    </section>}
    <div className="dashboard-columns"><div className="space-y-6"><section className="panel"><div className="panel-header"><h2>{t('agenda')}</h2><CalendarDays size={16} className="muted" /></div><div className="panel-body">{!d?.meetings.length ? <Empty /> : d.meetings.map(m => <div className="meeting" key={m.id}><div className="date-box">{new Date(m.date).getUTCDate()}<small>{new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(m.date))}</small></div><div><div className="text-[13px] font-medium mb-2">{m.name}</div><div className="muted text-[11px]">{m.time} · {m.locationOrUrl}</div></div><ChevronRight size={15} className="muted ml-auto" /></div>)}</div></section><section className="panel"><div className="panel-header"><h2>{t('activity')}</h2><ArrowLeftRight size={16} className="muted" /></div><div className="panel-body">{!d?.recent.length ? <Empty /> : d.recent.map(e => <Link to={['Club', 'Player', 'Person', 'Request'].includes(e.entityType) ? `/record/${e.entityType}/${e.entityId}` : '/settings'} key={e.id} className="list-line"><span className="activity-dot" /><div className="flex-1"><div>{i18n.language === 'tr' ? e.summaryTr : e.summaryEn}</div><div className="muted text-[10px] mt-2">{date(e.createdAt)}</div></div><ArrowUpRight size={14} className="muted" /></Link>)}</div></section></div>
    <div><section className="panel"><div className="panel-header"><h2>{t('tasks')}</h2><CheckCircle2 size={16} className="muted" /></div><div className="panel-body">{!d?.tasks.length ? <Empty /> : d.tasks.map(task => <div className="list-line" key={task.id}><span className="icon-button"><CheckCircle2 size={14} /></span><div className="flex-1"><div className="mb-2">{task.name}</div><span className="muted text-[10px]">{date(task.dueDate)}</span></div><Badge value={task.priority} /></div>)}</div></section><div className="notice mt-6 flex gap-3"><ShieldCheck size={28} className="text-accent shrink-0" /><div><strong className="block mb-1">{t('private')}</strong>{t('consent')}</div></div></div></div>
  </>;
}

function Records({ type, onCreate }: { type: RecordType; onCreate: () => void }) {
  const { t } = useTranslation(); const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [filters, setFilters] = useState<ClubFilters>({});
  const params = clubSearchParams(type === 'Club' ? filters : {});
  params.set('page', String(page));
  params.set('q', q);
  if (status && type === 'Player') params.set('status', status);
  const data = useQuery({ queryKey: [endpoints[type], params.toString()], queryFn: () => api<List>(`/api/${endpoints[type]}?${params}`) });
  useEffect(() => { setPage(1); setQ(''); setStatus(''); setFilters({}); }, [type]);
  return <><div className="flex justify-between items-center"><div><div className="eyebrow">{t('workspace')}</div><h1>{t(endpoints[type])}</h1></div><div className="flex gap-2"><a className="secondary hide-mobile" href={`/api/export/${type}`}><Download size={15} />{t('export')}</a><button className="primary" onClick={onCreate}><Plus size={15} />{t('new')}</button></div></div>
    {type === 'Club' && <ClubExplorer filters={filters} q={q} onChange={value => { setFilters(value); setPage(1); }} />}
    <div className="tabs">{type === 'Player' && ['', ...statuses].map(s => <button key={s} className={status === s ? 'selected' : ''} onClick={() => { setStatus(s); setPage(1); }}>{t(s || 'all')}</button>)}</div>
    <label className="field max-w-sm my-5"><span className="sr-only">{t('searchLabel')}</span><input value={q} placeholder={t('search')} onChange={e => { setQ(e.target.value); setPage(1); }} /></label>
    {data.isError && <ErrorMessage />}{data.isPending ? <p role="status">{t('loading')}</p> : <div className="panel">{!data.data?.items.length ? <Empty /> : <div className="table-wrap"><table><thead><tr><th>{t('name')}</th><th>{t(type === 'Player' ? 'position' : type === 'Person' ? 'role' : 'city')}</th><th>{t('status')}</th><th>{t('source')}</th></tr></thead><tbody>{data.data.items.map(row => <tr key={row.id}><td><Link to={`/record/${type}/${row.id}`} className="row-name"><span className="avatar">{type === 'Club' ? <Building2 size={17} /> : <UserRound size={17} />}</span><span>{row.name}{row.isExample && <span className="block text-[9px] muted mt-1">{t('example')}</span>}</span></Link></td><td>{type === 'Club' ? <>{row.city || '—'}{!hasCoordinates(row as ClubRecord) && <span className="block text-xs muted mt-1">{t('clubLocationMissing')}</span>}</> : row.primaryPosition ? t(row.primaryPosition) : row.role ? t(row.role) : row.city || row.club?.name || t('noLocation')}</td><td><Badge value={row.status || row.relationStatus || 'NEW'} /></td><td><span className="muted text-[11px]">{t('unverified')}</span></td></tr>)}</tbody></table></div>}<div className="pagination"><span>{t('page', { page, total: data.data?.total ?? 0 })}</span><div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= (data.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>{t('next')}</button></div></div></div>}
  </>;
}

function CreateRecord({ type, onClose }: { type: RecordType; onClose: () => void }) {
  const { t } = useTranslation(); const navigate = useNavigate(); const refresh = useRefresh();
  const clubs = useRecords('Club'); const people = useRecords('Person');
  const schema = type === 'Club' ? clubInput : type === 'Player' ? playerInput : type === 'Person' ? personInput : requestInput;
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });
  const mutation = useMutation({ mutationFn: (value: unknown) => api<RecordRow>(`/api/${endpoints[type]}`, { method: 'POST', body: body(value) }), onSuccess: row => { refresh(); onClose(); navigate(`/record/${type}/${row.id}`); } });
  return <Modal title={`${t('new')} · ${t(type)}`} onClose={onClose}><form onSubmit={handleSubmit(value => mutation.mutate(value))}>
    <label className="field">{t('name')}<input {...register('name')} autoFocus /></label>
    {type === 'Club' && <><label className="field">{t('city')}<input {...register('city')} /></label><label className="field">{t('relationStatus')}<select aria-label={t('relationStatus')} {...register('relationStatus')}>{['NEW', 'WARM', 'ACTIVE', 'COLD'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label><label className="field">{t('tracked')}<input type="checkbox" {...register('isTracked')} /></label></>}
    {type === 'Player' && <><label className="field">{t('position')}<select aria-label={t('position')} {...register('primaryPosition')}>{positions.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label><label className="field">{t('status')}<select aria-label={t('status')} {...register('status')}>{statuses.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label><label className="field">{t('club')}<select aria-label={t('club')} {...register('currentClubId', { setValueAs: (v: string) => v || undefined })}><option value="">{t('select')}</option>{clubs.data?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">{t('birthDate')}<input type="date" {...register('birthDate', { setValueAs: (v: string) => v || undefined })} /></label></>}
    {type === 'Person' && <label className="field">{t('role')}<select aria-label={t('role')} {...register('role')}>{['OTHER', 'OFFICIAL', 'HEAD_COACH', 'ASSISTANT', 'GOALKEEPER_COACH', 'YOUTH_COORDINATOR', 'SCOUT'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>}
    {type === 'Request' && <><label className="field">{t('club')}<select aria-label={t('club')} {...register('clubId')}><option value="">{t('select')}</option>{clubs.data?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">{t('person')}<select aria-label={t('person')} {...register('requesterId')}><option value="">{t('select')}</option>{people.data?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">{t('position')}<select aria-label={t('position')} {...register('position')}>{positions.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></label></>}
    {!!Object.keys(errors).length && <p role="alert" className="error">{t('invalid')}</p>}{mutation.isError && <ErrorMessage />}<div className="form-footer"><button className="secondary" type="button" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={mutation.isPending}>{t('create')}</button></div>
  </form></Modal>;
}

type RelationRow = { id: string; direction: string; relation: string; targetType: RecordType; targetId: string; label: string; available: boolean };
function Detail() {
  const { type: raw, id } = useParams(); const type = raw as RecordType; const { t, i18n } = useTranslation(); const date = useDate(); const refresh = useRefresh(); const navigate = useNavigate();
  const [modal, setModal] = useState<'relation' | 'delete' | 'suggest'>();
  const record = useQuery({ queryKey: ['record', type, id], queryFn: () => api<RecordRow>(`/api/records/${type}/${id}`) });
  const links = useQuery({ queryKey: ['links', type, id], queryFn: () => api<RelationRow[]>(`/api/records/${type}/${id}/links`) });
  const timeline = useQuery({ queryKey: ['timeline', type, id], queryFn: () => api<Timeline[]>(`/api/records/${type}/${id}/timeline`) });
  const impact = useQuery({ queryKey: ['delete-preview', type, id], queryFn: () => api<Impact>(`/api/records/${type}/${id}/delete-preview`), enabled: modal === 'delete' });
  const deletion = useMutation({ mutationFn: () => api(`/api/records/${type}/${id}`, { method: 'DELETE', body: body({ version: record.data?.version }) }), onSuccess: () => { refresh(); navigate(`/${endpoints[type]}`); } });
  if (record.isError) return <ErrorMessage />; if (!record.data) return <p role="status">{t('loading')}</p>; const row = record.data;
  const timelinePanel = <section className="panel"><div className="panel-header"><h2>{t('timeline')}</h2><ArrowLeftRight size={15} /></div><div className="panel-body">{!timeline.data?.length ? <Empty /> : timeline.data.map(e => <div key={e.id} className="list-line"><span className="activity-dot" /><div><div>{i18n.language === 'tr' ? e.summaryTr : e.summaryEn}</div><p className="muted text-[10px] mt-2">{date(e.createdAt)}</p></div></div>)}</div></section>;
  const overview = <>
    {type === 'Player' && <PlayerCardPanel key={row.id} id={row.id} version={row.version} />}
    <div className="detail-grid"><div className="space-y-5"><section className="panel"><div className="panel-header"><h2>{t('overview')}</h2><Badge value="unverified" /></div><div className="panel-body">{(type === 'Player' ? ['primaryPosition', 'status'] : type === 'Person' ? ['role'] : ['city']).map(key => <div className="detail-field" key={key}><span className="muted">{t(key === 'primaryPosition' ? 'position' : key)}</span><span>{t(String(row[key as keyof RecordRow] || 'empty'))}</span></div>)}{(type === 'Player' || type === 'Person') && <Sensitive type={type} id={row.id} field="birthDate" />}<div className="detail-field"><span className="muted">{t('version')}</span><span>{row.version}</span></div><p className="muted text-[10px] mt-5">{t('noSensitiveExports')}</p></div></section><section className="panel"><div className="panel-header"><h2>{t('relations')}</h2><Link2 size={15} /></div><div className="panel-body">{['outgoing', 'incoming'].map(direction => <div key={direction}><h3 className="muted text-xs my-4">{t(direction)}</h3>{!links.data?.filter(l => l.direction === direction).length ? <p className="muted text-xs">{t('empty')}</p> : links.data.filter(l => l.direction === direction).map(l => <div key={l.id} className="list-line"><span className="muted">{t(l.relation)}</span>{l.available ? <Link className="ml-auto text-accent" to={`/record/${l.targetType}/${l.targetId}`}>{l.label}</Link> : <span className="ml-auto muted">{t('trash')}</span>}</div>)}</div>)}</div></section></div>{timelinePanel}</div>
    <FieldEvidence sources={row.fieldProvenance ?? {}} />
    {type === 'Player' && <><PlayerPhotoPanel key={row.id} row={row} /><PlayerScoringPanel id={row.id} />
      <section className="panel panel-body mt-5"><h2 className="mb-3">{t('playerFit')}</h2><PlayerFit key={`${row.id}:${row.version}`} id={row.id} name={row.name} /></section>
      <PlayerMarketPanel key={row.id} id={row.id} /><PlayerBiography key={row.id} id={row.id} version={row.version} html={row.bio ?? ''} /><ProfileExport id={row.id} version={row.version} /></>}
    <AttachmentPanel type={type} id={row.id} />
  </>;
  return <><div className="eyebrow"><Link to={`/${endpoints[type]}`}>{t(endpoints[type])}</Link></div><div className="flex justify-between gap-3 flex-wrap"><div><h1>{row.name}</h1><div className="flex gap-3 mt-3"><Badge value={row.status || row.relationStatus || 'NEW'} />{row.isExample && <span className="badge">{t('example')}</span>}</div></div><div className="flex gap-2 items-start">{type === 'Request' && <button className="primary" onClick={() => setModal('suggest')}><Plus size={15} />{t('suggest')}</button>}<button className="secondary" onClick={() => setModal('relation')}><Link2 size={15} />{t('addRelation')}</button><button className="icon-button" aria-label={t('delete')} onClick={() => setModal('delete')}><Trash2 size={15} /></button></div></div>
    {type === 'Club' ? <ClubWorkspace key={row.id} club={row as ClubRecord} overview={overview} /> : overview}
    {modal === 'delete' && <Modal title={t('delete')} onClose={() => setModal(undefined)}><p className="subtitle">{t('deleteConfirm')}</p>{impact.isPending && <p role="status">{t('previewLoading')}</p>}{impact.isError && <ErrorMessage />}{impact.data && <ImpactList plan={impact.data} />}{deletion.isError && <ErrorMessage />}<div className="form-footer"><button className="secondary" onClick={() => setModal(undefined)}>{t('cancel')}</button><button className="danger" disabled={deletion.isPending || !impact.data} onClick={() => deletion.mutate()}>{t('delete')}</button></div></Modal>}
    {modal === 'relation' && <AddRelation type={type} id={row.id} onClose={() => setModal(undefined)} />}
    {modal === 'suggest' && <Suggest request={row} onClose={() => setModal(undefined)} />}
  </>;
}
function Sensitive({ type, id, field }: { type: RecordType; id: string; field: string }) {
  const { t } = useTranslation(); const date = useDate(); const [value, setValue] = useState<string | null>(); const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setValue(undefined); return () => clearTimeout(timer.current); }, [id]);
  const reveal = useMutation({ mutationFn: () => api<{ value: string | null }>(`/api/records/${type}/${id}/reveal`, { method: 'POST', body: body({ field }) }), onSuccess: row => { setValue(row.value); timer.current = setTimeout(() => setValue(undefined), 60000); } });
  return <div className="detail-field"><span className="muted">{t(field)}</span>{value === undefined ? <button className="text-accent flex gap-2 items-center text-[11px]" onClick={() => reveal.mutate()}><Eye size={13} />{t('reveal')}</button> : <span className="flex gap-3 items-center"><span>{value ? field === 'birthDate' ? date(value) : value : t('empty')}</span><button className="icon-button" onClick={() => setValue(undefined)} aria-label={t('hide')}><Eye size={13} /></button></span>}{reveal.isError && <ErrorMessage />}</div>;
}
function AddRelation({ type, id, onClose }: { type: RecordType; id: string; onClose: () => void }) {
  const { t } = useTranslation(); const [target, setTarget] = useState<RecordType>('Club'); const records = useRecords(target); const refresh = useRefresh();
  const mutation = useMutation({ mutationFn: (data: unknown) => api('/api/relations', { method: 'POST', body: body(data) }), onSuccess: () => { refresh(); onClose(); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const parsed = relationInput.safeParse({ ...data, fromType: type, fromId: id, toType: target }); if (parsed.success) mutation.mutate(parsed.data); }
  return <Modal title={t('addRelation')} onClose={onClose}><form onSubmit={submit}><label className="field">{t('targetType')}<select aria-label={t('targetType')} value={target} onChange={e => setTarget(e.target.value as RecordType)}>{['Club', 'Person', 'Player', 'Request'].map(v => <option key={v} value={v}>{t(v)}</option>)}</select></label><label className="field">{t('target')}<select aria-label={t('target')} required name="toId">{records.data?.items.filter(row => row.id !== id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="field">{t('relation')}<select aria-label={t('relation')} name="relation">{relationTypes.map(v => <option key={v} value={v}>{t(v)}</option>)}</select></label>{mutation.isError && <ErrorMessage />}<div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div></form></Modal>;
}
function Suggest({ request, onClose }: { request: RecordRow; onClose: () => void }) {
  const { t } = useTranslation(); const players = useRecords('Player'); const refresh = useRefresh();
  const mutation = useMutation({ mutationFn: (data: z.infer<typeof suggestionInput>) => api('/api/suggestions', { method: 'POST', body: body(data) }), onSuccess: () => { refresh(); onClose(); } });
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const parsed = suggestionInput.safeParse({ requestId: request.id, personId: request.requesterId, ...form, matchScore: form.matchScore ? Number(form.matchScore) : null }); setInvalid(!parsed.success); if (parsed.success) mutation.mutate(parsed.data); }
  return <Modal title={t('suggest')} onClose={onClose}><form onSubmit={submit}><label className="field">{t('player')}<select aria-label={t('player')} name="playerId" required>{players.data?.items.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="field">{t('why')}<textarea name="whyGoodTransfer" required minLength={3} /></label><label className="field">{t('score')}<input name="matchScore" type="number" min={0} max={100} /></label><p className="notice">{t('missingScore')}</p>{invalid && <p className="error" role="alert">{t('invalid')}</p>}{mutation.isError && <ErrorMessage />}<div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div></form></Modal>;
}
function Trash() {
  const { t } = useTranslation(); const refresh = useRefresh(); const [purge, setPurge] = useState<string>();
  const data = useQuery({ queryKey: ['trash'], queryFn: () => api<{ id: string; label: string; entityType: string; version: number; recordVersion: number }[]>('/api/trash') });
  const preview = useQuery({ queryKey: ['purge-preview', purge], queryFn: () => api<Impact>(`/api/trash/${purge}/preview`), enabled: !!purge });
  const mutation = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => {
    const row = data.data?.find(row => row.id === id);
    return api(`/api/trash/${id}${action === 'restore' ? '/restore' : ''}`, { method: action === 'restore' ? 'POST' : 'DELETE', body: body({ version: row?.version, recordVersion: row?.recordVersion, ...(action === 'purge' ? { previewToken: preview.data?.previewToken } : {}) }) });
  }, onSuccess: () => { refresh(); setPurge(undefined); } });
  return <><h1>{t('trash')}</h1><div className="panel mt-7 panel-body">{!data.data?.length ? <Empty /> : data.data.map(row => <div key={row.id} className="list-line"><span>{row.label}</span><button className="secondary ml-auto" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: row.id, action: 'restore' })}>{t('restore')}</button><button className="danger" onClick={() => setPurge(row.id)}>{t('purge')}</button></div>)}{mutation.isError && <ErrorMessage />}</div>{purge && <Modal title={t('purge')} onClose={() => setPurge(undefined)}><p className="subtitle">{t('purgeConfirm')}</p>{preview.isPending && <p role="status">{t('previewLoading')}</p>}{preview.isError && <ErrorMessage />}{preview.data && <ImpactList plan={preview.data} />}<div className="form-footer"><button className="secondary" onClick={() => { void preview.refetch(); refresh(); }}>{t('refreshPreview')}</button><button className="danger" disabled={!preview.data?.canPurge || mutation.isPending} onClick={() => mutation.mutate({ id: purge, action: 'purge' })}>{t('purge')}</button></div></Modal>}</>;
}
function Preferences() {
  const { t } = useTranslation(); return <><h1>{t('settings')}</h1><div className="panel panel-body mt-7 space-y-6"><h2>{t('security')}</h2><p className="notice">{t('consent')}</p><button className="danger" onClick={() => { void api('/api/logout-all', { method: 'POST' }).then(() => location.reload()); }}>{t('logoutAll')}</button><h2>{t('compliance')}</h2><p className="notice">{t('notReviewed')}</p><p className="subtitle">{t('legal')}</p></div><RetentionControls /><FileMaintenance /><SensitiveAccessLog /><ScoringWeightsPanel /><LeagueTiersPanel /><AdminControls /></>;
}
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(); const [q, setQ] = useState(''); const navigate = useNavigate();
  const search = useQuery({ queryKey: ['global-search', q], enabled: q.length > 1, queryFn: async () => Promise.all((['Club', 'Player', 'Person'] as const).map(async type => ({ type, data: await api<List>(`/api/${endpoints[type]}?q=${encodeURIComponent(q)}`) }))) });
  return <Modal title={t('searchLabel')} onClose={onClose}><label className="field"><span className="sr-only">{t('searchLabel')}</span><input autoFocus placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} /></label>{search.isError && <ErrorMessage />}{search.data?.map(group => <section key={group.type}><h2 className="mt-5 muted">{t(group.type)}</h2>{group.data.items.slice(0, 8).map(row => <button key={row.id} className="list-line w-full text-left" onClick={() => { navigate(`/record/${group.type}/${row.id}`); onClose(); }}>{row.name}<ArrowUpRight size={14} className="ml-auto" /></button>)}</section>)}</Modal>;
}
