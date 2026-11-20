import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, ArrowDown, ArrowUp, ArrowUpRight, GripVertical } from 'lucide-react';
import { api, body } from './api';
import { Badge, Empty, ErrorMessage, Modal } from './components';
import { PresentationResult } from './presentations';
import { moveDashboardWidget, resolveDashboardLayout, type DashboardLayout, type DashboardWidgetId } from '../shared/dashboard';
import type { AgendaDeadlines } from '../shared/agenda-overlays';
import type { Overview, Timeline } from './types';

type LayoutSettings = { version: number; dashboardLayout: unknown };
const activityLink = (row: Timeline) => row.entityType === 'Meeting' ? `/agenda?meeting=${row.entityId}` : row.entityType === 'Task' ? `/tasks?task=${row.entityId}` : row.entityType === 'Contract' ? `/contracts/${row.entityId}` : row.entityType === 'Notification' ? '/notifications' : ['Club', 'Player', 'Person', 'Request'].includes(row.entityType) ? `/record/${row.entityType}/${row.entityId}` : '/settings';

export function Dashboard({ onCreate }: { onCreate: () => void }) {
  const { t, i18n } = useTranslation();
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/overview'), refetchInterval: 60000 });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<LayoutSettings>('/api/settings') });
  const resolved = resolveDashboardLayout(settings.data ? settings.data.dashboardLayout : []);
  const [editor, setEditor] = useState<LayoutSettings>(); const [announcement, setAnnouncement] = useState('');
  const d = overview.data;
  const deadlines = useQuery({ queryKey: ['dashboard-deadlines', d?.today, d?.weekTo], enabled: !!d && resolved.layout.some(row => row.id === 'deadlines' && row.visible), queryFn: () => api<AgendaDeadlines>(`/api/agenda/deadlines?${new URLSearchParams({ from: d!.today, to: d!.weekTo })}`), refetchInterval: 60000 });
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  function list(rows: ReactNode[], to: string, limit: number) {
    return <>{rows.length ? rows : <Empty />}<div className="mt-3"><Link className="text-accent" to={to}>{t('allRecords')}</Link></div>{rows.length >= limit && <p className="muted text-sm mt-2">{t('dashboardListLimit', { count: limit })}</p>}</>;
  }
  function tasks(rows: Overview['tasks']) {
    return list(rows.map(row => <Link className="list-line" key={row.id} to={`/tasks?task=${row.id}`}><span className="flex-1">{row.name}<small className="muted block">{date(row.dueDate)}</small></span><Badge value={row.priority} /></Link>), '/tasks', 5);
  }
  function meetings(rows: Overview['meetings']) {
    return list(rows.map(row => <Link className="list-line" key={row.id} to={`/agenda?meeting=${row.id}`}><span>{row.name}<small className="muted block">{date(row.date)} · {row.time}</small></span></Link>), '/agenda', 6);
  }
  function widget(id: DashboardWidgetId) {
    if (!d) return <p role="status">{t('loading')}</p>;
    if (id === 'summary') return <div className="metric-grid">{[{ key: 'dashboardClubCount', value: d.clubs, to: '/clubs' }, { key: 'playerCount', value: d.players, to: '/players' }, { key: 'openRequests', value: d.requests, to: '/requests' }, { key: 'pendingProposals', value: d.proposals, to: '/proposals' }].map(row => <Link key={row.key} to={row.to} className="rounded border border-[var(--border)] p-4"><span>{t(row.key)}</span><strong className="block text-3xl my-3">{row.value}</strong><ArrowUpRight size={14} /></Link>)}</div>;
    if (id === 'todayTasks') return tasks(d.todayTasks);
    if (id === 'tasks') return tasks(d.tasks);
    if (id === 'todayMeetings') return meetings(d.todayMeetings);
    if (id === 'weekMeetings') return <><p className="muted text-sm">{date(d.weekFrom)} – {date(d.weekTo)}</p>{meetings(d.weekMeetings)}</>;
    if (id === 'deadlines') return <>{deadlines.isError && <ErrorMessage />}{deadlines.isPending && <p role="status">{t('loading')}</p>}{deadlines.data && <>{list(deadlines.data.items.slice(0, 6).map(row => <Link className="list-line" key={`${row.contractId}:${row.kind}:${row.date}`} to={`/contracts/${row.contractId}`}><span>{row.name}<small className="muted block">{t(`contractRule_${row.kind}`)} · {date(row.date)}</small></span></Link>), '/agenda', 6)}{!!deadlines.data.warningTotal && <Link className="notice block mt-3" to="/agenda">{t('dashboardDateWarning')}</Link>}</>}</>;
    if (id === 'proposals') return list(d.pendingUpdates.map(row => <Link className="list-line" key={row.id} to={`/proposals?proposal=${row.id}`}>{row.type === 'injury' ? t('clubUpdate_injury') : row.name}</Link>), '/proposals', 5);
    if (id === 'followUps') return list(d.followUps.map(row => <Link className="list-line" key={row.id} to={`/presentations?presentation=${row.id}`}><span className="flex-1">{row.name}<small className="muted block">{date(row.followUpDate)}</small></span><PresentationResult value={row.result} /></Link>), '/presentations?overdue=true', 5);
    return list(d.recent.map(row => <Link className="list-line" key={row.id} to={activityLink(row)}><span>{i18n.language === 'tr' ? row.summaryTr : row.summaryEn}<small className="muted block">{date(row.createdAt)}</small></span></Link>), '/tasks', 6);
  }
  return <>
    <div className="flex justify-between gap-4 flex-wrap items-center"><div><div className="eyebrow">{t('today')} · {date(d?.today ?? new Date().toISOString())}</div><h1>{t('overview')}</h1><p className="subtitle">{t('overviewSub')}</p></div><div className="flex gap-3 flex-wrap"><button className="secondary" disabled={!settings.data} onClick={() => { setAnnouncement(''); setEditor({ version: settings.data!.version, dashboardLayout: settings.data!.dashboardLayout }); }}>{t('dashboardCustomize')}</button><button className="primary" onClick={onCreate}><Plus size={16} />{t('new')}</button></div></div>
    <p role="status" className="muted my-3">{announcement}</p>
    {(overview.isError || settings.isError) && <ErrorMessage />}{resolved.invalid && <p className="notice">{t('dashboardInvalidLayout')}</p>}
    <Link className="text-accent block my-4" to="/birthdays">{t('dashboardProtectedBirthdays')}</Link>
    {!resolved.layout.some(row => row.visible) && <p className="notice">{t('dashboardAllHidden')}</p>}
    <div className="grid gap-5 mt-5 lg:grid-cols-2">{resolved.layout.filter(row => row.visible).map(row => <section className={`panel panel-body min-w-0 ${row.id === 'summary' ? 'lg:col-span-2' : ''}`} aria-label={t(`dashboard_${row.id}`)} data-widget={row.id} key={row.id}><h2 className="mb-3">{t(`dashboard_${row.id}`)}</h2>{widget(row.id)}</section>)}</div>
    {editor && <LayoutEditor initial={editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); setAnnouncement(t('dashboardSaved')); }} />}
  </>;
}

