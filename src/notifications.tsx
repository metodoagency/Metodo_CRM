import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, api, body } from './api';
import { Empty, ErrorMessage } from './components';
import { notificationViews, type NotificationAction, type NotificationItem, type NotificationList } from '../shared/notifications';

const viewKeys = { unread: 'notificationUnread', snoozed: 'notificationSnoozed', read: 'notificationRead', all: 'all' };
export function Notifications() {
  const { t } = useTranslation(); const [view, setView] = useState<typeof notificationViews[number]>('unread'); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['notifications', view, page], queryFn: () => api<NotificationList>(`/api/notifications?view=${view}&page=${page}`), refetchInterval: 30000 });
  return <>
    <h1>{t('notificationCenter')}</h1><p className="subtitle my-4">{t('notificationIntro')}</p>
    <div className="flex flex-wrap gap-3 my-4"><Link className="secondary" to="/proposals">{t('proposals')}</Link><Link className="secondary" to="/birthdays">{t('birthdayCalendar')}</Link><button className="secondary" onClick={() => { void query.refetch(); }}>{t('notificationRefresh')}</button></div>
    <div className="tabs" role="group" aria-label={t('status')}>{notificationViews.map(value => <button key={value} aria-pressed={view === value} className={view === value ? 'selected' : ''} onClick={() => { setPage(1); setView(value); }}>{t(viewKeys[value])}</button>)}</div>
    {query.isError && <ErrorMessage />}
    {query.isPending ? <p role="status">{t('loading')}</p> : query.data && <section className="panel mt-5" aria-label={t('notificationCenter')}>
      <p className="panel-body" role="status">{t('notificationCount', { count: query.data.unread })}</p>
      {!query.data.items.length ? <Empty /> : <ul className="panel-body space-y-5">{query.data.items.map(row => <NotificationRow key={`${row.id}:${row.version}`} row={row} />)}</ul>}
      <div className="pagination"><span>{t('page', { page, total: query.data.total })}</span><div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button><button className="secondary" disabled={page * query.data.pageSize >= query.data.total} onClick={() => setPage(value => value + 1)}>{t('next')}</button></div></div>
    </section>}
  </>;
}
function NotificationRow({ row }: { row: NotificationItem }) {
  const { t, i18n } = useTranslation(); const client = useQueryClient();
  const mutation = useMutation({ mutationFn: (action: NotificationAction['action']) => api(`/api/notifications/${row.id}`, { method: 'PATCH', body: body({ version: row.version, action }) }),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['notifications'] }), client.invalidateQueries({ queryKey: ['overview'] }), client.invalidateQueries({ queryKey: ['contract-reminders'] })]); } });
  const format = (value: string, time = false) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', ...(time ? { timeStyle: 'short' as const } : {}) }).format(new Date(value));
  return <li className="border-b border-white/10 pb-5">
    <Link className="text-accent" to={`/contracts/${row.entityId}`}>{row.name}</Link><p className="my-2">{t(`contractRule_${row.type.slice('CONTRACT_'.length)}`)} · {format(row.targetDate)}</p>
    <p className="muted text-xs my-2">{t('notificationThreshold', { days: row.thresholdDays })} · {t(row.status === 'READ' ? 'notificationRead' : row.status === 'SNOOZED' ? 'notificationSnoozed' : 'notificationUnread')}</p>
    {row.status === 'SNOOZED' && row.snoozedUntil && <p className="muted text-xs my-2">{t('notificationUntil', { date: format(row.snoozedUntil, true) })}</p>}
    <div className="flex flex-wrap gap-2">{(['read', 'snooze1', 'snooze7'] as const).map(action => <button key={action} className="secondary" disabled={mutation.isPending || action === 'read' && row.status === 'READ'} onClick={() => mutation.mutate(action)}>{t(action === 'read' ? 'notificationMarkRead' : action === 'snooze1' ? 'notificationSnooze1' : 'notificationSnooze7')}</button>)}</div>
    {mutation.isError && (mutation.error instanceof ApiError && [404, 409].includes(mutation.error.status) ? <p role="alert" className="error">{t('notificationConflict')}</p> : <ErrorMessage />)}
  </li>;
}
