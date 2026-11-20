import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { istanbulToday } from '../shared/domain';
import { nextTaskOccurrence, taskDate, taskFields, taskLinkPath, taskLinkTypes, taskPriorities, taskRecurrences, type TaskActionResult, type TaskDetail, type TaskInput, type TaskLink, type TaskRecord } from '../shared/tasks';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';

type TaskList = { items: TaskRecord[]; total: number; pageSize: number };
const blank = (): TaskInput => ({ name: '', priority: 'MEDIUM', dueDate: istanbulToday(), recurrence: 'NONE', linkedEntity: null });
function inputFor(row: TaskRecord): TaskInput { return { name: row.name, priority: row.priority, dueDate: row.dueDate, recurrence: row.recurrence, linkedEntity: row.linkedEntity ? { type: row.linkedEntity.type, id: row.linkedEntity.id } : null }; }
function useDay() {
  const { i18n } = useTranslation();
  return (value: string) => taskDate.safeParse(value).success ? new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value)) : value;
}
function TaskError({ error }: { error: Error | null }) {
  const { t } = useTranslation(); if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  return <p role="alert" className="error">{t(code === 'EXAMPLE_NAME_REQUIRED' ? 'taskExampleName' : code === 'RECURRENCE_LIMIT' ? 'taskRecurrenceLimit' : code === 'TASK_LINK_UNAVAILABLE' ? 'taskLinkUnavailable' : error instanceof ApiError && [404, 409].includes(error.status) ? 'taskConflict' : 'taskInvalid')}</p>;
}
export function Tasks() {
  const { t } = useTranslation(); const day = useDay(); const [params, setParams] = useSearchParams(); const client = useQueryClient();
  const [q, setQ] = useState(''); const [status, setStatus] = useState('OPEN'); const [due, setDue] = useState('all'); const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<TaskRecord | 'new'>(); const [message, setMessage] = useState(false);
  const focus = params.get('task');
  useEffect(() => { setEditor(undefined); setMessage(false); }, [focus]);
  const list = useQuery({ queryKey: ['tasks', q, status, due, page], queryFn: () => api<TaskList>(`/api/tasks?${new URLSearchParams({ q, status, due, page: String(page) })}`) });
  const selected = useQuery({ queryKey: ['task', focus], enabled: !!focus, queryFn: () => api<TaskDetail>(`/api/tasks/${focus}`) });
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['tasks'] }), client.invalidateQueries({ queryKey: ['task'] }), client.invalidateQueries({ queryKey: ['task-timeline'] }), client.invalidateQueries({ queryKey: ['overview'] })]); }
  function saved(row: TaskDetail) { setEditor(undefined); setParams({ task: row.id }); setMessage(true); void refresh(); }
  return <>
    <div className="flex justify-between flex-wrap gap-3"><h1>{t('tasks')}</h1><button className="primary" onClick={() => { setMessage(false); setEditor('new'); }}>{t('taskAdd')}</button></div>
    {message && <p className="notice my-4" role="status">{t('taskSaved')}</p>}
    <div className="grid md:grid-cols-3 gap-3 my-5">
      <label className="field">{t('searchLabel')}<input value={q} maxLength={100} onChange={event => { setPage(1); setQ(event.target.value); }} /></label>
      <label className="field">{t('status')}<select aria-label={t('status')} value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}>{['OPEN', 'DONE', 'all'].map(value => <option key={value} value={value}>{t(value === 'all' ? 'all' : `taskStatus_${value}`)}</option>)}</select></label>
      <label className="field">{t('taskDue')}<select aria-label={t('taskDue')} value={due} onChange={event => { setPage(1); setDue(event.target.value); }}>{['all', 'today', 'overdue', 'upcoming'].map(value => <option key={value} value={value}>{t(`taskDue_${value}`)}</option>)}</select></label>
    </div>
    {list.isError && <ErrorMessage />}
    {list.isPending ? <p role="status">{t('loading')}</p> : list.data && <section className="panel" aria-label={t('tasks')}>
      {!list.data.items.length ? <Empty /> : <div className="table-wrap"><table><thead><tr><th>{t('taskName')}</th><th>{t('taskDue')}</th><th>{t('taskPriority')}</th><th>{t('status')}</th><th>{t('taskRecurrence')}</th></tr></thead><tbody>{list.data.items.map(row => <tr key={row.id}><td><Link className="text-accent" to={`/tasks?task=${row.id}`}>{row.name}</Link>{row.isExample && <small className="muted block">{t('example')}</small>}</td><td>{day(row.dueDate)}</td><td>{t(`taskPriority_${row.priority}`)}</td><td>{t(`taskStatus_${row.status}`)}</td><td>{t(`taskRecurrence_${row.recurrence}`)}</td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>{t('page', { page, total: list.data.total })}</span><div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button><button className="secondary" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(value => value + 1)}>{t('next')}</button></div></div>
    </section>}
    {focus && <section className="panel panel-body mt-6" aria-label={t('taskDetails')}><button className="secondary mb-4" onClick={() => setParams({})}>{t('close')}</button>
      {selected.isError && <ErrorMessage />}{selected.isPending ? <p role="status">{t('loading')}</p> : selected.data && <TaskPanel key={selected.data.id} row={selected.data} edit={() => setEditor(selected.data)} refresh={refresh} deleted={() => { setParams({}); void refresh(); }} />}
    </section>}
    {editor && <TaskEditor row={editor === 'new' ? undefined : editor} close={() => setEditor(undefined)} saved={saved} />}
  </>;
}
function TaskPanel({ row, edit, refresh, deleted }: { row: TaskDetail; edit: () => void; refresh: () => Promise<void>; deleted: () => void }) {
  const { t, i18n } = useTranslation(); const day = useDay(); const [action, setAction] = useState<'complete' | 'reopen' | 'delete'>();
  // Freeze the version and exact action preview until the owner confirms it.
  const [snapshot, setSnapshot] = useState<TaskDetail>();
  const timeline = useQuery({ queryKey: ['task-timeline', row.id], queryFn: () => api<{ id: string; summaryTr: string; summaryEn: string }[]>(`/api/tasks/${row.id}/timeline`) });
  const href = row.linkedEntity ? taskLinkPath(row.linkedEntity) : null;
  return <>
    <h2>{row.name}</h2><p className="my-3">{day(row.dueDate)} · {t(`taskStatus_${row.status}`)} · {t(`taskPriority_${row.priority}`)} · {t(`taskRecurrence_${row.recurrence}`)}</p>
    {row.isExample && <p className="notice my-3">{t('example')}</p>}
    {row.invalidDate && <p className="notice">{t('taskInvalidDate')}</p>}
    {row.linkUnavailable && <p className="notice my-3">{t('taskLinkUnavailable')}</p>}
    {row.linkedEntity && <p className="my-3">{t('taskLink')}: {href ? <Link className="text-accent" to={href}>{row.linkedEntity.name}</Link> : row.linkedEntity.name}</p>}
    <TaskOccurrenceInfo row={row} />
    {row.successor && <div className="notice my-3"><strong>{t('taskSuccessor')}: </strong>{row.successor.deleted ? <><span>{row.successor.name}</span><p>{t('taskSuccessorDeleted')}</p><Link className="text-accent" to="/trash">{t('trash')}</Link></> : <Link className="text-accent" to={`/tasks?task=${row.successor.id}`}>{row.successor.name} · {day(row.successor.dueDate)}</Link>}</div>}
    {row.successorMissing && <p className="notice my-3">{t('taskSuccessorMissing')}</p>}
    <div className="flex flex-wrap gap-3 my-5"><button className="secondary" onClick={edit}>{t('taskEdit')}</button>
      <button className="primary" onClick={() => { setSnapshot(row); setAction(row.status === 'OPEN' ? 'complete' : 'reopen'); }}>{t(row.status === 'OPEN' ? 'taskComplete' : 'taskReopen')}</button>
      <button className="secondary" onClick={() => { setSnapshot(row); setAction('delete'); }}>{t('taskDelete')}</button>
    </div>
    <h3>{t('timeline')}</h3>{timeline.isError && <ErrorMessage />}{timeline.data?.map(event => <p className="my-3 text-sm" key={event.id}>{i18n.language === 'tr' ? event.summaryTr : event.summaryEn}</p>)}
    {action && snapshot && <TaskAction row={snapshot} action={action} close={() => { setAction(undefined); setSnapshot(undefined); }} saved={async () => { setAction(undefined); setSnapshot(undefined); if (action === 'delete') deleted(); else await refresh(); }} />}
  </>;
}
function TaskOccurrenceInfo({ row }: { row: Pick<TaskRecord, 'recurrenceGenerated' | 'occurrence'> }) {
  const { t } = useTranslation(); const day = useDay();
  return <>{row.recurrenceGenerated ? <p className="notice my-3">{t('taskConsumed')}</p> : <>
    {row.occurrence.nextDate && <p className="notice my-3">{t('taskNextDate', { date: day(row.occurrence.nextDate) })}</p>}
    {!!row.occurrence.skippedMonths.length && <p className="notice my-3">{t('taskSkipped', { months: row.occurrence.skippedMonths.join(', ') })}</p>}
    {row.occurrence.limited && <p className="notice my-3">{t('taskRecurrenceLimit')}</p>}
  </>}</>;
}
function TaskAction({ row, action, close, saved }: { row: TaskDetail; action: 'complete' | 'reopen' | 'delete'; close: () => void; saved: () => Promise<void> }) {
  const { t } = useTranslation(); const key = action === 'complete' ? 'taskComplete' : action === 'reopen' ? 'taskReopen' : 'taskDelete';
  const mutation = useMutation({ mutationFn: () => api<TaskActionResult | TaskDetail>(`/api/tasks/${row.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'POST', body: body({ version: row.version }) }), onSuccess: saved });
  return <Modal title={t(key)} onClose={close}><p className="mb-3">{row.name}</p><p>{t(action === 'complete' ? 'taskCompletePrompt' : action === 'reopen' ? 'taskReopenPrompt' : 'taskDeletePrompt')}</p>
    {action === 'complete' && <TaskOccurrenceInfo row={row} />}<TaskError error={mutation.error} />
    <button className="primary mt-5" disabled={mutation.isPending || action === 'complete' && row.occurrence.limited} onClick={() => mutation.mutate()}>{t(key)}</button>
  </Modal>;
}
function TaskEditor({ row, close, saved }: { row?: TaskRecord; close: () => void; saved: (row: TaskDetail) => void }) {
  const { t } = useTranslation(); const [initial] = useState(() => row ? inputFor(row) : blank()); const [value, setValue] = useState<TaskInput>(initial);
  const [mode, setMode] = useState<'keep' | 'none' | TaskLink['type']>(row ? 'keep' : 'none'); const [invalid, setInvalid] = useState(false);
  const mutation = useMutation({ mutationFn: (payload: unknown) => api<TaskDetail>(row ? `/api/tasks/${row.id}` : '/api/tasks', { method: row ? 'PATCH' : 'POST', body: body(payload) }), onSuccess: saved });
  const preview = taskDate.safeParse(value.dueDate).success ? nextTaskOccurrence(value.dueDate, value.recurrence) : null;
  function submit(event: FormEvent) {
    event.preventDefault(); setInvalid(false);
    if (!taskFields.safeParse(value).success || mode !== 'keep' && mode !== 'none' && value.linkedEntity?.type !== mode) { setInvalid(true); return; }
    if (!row) { mutation.mutate(value); return; }
    const changes = Object.fromEntries(Object.entries(value).filter(([key, entry]) => key === 'linkedEntity' ? mode !== 'keep' : JSON.stringify(entry) !== JSON.stringify(initial[key as keyof TaskInput])));
    if (!Object.keys(changes).length) { close(); return; }
    mutation.mutate({ version: row.version, changes });
  }
  return <Modal title={t(row ? 'taskEdit' : 'taskAdd')} onClose={close}><form onSubmit={submit}>
    <label className="field">{t('taskName')}<input autoFocus required minLength={2} maxLength={160} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} /></label>
    <label className="field">{t('taskDue')}<input type="date" required min="0001-01-01" max="9999-12-31" value={value.dueDate} onChange={event => setValue({ ...value, dueDate: event.target.value })} /></label>
    <label className="field">{t('taskPriority')}<select aria-label={t('taskPriority')} value={value.priority} onChange={event => setValue({ ...value, priority: event.target.value as TaskInput['priority'] })}>{taskPriorities.map(key => <option key={key} value={key}>{t(`taskPriority_${key}`)}</option>)}</select></label>
    <label className="field">{t('taskRecurrence')}<select aria-label={t('taskRecurrence')} value={value.recurrence} onChange={event => setValue({ ...value, recurrence: event.target.value as TaskInput['recurrence'] })}>{taskRecurrences.map(key => <option key={key} value={key}>{t(`taskRecurrence_${key}`)}</option>)}</select></label>
    <p className="notice my-3">{t('taskRecurrenceHelp')}</p>
    {preview && <TaskOccurrenceInfo row={{ recurrenceGenerated: row?.recurrenceGenerated ?? false, occurrence: preview }} />}
    <label className="field">{t('taskLink')}<select aria-label={t('taskLink')} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setValue({ ...value, linkedEntity: null }); }}>
      {row && <option value="keep">{t('taskLinkKeep')}</option>}<option value="none">{t('taskLinkNone')}</option>{taskLinkTypes.map(type => <option key={type} value={type}>{t(`taskLinkKind_${type}`)}</option>)}
    </select></label>
    {mode === 'keep' && row?.linkedEntity && <p className="my-3">{row.linkedEntity.name}</p>}
    {mode === 'keep' && row?.linkUnavailable && <p className="notice my-3">{t('taskLinkUnavailable')}</p>}
    {mode !== 'keep' && mode !== 'none' && <TaskLinkPicker key={mode} type={mode} value={value.linkedEntity?.id} change={linkedEntity => setValue({ ...value, linkedEntity })} />}
    {invalid && <p className="error" role="alert">{t('taskInvalid')}</p>}<TaskError error={mutation.error} />
    <button className="primary mt-4" disabled={mutation.isPending}>{t('save')}</button>
  </form></Modal>;
}
function TaskLinkPicker({ type, value, change }: { type: TaskLink['type']; value?: string; change: (value: TaskLink | null) => void }) {
  const { t } = useTranslation(); const [search, setSearch] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; name: string }>();
  const query = useQuery({ queryKey: ['task-links', type, q, page], queryFn: () => api<{ items: { id: string; name: string }[]; total: number }>(`/api/tasks/links?${new URLSearchParams({ type, q, page: String(page) })}`) });
  return <div className="my-4">
    <div className="flex gap-2 items-end"><label className="field flex-1">{t('taskLinkSearch')}<input maxLength={100} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setQ(search); setPage(1); } }} /></label><button type="button" className="secondary" onClick={() => { setQ(search); setPage(1); }}>{t('searchLabel')}</button></div>
    <label className="field">{t('taskLinkChoose')}<select aria-label={t('taskLinkChoose')} required value={value ?? ''} onChange={event => { const row = query.data?.items.find(item => item.id === event.target.value) ?? (selected?.id === event.target.value ? selected : undefined); setSelected(row); change(row ? { type, id: row.id } : null); }}>
      <option value="">{t('select')}</option>{selected && !query.data?.items.some(item => item.id === selected.id) && <option value={selected.id}>{selected.name}</option>}{query.data?.items.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>{query.isError && <ErrorMessage />}
    <div className="flex gap-2"><button type="button" className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button type="button" className="secondary" disabled={page * 50 >= (query.data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
  </div>;
}
