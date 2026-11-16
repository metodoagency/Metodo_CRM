import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError, api, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import { birthdayThresholds, type AgentBirthdayItem, type BirthdayEntry, type BirthdayKind, type BirthdayList, type Greeting, type SignificantDateItem } from '../shared/calendar';
import { istanbulToday } from '../shared/domain';

function useCalendarDate() {
  const { i18n } = useTranslation();
  return (date: string, year = true) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'UTC', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', ...(year ? { year: 'numeric' } : {}),
  }).format(new Date(date));
}

function useTemporaryView(data: { expiresIn: number } | undefined, reset: () => void) {
  useEffect(() => {
    if (!data) return;
    const expires = setTimeout(reset, data.expiresIn * 1000);
    return () => clearTimeout(expires);
  }, [data, reset]);
}

function CalendarPaging({ page, total, change }: { page: number; total: number; change: (page: number) => void }) {
  const { t } = useTranslation();
  return <div className="pagination"><span>{t('page', { page, total })}</span><div className="flex gap-2">
    <button className="secondary" disabled={page === 1} onClick={() => change(page - 1)}>{t('previous')}</button>
    <button className="secondary" disabled={page * 50 >= total} onClick={() => change(page + 1)}>{t('next')}</button>
  </div></div>;
}

export function BirthdayCalendar() {
  const { t } = useTranslation();
  const [section, setSection] = useState<'month' | 'reminders' | 'dates' | 'agents'>('month');
  const [settingsRevision, setSettingsRevision] = useState(0);
  const sections = { month: 'birthdaysThisMonth', reminders: 'birthdayReminders', dates: 'significantDates', agents: 'birthdayAgentList' } as const;
  return <><h1>{t('birthdayCalendar')}</h1>
    <nav aria-label={t('birthdayCalendar')} className="flex flex-wrap gap-2 my-5">
      {(Object.keys(sections) as (keyof typeof sections)[]).map(key => <button key={key} className={key === section ? 'primary' : 'secondary'} aria-pressed={key === section} onClick={() => setSection(key)}>{t(sections[key])}</button>)}
    </nav>
    {section === 'dates' ? <SignificantDates /> : section === 'agents' ? <AgentBirthdays /> : <BirthdayListPanel key={`${section}:${settingsRevision}`} view={section} />}
    {section === 'reminders' && <BirthdaySettings onSaved={() => setSettingsRevision(rev => rev + 1)} />}
  </>;
}

function BirthdayListPanel({ view }: { view: 'month' | 'reminders' }) {
  const { t } = useTranslation();
  const format = useCalendarDate();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ kind: 'greeting' | 'birthday'; row: BirthdayEntry }>();
  const dates = useMutation({
    gcTime: 0,
    mutationFn: (selectedPage: number) => api<BirthdayList>('/api/calendar/birthdays', { method: 'POST', body: body({ page: selectedPage, view }) }),
  });
  const clear = useCallback(() => { dates.reset(); setEditing(undefined); }, [dates.reset]);
  useTemporaryView(dates.data, clear);
  function show(next: number) { setPage(next); dates.mutate(next); }
  return <section className="panel panel-body space-y-4"><h2>{t(view === 'month' ? 'birthdaysThisMonth' : 'birthdayReminders')}</h2>
    {!dates.data && <><p className="muted">{t('birthdayMasked')}</p><button className="secondary" disabled={dates.isPending} onClick={() => show(page)}>{t('birthdayShowDates')}</button></>}
    {dates.isError && <ErrorMessage />}
    {dates.data && <><button className="secondary" onClick={clear}>{t('hide')}</button>
      {dates.data.items.length ? dates.data.items.map(row => <div key={`${row.kind}:${row.id}:${row.date}`} className="list-line flex-wrap">
        <span className="min-w-20 font-medium">{format(row.date, false)}</span>
        <div className="flex-1">
          {row.kind === 'Agent' ? <span>{row.name}</span> : <Link to={`/record/${row.kind}/${row.id}`} className="text-accent">{row.name}</Link>}
          <div className="muted text-xs mt-1">{t(row.kind)}{row.days === 0 ? ` · ${t('today')}` : row.days > 0 ? ` · ${t('birthdayRemaining', { count: row.days })}` : ''}</div>
          {!!row.thresholds.length && <div className="muted text-xs mt-1">{t('birthdayRemindersDue', { thresholds: row.thresholds.join(', ') })}</div>}
        </div>
        {row.sent && <span className="badge">{t('birthdayGreetingMarked')}</span>}
        <button className="secondary" onClick={() => setEditing({ kind: 'greeting', row })}>{t('birthdayGreeting')}</button>
        <button className="secondary" onClick={() => setEditing({ kind: 'birthday', row })}>{t('birthdayEditDate')}</button>
      </div>) : <Empty />}
      <CalendarPaging page={page} total={dates.data.total} change={show} />
      {editing?.kind === 'greeting' && <GreetingEditor subject={editing.row} initialYear={editing.row.date.slice(0, 4)} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); show(page); }} />}
      {editing?.kind === 'birthday' && <BirthdayEditor kind={editing.row.kind} subject={editing.row} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); show(page); }} />}
    </>}
  </section>;
}

