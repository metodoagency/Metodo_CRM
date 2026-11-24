import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PresentationRulePreview, PresentationRuleState, PresentationTaskCandidate } from '../shared/presentation-tasks';
import { api, body } from './api';
import { ErrorMessage, Modal } from './components';
import { taskDate } from '../shared/tasks';

export function PresentationTaskRule() {
  const { t } = useTranslation(); const [open, setOpen] = useState(false);
  const rule = useQuery({ queryKey: ['presentation-task-rule'], queryFn: () => api<PresentationRuleState>('/api/task-rules/presentation') });
  return <section className="panel panel-body my-5" aria-label={t('presentationTaskRule')}>
    <div className="flex justify-between flex-wrap gap-3"><h2>{t('presentationTaskRule')}</h2>{rule.data && <span className="badge">{t(rule.data.enabled ? 'presentationRuleOn' : 'presentationRuleOff')}</span>}</div>
    <p className="muted my-3">{t('presentationRuleHelp')}</p>{rule.isError && <ErrorMessage />}
    <button className="secondary" disabled={!rule.data} onClick={() => setOpen(true)}>{t('presentationRuleConfigure')}</button>
    {open && rule.data && <RuleEditor initial={rule.data} close={() => setOpen(false)} />}
  </section>;
}
function RuleEditor({ initial, close }: { initial: PresentationRuleState; close: () => void }) {
  const { t, i18n } = useTranslation(); const client = useQueryClient();
  const day = (value: string) => taskDate.safeParse(value).success ? new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value)) : value;
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [snapshot, setSnapshot] = useState(initial); const [enabled, setEnabled] = useState(initial.enabled);
  const [sourceIds, setSourceIds] = useState<string[]>([]); const [page, setPage] = useState(1); const [preview, setPreview] = useState<PresentationRulePreview>();
  const candidates = useQuery({ queryKey: ['presentation-task-candidates', page], queryFn: () => api<{ items: PresentationTaskCandidate[]; total: number }>(`/api/task-rules/presentation/candidates?page=${page}`) });
  const build = useMutation({ mutationFn: () => api<PresentationRulePreview>('/api/task-rules/presentation/preview', { method: 'POST', body: body({ version: snapshot.version, enabled, sourceIds: enabled ? sourceIds : [] }) }), onSuccess: setPreview });
  const commit = useMutation({ mutationFn: () => api('/api/task-rules/presentation/confirm', { method: 'POST', body: body(preview) }), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['tasks'] }), client.invalidateQueries({ queryKey: ['overview'] }), client.invalidateQueries({ queryKey: ['presentation-task-rule'] }), client.invalidateQueries({ queryKey: ['presentation-task-candidates'] }), client.invalidateQueries({ queryKey: ['settings'] })]); if (active.current) close();
  } });
  const reload = useMutation({ mutationFn: () => api<PresentationRuleState>('/api/task-rules/presentation'), onSuccess: value => { setSnapshot(value); setPreview(undefined); build.reset(); commit.reset(); } });
  function changed() { setPreview(undefined); build.reset(); commit.reset(); }
  const busy = build.isPending || commit.isPending || reload.isPending;
  return <Modal title={t('presentationRuleConfigure')} onClose={close}>
    <p className="notice mb-4">{t('presentationRuleFuture')}</p>
    <label className="flex gap-3 my-4"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => { setEnabled(event.target.checked); changed(); }} />{t('presentationRuleEnabled')}</label>
    {enabled && <fieldset disabled={busy}><legend>{t('presentationRuleSelect')}</legend>
      {candidates.isError && <ErrorMessage />}{candidates.isPending && <p role="status">{t('loading')}</p>}
      <div className="max-h-64 overflow-y-auto">{candidates.data?.items.map(row => <label className="flex gap-3 my-3 items-start" key={row.id}><input type="checkbox" checked={sourceIds.includes(row.id)} disabled={row.invalidDate || row.consumed || sourceIds.length >= 100 && !sourceIds.includes(row.id)} onChange={event => { setSourceIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); changed(); }} /><span>{row.name} · {row.invalidDate ? t('taskInvalidDate') : day(row.followUpDate)}{row.consumed && <small className="block muted">{t('presentationRuleConsumed')}</small>}</span></label>)}</div>
      <div className="flex gap-2 my-3"><button type="button" className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button type="button" className="secondary" disabled={page * 50 >= (candidates.data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
    </fieldset>}
    {(build.isError || commit.isError || reload.isError) && <div role="alert" className="notice my-4"><p>{t('presentationRuleConflict')}</p><button className="secondary mt-2" disabled={busy} onClick={() => reload.mutate()}>{t('presentationRuleReload')}</button></div>}
    <button className="secondary my-3" disabled={busy} onClick={() => build.mutate()}>{t('presentationRulePreview')}</button>
    {preview && <section className="panel panel-body my-3" aria-label={t('presentationRulePreview')}><p>{t(preview.enabled ? 'presentationRuleOn' : 'presentationRuleOff')}</p><h3>{t('presentationRuleTasks', { count: preview.tasks.length })}</h3>
      <ul>{preview.tasks.map(task => <li className="my-3" key={task.id}><strong>{task.input.name}</strong> · {day(task.input.dueDate)}<p className="muted">{task.sourceName} · {t(`taskPriority_${task.input.priority}`)} · {t(`taskRecurrence_${task.input.recurrence}`)}</p></li>)}</ul>
      {!!preview.skipped.length && <p>{t('presentationRuleSkipped', { count: preview.skipped.length })}</p>}
      <button className="primary mt-4" disabled={busy || preview.enabled === preview.beforeEnabled && !preview.tasks.length || commit.isError} onClick={() => commit.mutate()}>{t('presentationRuleConfirm')}</button>
    </section>}
  </Modal>;
}
