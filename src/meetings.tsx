import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { istanbulToday } from '../shared/domain';
import { agendaRange, meetingFields, meetingParticipantTypes, meetingPatch, meetingTimeInput, type AgendaView, type MeetingDetail, type MeetingInput, type MeetingReference, type MeetingSummary, type MeetingTaskPlan, type MeetingTimePreview } from '../shared/meetings';
import { taskDate, taskFields, taskLinkPath, taskPriorities, taskRecurrences, type TaskInput } from '../shared/tasks';
import { api, apiBlob, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';

type AgendaList = { items: MeetingSummary[]; total: number; pageSize: number };
const blank = (): MeetingInput => ({ name: '', date: istanbulToday(), time: '10:00', durationMin: 60, utcOffsetSeconds: null, locationOrUrl: null, participants: [], agenda: '', notes: '', outcome: null });
function inputFor(row: MeetingDetail): MeetingInput { return { name: row.name, date: row.date, time: row.time, durationMin: row.durationMin, utcOffsetSeconds: row.utcOffsetSeconds, locationOrUrl: row.locationOrUrl, participants: row.participants.flatMap(item => item.reference ? [item.reference] : []), agenda: row.agenda, notes: row.notes, outcome: row.outcome }; }
function useDay() {
  const { i18n } = useTranslation(); return (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: i18n.language === 'tr' ? '2-digit' : 'short', day: '2-digit' }).format(new Date(value));
}
function MeetingError({ error }: { error: Error | null }) {
  const { t } = useTranslation(); if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  return <p role="alert" className="error">{t(code.startsWith('MEETING_TIME_') ? `meetingTime_${code.slice(13)}` : code === 'MEETING_EXPORT_TIME' ? 'meetingIcsTime' : code === 'MEETING_EXPORT_LIMIT' ? 'meetingIcsLimit' : code === 'EXAMPLE_NAME_REQUIRED' ? 'taskExampleName' : code === 'MEETING_PARTICIPANT_UNAVAILABLE' ? 'meetingParticipantError' : error instanceof ApiError && [404, 409].includes(error.status) ? 'meetingConflict' : 'meetingInvalid')}</p>;
}
function IcsDownload({ path, input, range = false }: { path: string; input: unknown; range?: boolean }) {
  const { t } = useTranslation(); const mutation = useMutation({ mutationFn: () => apiBlob(path, { method: 'POST', body: body(input) }), onSuccess: file => { const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = 'metodo-agenda.ics'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } });
  return <div className="my-3"><button className="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{t(range ? 'meetingRangeIcs' : 'meetingIcs')}</button><MeetingError error={mutation.error} /></div>;
}
export function Meetings() {
  const { t } = useTranslation(); const day = useDay(); const client = useQueryClient(); const [params, setParams] = useSearchParams(); const focus = params.get('meeting');
  const [anchor, setAnchor] = useState(istanbulToday); const [view, setView] = useState<AgendaView>('week'); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<MeetingDetail | 'new'>(); const [saved, setSaved] = useState(false); const range = agendaRange(anchor, view);
  useEffect(() => { setEditor(undefined); setSaved(false); }, [focus]);
  const list = useQuery({ queryKey: ['agenda', range.from, range.to, q, page], queryFn: () => api<AgendaList>(`/api/agenda?${new URLSearchParams({ from: range.from, to: range.to, q, page: String(page) })}`) });
  const selected = useQuery({ queryKey: ['meeting', focus], queryFn: () => api<MeetingDetail>(`/api/meetings/${focus}`), enabled: !!focus });
  async function refresh() { await Promise.all(['agenda', 'meeting', 'meeting-timeline', 'overview', 'tasks', 'task'].map(key => client.invalidateQueries({ queryKey: [key] }))); }
  return <>
    <div className="page-heading"><h1>{t('meetingWorkspace')}</h1><button className="primary" onClick={() => setEditor('new')}>{t('meetingAdd')}</button></div>
    <p className="notice mb-4">{t('meetingZone')}</p>{saved && <p role="status" className="notice mb-4">{t('meetingSaved')}</p>}
    <section className="panel panel-body"><div className="flex gap-4 flex-wrap items-end">
      <label className="field">{t('meetingAnchor')}<input type="date" min="0001-01-01" max="9999-12-31" value={anchor} onChange={event => { if (taskDate.safeParse(event.target.value).success) { setAnchor(event.target.value); setPage(1); } }} /></label>
      <div className="flex gap-2 mb-1">{(['day', 'week', 'month'] as const).map(value => <button key={value} className={view === value ? 'primary' : 'secondary'} aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{t(`meetingView_${value}`)}</button>)}</div>
      <label className="field flex-1">{t('searchLabel')}<input maxLength={100} value={q} onChange={event => { setQ(event.target.value); setPage(1); }} /></label>
    </div><h2 className="my-4">{t('meetingRange', { from: day(range.from), to: day(range.to) })}</h2>
      <IcsDownload path="/api/agenda/ics" input={{ from: range.from, to: range.to }} range /><p className="notice my-3">{t('meetingIcsHelp')}</p>
      {list.isPending && <p role="status">{t('loading')}</p>}{list.isError && <ErrorMessage />}
      {list.data && <>
        {list.data.total > list.data.items.length && <p className="notice mb-4">{t('meetingListPartial', { count: list.data.items.length, total: list.data.total })}</p>}
        <div className={view === 'month' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>{range.days.map(date => <section key={date} className="rounded border border-[var(--border)] p-3"><h3 className="mb-2">{day(date)}</h3>{list.data.items.filter(row => row.date === date).map(row => <p key={row.id} className="my-2"><Link className="text-accent" to={`/agenda?meeting=${row.id}`}>{row.time} · {row.name}</Link>{row.isExample && <small className="muted block">{t('example')}</small>}</p>)}{!list.data.items.some(row => row.date === date) && <p className="muted text-sm">{list.data.total > list.data.items.length ? t('meetingListPartial', { count: list.data.items.length, total: list.data.total }) : t('meetingEmptyDay')}</p>}</section>)}</div>
        <div className="pagination"><span>{t('page', { page, total: list.data.total })}</span><div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div></div>
      </>}
    </section>
    {focus && <section className="panel panel-body mt-6" aria-label={t('meetingDetails')}><button className="secondary mb-4" onClick={() => setParams({})}>{t('close')}</button>{selected.isError && <ErrorMessage />}{selected.isPending ? <p role="status">{t('loading')}</p> : selected.data && <MeetingPanel key={selected.data.id} row={selected.data} edit={() => setEditor(selected.data)} refresh={refresh} deleted={() => { setParams({}); void refresh(); }} />}</section>}
    {editor && <MeetingEditor row={editor === 'new' ? undefined : editor} close={() => setEditor(undefined)} saved={async row => { setEditor(undefined); setParams({ meeting: row.id }); await refresh(); setSaved(true); }} />}
  </>;
}
function MeetingPanel({ row, edit, refresh, deleted }: { row: MeetingDetail; edit: () => void; refresh: () => Promise<void>; deleted: () => void }) {
  const { t, i18n } = useTranslation(); const day = useDay(); const [action, setAction] = useState<{ kind: 'delete' | 'task'; row: MeetingDetail }>(); const [createdTask, setCreatedTask] = useState('');
  const timeline = useQuery({ queryKey: ['meeting-timeline', row.id], queryFn: () => api<{ id: string; summaryTr: string; summaryEn: string }[]>(`/api/meetings/${row.id}/timeline`) });
  return <><h2>{row.name}</h2><p className="my-3">{day(row.date)} · {row.time} · {t('meetingDuration')}: {row.durationMin}</p>
    {row.isExample && <p className="notice">{t('example')}</p>}{row.timing.selected ? <p>{t('meetingEnd', { date: day(row.timing.selected.endDate), time: row.timing.selected.endTime })}</p> : <p className="notice">{t('meetingLegacyTime')}</p>}
    {(['locationOrUrl', 'agenda', 'notes', 'outcome'] as const).map((key, index) => <div key={key} className="my-4"><h3>{t(['meetingLocation', 'meetingAgenda', 'meetingNotes', 'meetingOutcome'][index])}</h3><p className="whitespace-pre-wrap break-words">{row[key] || t('meetingNotSet')}</p></div>)}
    <h3>{t('meetingParticipants')}</h3>{!row.participants.length && <Empty />}{row.legacyParticipants && <p className="notice my-3">{t('meetingLegacy')}</p>}
    {row.participants.map((item, index) => { const href = item.reference?.type === 'Task' ? `/tasks?task=${item.reference.id}` : item.reference ? taskLinkPath({ type: item.reference.type, id: item.reference.id }) : null; return <p className="my-2" key={index}>{item.unavailable ? t('meetingRefUnavailable') : href ? <Link className="text-accent" to={href}>{item.name}</Link> : item.name}</p>; })}
    <div className="flex gap-3 flex-wrap my-5"><button className="secondary" onClick={edit}>{t('meetingEdit')}</button><button className="primary" onClick={() => setAction({ kind: 'task', row })}>{t('meetingTask')}</button><button className="secondary" onClick={() => setAction({ kind: 'delete', row })}>{t('meetingDelete')}</button></div>
    <IcsDownload path={`/api/meetings/${row.id}/ics`} input={{ version: row.version }} />
    {createdTask && <p role="status" className="my-3"><Link className="text-accent" to={`/tasks?task=${createdTask}`}>{t('meetingTaskCreated')}</Link></p>}
    <h3>{t('timeline')}</h3>{timeline.isError && <ErrorMessage />}{timeline.data?.map(event => <p key={event.id} className="my-3 text-sm">{i18n.language === 'tr' ? event.summaryTr : event.summaryEn}</p>)}
    {action?.kind === 'delete' && <MeetingDelete row={action.row} close={() => setAction(undefined)} deleted={deleted} />}
    {action?.kind === 'task' && <MeetingTask row={action.row} close={() => setAction(undefined)} saved={async id => { setCreatedTask(id); setAction(undefined); await refresh(); }} />}
  </>;
}
function MeetingDelete({ row, close, deleted }: { row: MeetingDetail; close: () => void; deleted: () => void }) {
  const { t } = useTranslation(); const mutation = useMutation({ mutationFn: () => api(`/api/meetings/${row.id}`, { method: 'DELETE', body: body({ version: row.version }) }), onSuccess: deleted });
  return <Modal title={t('meetingDelete')} onClose={close}><p>{row.name}</p><p className="my-4">{t('meetingDeletePrompt')}</p><MeetingError error={mutation.error} /><button className="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{t('meetingDelete')}</button></Modal>;
}
function MeetingEditor({ row, close, saved }: { row?: MeetingDetail; close: () => void; saved: (row: MeetingDetail) => Promise<void> }) {
  const { t } = useTranslation(); const day = useDay(); const [initial] = useState(() => row ? inputFor(row) : blank()); const [value, setValue] = useState<MeetingInput>(initial); const [mode, setMode] = useState<'keep' | 'replace' | 'clear'>(row ? 'keep' : 'replace'); const [invalid, setInvalid] = useState(false);
  const timing = { date: value.date, time: value.time, durationMin: value.durationMin, utcOffsetSeconds: value.utcOffsetSeconds };
  const preview = useQuery({ queryKey: ['meeting-time', timing], queryFn: () => api<MeetingTimePreview>('/api/meetings/time-preview', { method: 'POST', body: body(timing) }), enabled: meetingTimeInput.safeParse(timing).success });
  const mutation = useMutation({ mutationFn: (payload: unknown) => api<MeetingDetail>(row ? `/api/meetings/${row.id}` : '/api/meetings', { method: row ? 'PATCH' : 'POST', body: body(payload) }), onSuccess: saved });
  function submit(event: FormEvent) {
    event.preventDefault(); setInvalid(false);
    if (!row) { if (!meetingFields.safeParse(value).success) { setInvalid(true); return; } mutation.mutate(value); return; }
    const changes = Object.fromEntries(Object.entries(value).filter(([key, entry]) => key === 'participants' ? mode !== 'keep' : JSON.stringify(entry) !== JSON.stringify(initial[key as keyof MeetingInput])));
    if (!Object.keys(changes).length) { close(); return; }
    if (!meetingPatch.safeParse({ version: row.version, changes }).success) { setInvalid(true); return; }
    mutation.mutate({ version: row.version, changes });
  }
  return <Modal title={t(row ? 'meetingEdit' : 'meetingAdd')} onClose={close}><form onSubmit={submit}>
    <label className="field">{t('meetingName')}<input autoFocus required minLength={2} maxLength={160} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} /></label>
    <div className="grid sm:grid-cols-2 gap-4"><label className="field">{t('meetingDate')}<input type="date" required min="0001-01-01" max="9999-12-31" value={value.date} onChange={event => setValue({ ...value, date: event.target.value, utcOffsetSeconds: null })} /></label>
      <label className="field">{t('meetingTime')}<input type="time" required value={value.time} onChange={event => setValue({ ...value, time: event.target.value, utcOffsetSeconds: null })} /></label></div>
    <label className="field">{t('meetingDuration')}<input type="number" required min={1} max={1440} value={value.durationMin} onChange={event => setValue({ ...value, durationMin: Number(event.target.value) })} /></label>
    <p className="notice my-3">{t('meetingZone')}</p>{preview.isError && <ErrorMessage />}
    {preview.data?.choices.length && preview.data.choices.length > 1 ? <label className="field">{t('meetingOffset')}<select aria-label={t('meetingOffset')} value={value.utcOffsetSeconds ?? ''} onChange={event => setValue({ ...value, utcOffsetSeconds: event.target.value ? Number(event.target.value) : null })}><option value="">{t('select')}</option>{preview.data.choices.map(choice => <option key={choice.instant} value={choice.offsetSeconds}>{choice.offsetLabel}</option>)}</select></label> : null}
    {preview.data?.issue && <p className="notice my-3">{t(`meetingTime_${preview.data.issue}`)}</p>}{preview.data?.selected && <p className="my-3">{t('meetingEnd', { date: day(preview.data.selected.endDate), time: preview.data.selected.endTime })}</p>}
    <label className="field">{t('meetingLocation')}<input maxLength={1000} value={value.locationOrUrl ?? ''} onChange={event => setValue({ ...value, locationOrUrl: event.target.value || null })} /></label>
    {(['agenda', 'notes', 'outcome'] as const).map((key, index) => <label key={key} className="field">{t(['meetingAgenda', 'meetingNotes', 'meetingOutcome'][index])}<textarea aria-label={t(['meetingAgenda', 'meetingNotes', 'meetingOutcome'][index])} rows={3} maxLength={key === 'notes' ? 16000 : 8000} value={value[key] ?? ''} onChange={event => setValue({ ...value, [key]: key === 'outcome' ? event.target.value || null : event.target.value })} /></label>)}
    <label className="field">{t('meetingParticipants')}<select aria-label={t('meetingParticipants')} value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); setValue({ ...value, participants: next === 'clear' ? [] : initial.participants }); }}>
      {row && <option value="keep">{t('meetingRefsKeep')}</option>}<option value="replace">{t('meetingRefsReplace')}</option><option value="clear">{t('meetingRefsClear')}</option></select></label>
    {row?.legacyParticipants && <p className="notice my-3">{t('meetingLegacy')}</p>}{mode === 'replace' && <ParticipantPicker value={value.participants} initial={row} change={participants => setValue({ ...value, participants })} />}
    <p className="notice my-3">{t('meetingParticipantsHelp')}</p>{invalid && <p role="alert" className="error">{t('meetingInvalid')}</p>}<MeetingError error={mutation.error} /><button className="primary mt-4" disabled={mutation.isPending}>{t('save')}</button>
  </form></Modal>;
}
function ParticipantPicker({ value, initial, change }: { value: MeetingReference[]; initial?: MeetingDetail; change: (rows: MeetingReference[]) => void }) {
  const { t } = useTranslation(); const [type, setType] = useState<MeetingReference['type']>('Person'); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState(''); const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(initial?.participants.flatMap(item => item.reference && item.name ? [[`${item.reference.type}:${item.reference.id}`, item.name]] : []) ?? []));
  const query = useQuery({ queryKey: ['meeting-participants', type, q, page], queryFn: () => api<{ items: { id: string; name: string }[]; total: number }>(`/api/meetings/participants?${new URLSearchParams({ type, q, page: String(page) })}`) });
  return <div className="my-4"><label className="field">{t('meetingRefType')}<select aria-label={t('meetingRefType')} value={type} onChange={event => { setType(event.target.value as typeof type); setPage(1); setSelected(''); }}>{meetingParticipantTypes.map(kind => <option key={kind} value={kind}>{t(kind === 'Task' ? 'meetingKind_Task' : `taskLinkKind_${kind}`)}</option>)}</select></label>
    <label className="field">{t('meetingRefSearch')}<input maxLength={100} value={q} onChange={event => { setQ(event.target.value); setPage(1); setSelected(''); }} /></label>
    <label className="field">{t('meetingRefSelect')}<select aria-label={t('meetingRefSelect')} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t('select')}</option>{query.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="flex gap-2 flex-wrap"><button type="button" className="secondary" disabled={!query.data?.items.some(item => item.id === selected) || value.length >= 50 || value.some(item => item.id === selected && item.type === type)} onClick={() => { const found = query.data?.items.find(item => item.id === selected); if (found) { change([...value, { type, id: selected }]); setLabels({ ...labels, [`${type}:${selected}`]: found.name }); setSelected(''); } }}>{t('meetingRefAdd')}</button><button type="button" className="secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected(''); }}>{t('previous')}</button><button type="button" className="secondary" disabled={page * 50 >= (query.data?.total ?? 0)} onClick={() => { setPage(page + 1); setSelected(''); }}>{t('next')}</button></div>{query.isError && <ErrorMessage />}
    {value.map(ref => { const name = labels[`${ref.type}:${ref.id}`] ?? t('meetingRefUnavailable'); return <div key={`${ref.type}:${ref.id}`} className="flex gap-3 my-3 items-center"><span>{name}</span><button className="secondary" type="button" aria-label={t('meetingRefRemove', { name })} onClick={() => change(value.filter(item => item.type !== ref.type || item.id !== ref.id))}>{t('meetingRemove')}</button></div>; })}
  </div>;
}
function MeetingTask({ row, close, saved }: { row: MeetingDetail; close: () => void; saved: (id: string) => Promise<void> }) {
  const { t } = useTranslation(); const [draft, setDraft] = useState<Omit<TaskInput, 'linkedEntity'>>({ name: row.name, dueDate: row.date, priority: 'MEDIUM', recurrence: 'NONE' }); const [plan, setPlan] = useState<MeetingTaskPlan>(); const [invalid, setInvalid] = useState(false);
  const preview = useMutation({ mutationFn: () => api<MeetingTaskPlan>(`/api/meetings/${row.id}/tasks/preview`, { method: 'POST', body: body({ version: row.version, draft }) }), onSuccess: setPlan });
  const commit = useMutation({ mutationFn: () => { if (!plan) throw new Error('Missing preview'); const { name, dueDate, priority, recurrence } = plan.changes.createTask; return api<{ taskId: string }>(`/api/meetings/${row.id}/tasks`, { method: 'POST', body: body({ version: row.version, draft: { name, dueDate, priority, recurrence }, taskId: plan.taskId, expiresAt: plan.expiresAt, previewToken: plan.previewToken }) }); }, onSuccess: result => saved(result.taskId) });
  return <Modal title={t('meetingTask')} onClose={close}>{plan ? <>
    <p className="notice my-3">{t('meetingTaskPrompt', { before: plan.changes.updateMeeting.beforeVersion, after: plan.changes.updateMeeting.afterVersion })}</p>
    <dl className="space-y-3"><dt>{t('taskName')}</dt><dd>{plan.changes.createTask.name}</dd><dt>{t('taskDue')}</dt><dd>{plan.changes.createTask.dueDate}</dd><dt>{t('taskPriority')}</dt><dd>{t(`taskPriority_${plan.changes.createTask.priority}`)}</dd><dt>{t('taskRecurrence')}</dt><dd>{t(`taskRecurrence_${plan.changes.createTask.recurrence}`)}</dd><dt>{t('status')}</dt><dd>{t('taskStatus_OPEN')}</dd><dt>{t('meetingTaskLink')}</dt><dd>{row.name}</dd></dl>
    {plan.changes.createTask.isExample && <p className="notice my-3">{t('example')}</p>}<p className="notice my-3">{t('meetingTaskExpires')}</p><MeetingError error={commit.error} /><div className="flex gap-3"><button className="secondary" disabled={commit.isPending} onClick={() => { setPlan(undefined); commit.reset(); preview.reset(); }}>{t('meetingTaskBack')}</button><button className="primary" disabled={commit.isPending} onClick={() => commit.mutate()}>{t('meetingTaskConfirm')}</button></div>
  </> : <form onSubmit={event => { event.preventDefault(); if (!taskFields.omit({ linkedEntity: true }).safeParse(draft).success) { setInvalid(true); return; } setInvalid(false); preview.mutate(); }}>
    <fieldset disabled={preview.isPending}><label className="field">{t('taskName')}<input required minLength={2} maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="field">{t('taskDue')}<input type="date" required min="0001-01-01" max="9999-12-31" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      <label className="field">{t('taskPriority')}<select aria-label={t('taskPriority')} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as typeof draft.priority })}>{taskPriorities.map(key => <option key={key} value={key}>{t(`taskPriority_${key}`)}</option>)}</select></label>
      <label className="field">{t('taskRecurrence')}<select aria-label={t('taskRecurrence')} value={draft.recurrence} onChange={event => setDraft({ ...draft, recurrence: event.target.value as typeof draft.recurrence })}>{taskRecurrences.map(key => <option key={key} value={key}>{t(`taskRecurrence_${key}`)}</option>)}</select></label>
      <p className="notice my-3">{t('meetingTaskExpires')}</p>{invalid && <p role="alert" className="error">{t('meetingInvalid')}</p>}<MeetingError error={preview.error} /><button className="primary">{t('meetingTaskPreview')}</button>
    </fieldset>
  </form>}</Modal>;
}
