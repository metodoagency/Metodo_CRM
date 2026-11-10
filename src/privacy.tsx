import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, body } from './api';
import { ErrorMessage } from './components';
import type { PrivacyState } from '../shared/privacy';

const sections = ['Categories', 'Purpose', 'Retention', 'Protection', 'Controller'] as const;
export function PrivacyNotice({ state, required = false }: { state: PrivacyState; required?: boolean }) {
  const { t, i18n } = useTranslation(); const cache = useQueryClient(); const [read, setRead] = useState(false);
  const mutation = useMutation({ mutationFn: () => api('/api/privacy/acknowledge', { method: 'POST', body: body({ version: state.version, noticeVersion: state.noticeVersion, language: i18n.language === 'en' ? 'en' : 'tr' }) }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ['privacy'] }); void cache.invalidateQueries({ queryKey: ['settings'] }); } });
  return <article className="panel panel-body space-y-6 max-w-3xl mx-auto"><div className="flex justify-between gap-3"><h1>{t('privacyTitle')}</h1><div className="flex gap-2"><button className="secondary" onClick={() => { void i18n.changeLanguage('tr'); }}>{t('tr')}</button><button className="secondary" onClick={() => { void i18n.changeLanguage('en'); }}>{t('en')}</button></div></div><p>{t('privacyIntro')}</p>
    {sections.map(section => <section key={section}><h2>{t(`privacy${section}Title`)}</h2><p className="subtitle mt-2">{t(`privacy${section}`)}</p></section>)}
    <p className="muted">{t('privacyVersion')}: {state.noticeVersion}</p>
    {required ? <form onSubmit={event => { event.preventDefault(); if (read) mutation.mutate(); }} className="space-y-4"><label className="flex gap-3 items-center"><input type="checkbox" required checked={read} onChange={event => setRead(event.target.checked)} />{t('privacyRead')}</label>{mutation.isError && <><ErrorMessage /><button className="secondary" type="button" onClick={() => { void cache.invalidateQueries({ queryKey: ['privacy'] }); }}>{t('privacyRetry')}</button></>}<button className="primary" disabled={!read || mutation.isPending}>{t('privacyContinue')}</button></form> : <p className="notice">{t(state.acknowledgementRequired ? 'privacyPending' : 'privacyAccepted')}</p>}
  </article>;
}

export function IncidentChecklist() {
  const { t } = useTranslation(); const cache = useQueryClient(); const [value, setValue] = useState(''); const [revealed, setRevealed] = useState<string | null>(null); const [revealError, setRevealError] = useState(false); const timer = useRef<number>();
  const state = useQuery({ queryKey: ['privacy'], queryFn: () => api<PrivacyState>('/api/privacy') });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const save = useMutation({ mutationFn: () => api('/api/privacy/incident-contact', { method: 'PATCH', body: body({ version: state.data?.version, value }) }), onSuccess: () => { setValue(''); setRevealed(null); void cache.invalidateQueries({ queryKey: ['privacy'] }); void cache.invalidateQueries({ queryKey: ['settings'] }); } });
  async function reveal() {
    setRevealError(false);
    try { const result = await api<{ value: string | null; expiresIn: number }>('/api/privacy/incident-contact/reveal', { method: 'POST' }); setRevealed(result.value); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setRevealed(null), result.expiresIn * 1000); }
    catch { setRevealError(true); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (state.data) save.mutate(); }
  return <article className="panel panel-body space-y-6 max-w-3xl mx-auto"><h1>{t('breachTitle')}</h1><p className="subtitle">{t('breachIntro')}</p><ol className="list-decimal pl-6 space-y-4">{['Contain', 'Record', 'Assess', 'Preserve', 'Consult', 'Recover', 'Review'].map(step => <li key={step}>{t(`breach${step}`)}</li>)}</ol>
    <section className="space-y-4"><h2>{t('breachContact')}</h2><p className="muted">{t(state.data?.contactConfigured ? 'breachContactStored' : 'breachContactEmpty')}</p>{revealed && <p role="status">{revealed}</p>}{state.data?.contactConfigured && <button className="secondary" onClick={() => { void reveal(); }}>{t('reveal')}</button>}<form onSubmit={submit} className="space-y-4"><label className="field">{t('breachContact')}<textarea maxLength={320} value={value} onChange={event => { setValue(event.target.value); save.reset(); }} /></label><p className="muted">{t('breachContactHint')}</p><button className="primary" disabled={!state.data || save.isPending}>{t('save')}</button></form>{save.isSuccess && <p role="status">{t('breachContactSaved')}</p>}{(state.isError || save.isError || revealError) && <ErrorMessage />}</section>
  </article>;
}