function LayoutEditor({ initial, onClose, onSaved }: { initial: LayoutSettings; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(); const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState<DashboardLayout>(() => resolveDashboardLayout(initial.dashboardLayout).layout);
  const [version, setVersion] = useState(initial.version); const [announcement, setAnnouncement] = useState('');
  const save = useMutation({ mutationFn: () => api('/api/settings', { method: 'PATCH', body: body({ version, dashboardLayout: draft }) }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['settings'] }); if (mounted.current) onSaved(); } });
  const reload = useMutation({ mutationFn: () => api<LayoutSettings>('/api/settings'), onSuccess: value => { setDraft(resolveDashboardLayout(value.dashboardLayout).layout); setVersion(value.version); save.reset(); setAnnouncement(''); } });
  function move(id: DashboardWidgetId, to: number) { setDraft(value => moveDashboardWidget(value, id, to)); setAnnouncement(t('dashboardMoved', { name: t(`dashboard_${id}`), position: to + 1 })); }
  const busy = save.isPending || reload.isPending;
  return <Modal title={t('dashboardCustomize')} onClose={onClose}><p className="notice mb-4">{t('dashboardLayoutHelp')}</p><p className="muted" role="status">{announcement}</p>
    <ol>{draft.map((row, index) => <li key={row.id} className="flex gap-3 flex-wrap items-center border-b border-[var(--border)] py-3" draggable={!busy} onDragStart={event => { event.dataTransfer.setData('text/plain', row.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => { if (!busy) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (busy) return; const id = event.dataTransfer.getData('text/plain'); if (draft.some(value => value.id === id)) move(id as DashboardWidgetId, index); }}>
      <GripVertical size={16} aria-hidden="true" /><label className="flex items-center gap-3 flex-1"><input type="checkbox" disabled={busy} checked={row.visible} aria-label={t('dashboardVisible', { name: t(`dashboard_${row.id}`) })} onChange={event => setDraft(value => value.map(item => item.id === row.id ? { ...item, visible: event.target.checked } : item))} />{t(`dashboard_${row.id}`)}</label>
      <div className="flex gap-2"><button className="secondary" disabled={busy || index === 0} aria-label={t('dashboardUp', { name: t(`dashboard_${row.id}`) })} onClick={() => move(row.id, index - 1)}><ArrowUp size={15} /></button><button className="secondary" disabled={busy || index === draft.length - 1} aria-label={t('dashboardDown', { name: t(`dashboard_${row.id}`) })} onClick={() => move(row.id, index + 1)}><ArrowDown size={15} /></button></div>
    </li>)}</ol>
    {save.isError && <><p role="alert" className="error">{(save.error as Error & { code?: string }).code === 'STALE_VERSION' ? t('dashboardConflict') : t('error')}</p><button className="secondary mt-3" disabled={busy} onClick={() => reload.mutate()}>{t('dashboardReload')}</button></>}{reload.isError && <ErrorMessage />}
    <div className="form-footer"><button className="secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy} onClick={() => save.mutate()}>{t('save')}</button></div>
  </Modal>;
}