type EditableSubject = { id: string; name: string; version: number; hideBirthYear: boolean };
export function BirthdayEditor({ kind, subject, onClose, onSaved }: { kind: BirthdayKind; subject?: EditableSubject; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const format = useCalendarDate();
  const [clear, setClear] = useState(false);
  const path = `/api/calendar/birthdays/${kind}/${subject?.id}`;
  const reveal = useMutation({ gcTime: 0, mutationFn: () => api<{ value: string | null; expiresIn: number }>(`${path}/view`, { method: 'POST' }) });
  useTemporaryView(reveal.data, reveal.reset);
  const save = useMutation({
    gcTime: 0,
    mutationFn: (fields: { name?: string; birthDate?: string | null; hideBirthYear: boolean }) => subject
      ? api(path, { method: 'PATCH', body: body({ ...fields, version: subject.version }) })
      : api('/api/calendar/agents', { method: 'POST', body: body(fields) }),
    onSuccess: () => { void cache.invalidateQueries(); onSaved(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      ...(subject ? {} : { name: String(form.get('name')) }), birthDate: clear ? null : String(form.get('birthDate') ?? '') || undefined,
      hideBirthYear: form.has('hideBirthYear'),
    });
  }
  return <Modal title={t(subject ? 'birthdayEditDate' : 'birthdayAddAgent')} onClose={onClose}>
    <form className="space-y-3" onSubmit={submit}>
      {subject ? <><p>{subject.name}</p><div className="flex items-center flex-wrap gap-2">
        <button type="button" className="secondary" disabled={reveal.isPending} onClick={() => reveal.data ? reveal.reset() : reveal.mutate()}>{t(reveal.data ? 'hide' : 'birthdayShowDates')}</button>
        {reveal.data && <span>{reveal.data.value ? reveal.data.value.length === 5 ? format(`2000-${reveal.data.value}`, false) : format(reveal.data.value) : t('empty')}</span>}
      </div></> : <label className="field">{t('name')}<input name="name" required minLength={2} maxLength={160} /></label>}
      <label className="field">{t('birthDate')}<input type="date" name="birthDate" max={istanbulToday()} disabled={clear} required={!subject} /></label>
      {subject && <><p className="muted">{t('birthdayKeepDate')}</p><label className="flex gap-2"><input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} />{t('birthdayClearDate')}</label></>}
      <label className="flex gap-2"><input name="hideBirthYear" type="checkbox" defaultChecked={subject?.hideBirthYear} />{t('birthdayHideYear')}</label>
      {(save.isError || reveal.isError) && <ErrorMessage />}
      <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}

export function GreetingEditor({ subject, initialYear = istanbulToday().slice(0, 4), onClose, onSaved }: {
  subject: { kind: BirthdayKind; id: string; name: string }; initialYear?: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [year, setYear] = useState(initialYear);
  const path = (selectedYear: string) => `/api/calendar/greetings/${subject.kind}/${subject.id}/${selectedYear}`;
  const note = useMutation({ gcTime: 0, mutationFn: (selectedYear: string) => api<Greeting>(`${path(selectedYear)}/view`, { method: 'POST' }) });
  useTemporaryView(note.data, note.reset);
  const save = useMutation({
    gcTime: 0,
    mutationFn: (fields: { greetingNote: string; sent: boolean }) => api(path(year), { method: 'PATCH', body: body({ version: note.data?.version, ...fields }) }),
    onSuccess: onSaved,
  });
  const remove = useMutation({ mutationFn: () => api(path(year), { method: 'DELETE', body: body({ version: note.data?.version }) }), onSuccess: onSaved });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({ greetingNote: String(form.get('greetingNote')), sent: form.has('sent') });
  }
  return <Modal title={t('birthdayGreeting')} onClose={onClose}><div className="space-y-3">
    <p>{subject.name}</p>
    <form className="flex flex-wrap gap-2 items-end" onSubmit={event => { event.preventDefault(); save.reset(); note.mutate(year); }}>
      <label className="field">{t('birthdayGreetingYear')}<input type="number" min={1900} max={Number(istanbulToday().slice(0, 4)) + 1} required value={year} onChange={event => { setYear(event.target.value); note.reset(); }} /></label>
      <button className="secondary" disabled={note.isPending || save.isPending || remove.isPending}>{t('birthdayGreetingLoad')}</button>
    </form>
    {note.isError && (note.error instanceof ApiError && note.error.status === 409 ? <p className="notice" role="alert">{t('birthdayGreetingTrash')}</p> : <ErrorMessage />)}
    {note.data && <form className="space-y-3" key={`${year}:${note.submittedAt}`} onSubmit={submit}>
      <label className="field">{t('greetingNote')}<textarea name="greetingNote" maxLength={2000} defaultValue={note.data.greetingNote} /></label>
      <label className="flex gap-2"><input type="checkbox" name="sent" defaultChecked={note.data.sent} />{t('birthdayGreetingSent')}</label>
      <p className="muted">{t('birthdayGreetingHint')}</p>
      {(save.isError || remove.isError) && <ErrorMessage />}
      <div className="form-footer">{note.data.version && <button type="button" className="danger" disabled={save.isPending || remove.isPending} onClick={() => remove.mutate()}>{t('delete')}</button>}<button className="primary" disabled={save.isPending || remove.isPending}>{t('save')}</button></div>
    </form>}
  </div></Modal>;
}

function BirthdaySettings({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const [invalid, setInvalid] = useState(false);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<{ version: number; birthdayThresholds: number[] }>('/api/settings') });
  const save = useMutation({
    mutationFn: (thresholds: number[]) => api('/api/settings', { method: 'PATCH', body: body({ version: settings.data?.version, birthdayThresholds: thresholds }) }),
    onSuccess: onSaved,
    onSettled: () => cache.invalidateQueries({ queryKey: ['settings'] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('thresholds')).trim();
    const parsed = birthdayThresholds.safeParse(value ? value.split(',').map(part => /^\d+$/.test(part.trim()) ? Number(part) : NaN) : []);
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  }
  return <section className="panel panel-body mt-5 space-y-3">
    <h2>{t('birthdayThresholds')}</h2><p className="muted">{t('birthdayThresholdsHelp')}</p>
    {settings.data && <form key={settings.data.version} onSubmit={submit} className="flex items-end gap-2 flex-wrap">
      <label className="field"><span className="sr-only">{t('birthdayThresholds')}</span><input name="thresholds" maxLength={100} defaultValue={settings.data.birthdayThresholds.join(', ')} onChange={() => { setInvalid(false); save.reset(); }} /></label>
      <button className="primary" disabled={save.isPending}>{t('save')}</button>
    </form>}
    {(invalid || save.isError || settings.isError) && <ErrorMessage />}
    {save.isSuccess && <p role="status">{t('birthdayThresholdsSaved')}</p>}
  </section>;
}

function AgentBirthdays() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<AgentBirthdayItem | 'new'>();
  const [greeting, setGreeting] = useState<AgentBirthdayItem>();
  const agents = useQuery({ queryKey: ['calendar-agents', page, query], queryFn: () => api<{ items: AgentBirthdayItem[]; total: number }>(`/api/calendar/agents?${new URLSearchParams({ page: String(page), q: query })}`) });
  return <section className="panel panel-body space-y-4"><h2>{t('birthdayAgentList')}</h2>
    <div className="flex items-end flex-wrap gap-2"><label className="field">{t('birthdayAgentSearch')}<input value={query} maxLength={100} onChange={event => { setPage(1); setQuery(event.target.value); }} /></label><button className="primary" onClick={() => setEdit('new')}>{t('birthdayAddAgent')}</button></div>
    {agents.isError && <ErrorMessage />}
    {agents.data && <>{agents.data.items.length ? agents.data.items.map(row => <div className="list-line flex-wrap" key={row.id}><span className="flex-1">{row.name}</span><button className="secondary" onClick={() => setGreeting(row)}>{t('birthdayGreeting')}</button><button className="secondary" onClick={() => setEdit(row)}>{t('birthdayEditDate')}</button></div>) : <Empty />}
      <CalendarPaging page={page} total={agents.data.total} change={setPage} />
    </>}
    {edit && <BirthdayEditor kind="Agent" subject={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} onSaved={() => setEdit(undefined)} />}
    {greeting && <GreetingEditor subject={{ ...greeting, kind: 'Agent' }} onClose={() => setGreeting(undefined)} onSaved={() => setGreeting(undefined)} />}
  </section>;
}

function SignificantDates() {
  const { t } = useTranslation();
  const format = useCalendarDate();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<SignificantDateItem | 'new'>();
  const list = useQuery({ queryKey: ['calendar-dates', page], queryFn: () => api<{ items: SignificantDateItem[]; total: number }>(`/api/calendar/dates?page=${page}`) });
  const path = edit && edit !== 'new' ? `/api/calendar/dates/${edit.id}` : '/api/calendar/dates';
  function complete() { setEdit(undefined); void cache.invalidateQueries(); }
  const save = useMutation({
    mutationFn: (fields: { name: string; date: string }) => edit && edit !== 'new'
      ? api(path, { method: 'PATCH', body: body({ ...fields, version: edit.version }) })
      : api(path, { method: 'POST', body: body(fields) }),
    onSuccess: complete,
  });
  const remove = useMutation({
    mutationFn: (version: number) => api(path, { method: 'DELETE', body: body({ version }) }),
    onSuccess: () => { if (page > 1 && list.data?.items.length === 1) setPage(page - 1); complete(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    save.mutate({ name: String(values.get('name')), date: String(values.get('date')) });
  }
  function open(row: SignificantDateItem | 'new') { save.reset(); remove.reset(); setEdit(row); }
  return <section className="panel panel-body space-y-4">
    <div className="flex flex-wrap gap-2 justify-between"><h2>{t('significantDates')}</h2><button className="primary" onClick={() => open('new')}>{t('significantDateAdd')}</button></div>
    {list.isError && <ErrorMessage />}
    {list.data && <>{list.data.items.length ? list.data.items.map(row => <div className="list-line flex-wrap" key={row.id}><span className="muted">{format(row.date)}</span><span className="flex-1">{row.name}</span><button className="secondary" onClick={() => open(row)}>{t('significantDateEdit')}</button></div>) : <Empty />}
      <CalendarPaging page={page} total={list.data.total} change={setPage} /></>}
    {edit && <Modal title={t(edit === 'new' ? 'significantDateAdd' : 'significantDateEdit')} onClose={() => setEdit(undefined)}>
      <form onSubmit={submit} className="space-y-3">
        <label className="field">{t('name')}<input name="name" required minLength={2} maxLength={160} defaultValue={edit === 'new' ? '' : edit.name} /></label>
        <label className="field">{t('significantDateValue')}<input name="date" type="date" required defaultValue={edit === 'new' ? '' : edit.date.slice(0, 10)} /></label>
        {(save.isError || remove.isError) && <ErrorMessage />}
        <div className="form-footer">{edit !== 'new' && <button type="button" className="danger" disabled={save.isPending || remove.isPending} onClick={() => remove.mutate(edit.version)}>{t('delete')}</button>}<button className="primary" disabled={save.isPending || remove.isPending}>{t('save')}</button></div>
      </form>
    </Modal>}
  </section>;
}
