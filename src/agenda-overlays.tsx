import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AgendaBirthdays, AgendaDeadlines } from '../shared/agenda-overlays';
import type { AgendaView, MeetingSummary } from '../shared/meetings';
import { api, body } from './api';
import { ErrorMessage } from './components';

// Sensitive dates live only in mounted component state. No query/mutation cache,
// browser storage, automatic refetch or delayed response can restore a hidden view.
function useBirthdayReveal(from: string, to: string, q: string) {
  const [visible, setVisible] = useState<(AgendaBirthdays & { until: number })>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const generation = useRef(0); const controller = useRef<AbortController>(); const mounted = useRef(true);
  const hide = useCallback(() => { generation.current++; controller.current?.abort(); setVisible(undefined); setBusy(false); setError(false); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const focus = () => hide(); const visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [hide]);
  useEffect(() => { if (!visible) return; const timeout = window.setTimeout(hide, Math.max(0, visible.until - Date.now())); return () => window.clearTimeout(timeout); }, [visible, hide]);
  async function reveal(page = 1) {
    hide(); const current = ++generation.current; const started = Date.now(); const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const result = await api<AgendaBirthdays>('/api/agenda/birthdays/view', { method: 'POST', signal: abort.signal, body: body({ from, to, q, page }) });
      if (!mounted.current || generation.current !== current) return;
      const until = Math.min(Date.parse(result.expiresAt), started + 60000);
      if (Number.isFinite(until) && until > Date.now()) setVisible({ ...result, until });
    } catch { if (mounted.current && generation.current === current && !abort.signal.aborted) setError(true); }
    finally { if (mounted.current && generation.current === current) setBusy(false); }
  }
  return { visible, busy, error, reveal, hide };
}
export function AgendaDays({ range, view, q, meetings, partial }: { range: { from: string; to: string; days: string[] }; view: AgendaView; q: string; meetings: MeetingSummary[]; partial: boolean }) {
  const { t, i18n } = useTranslation(); const [contracts, setContracts] = useState(true); const [contractPage, setContractPage] = useState(1);
  const birthdays = useBirthdayReveal(range.from, range.to, q);
  const deadlines = useQuery({ queryKey: ['agenda-deadlines', range.from, range.to, q, contractPage], queryFn: () => api<AgendaDeadlines>(`/api/agenda/deadlines?${new URLSearchParams({ from: range.from, to: range.to, q, page: String(contractPage) })}`), enabled: contracts });
  const day = (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  const dates = contracts ? deadlines.data?.items ?? [] : []; const revealed = birthdays.visible?.items ?? [];
  const paged = !!partial || contracts && !!deadlines.data && deadlines.data.total > deadlines.data.items.length || !!birthdays.visible && birthdays.visible.total > birthdays.visible.items.length;
  return <>
    <div className="my-5 space-y-3"><label className="flex gap-3 items-center"><input type="checkbox" checked={contracts} onChange={event => setContracts(event.target.checked)} />{t('agendaContracts')}</label>
      <div className="flex gap-3 flex-wrap"><button className="secondary" disabled={birthdays.busy} onClick={() => { void birthdays.reveal(); }}>{t('agendaBirthdayShow')}</button>{(birthdays.busy || birthdays.visible) && <button className="secondary" onClick={birthdays.hide}>{t('agendaBirthdayHide')}</button>}</div>
      <p className="notice">{t('agendaBirthdayHelp')}</p><p className="muted text-sm">{t('agendaLayerExport')}</p>
      {birthdays.busy && <p role="status">{t('loading')}</p>}{birthdays.error && <p role="alert" className="error">{t('agendaBirthdayError')}</p>}
      {!birthdays.visible && !birthdays.busy && <p className="muted text-sm">{t('agendaBirthdayExpired')}</p>}
      {contracts && deadlines.isError && <ErrorMessage />}{contracts && deadlines.isPending && <p role="status">{t('loading')}</p>}
      {contracts && deadlines.data && deadlines.data.total > deadlines.data.items.length && <p className="notice">{t('agendaPartialContracts', { count: deadlines.data.items.length, total: deadlines.data.total })}</p>}
      {birthdays.visible && birthdays.visible.total > birthdays.visible.items.length && <p className="notice">{t('agendaPartialBirthdays', { count: birthdays.visible.items.length, total: birthdays.visible.total })}</p>}
    </div>
    <div className={view === 'month' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>{range.days.map(date => {
      const rows = meetings.filter(row => row.date === date); const contractDates = dates.filter(row => row.date === date); const birthdayDates = revealed.filter(row => row.date === date);
      return <section key={date} className="rounded border border-[var(--border)] p-3"><h3 className="mb-2">{day(date)}</h3>
        {rows.map(row => <p key={row.id} className="my-2"><Link className="text-accent" to={`/agenda?meeting=${row.id}`}>{row.time} · {row.name}</Link>{row.isExample && <small className="muted block">{t('example')}</small>}</p>)}
        {contractDates.map(row => <p key={`${row.contractId}:${row.kind}:${row.date}`} className="my-2"><Link className="text-accent" to={`/contracts/${row.contractId}`}>{t(`contractRule_${row.kind}`)} · {row.name}</Link></p>)}
        {birthdayDates.map(row => <p key={`${row.kind}:${row.id}:${row.date}`} className="my-2"><Link className="text-accent" to={row.kind === 'Agent' ? '/birthdays' : `/record/${row.kind}/${row.id}`}>{t('agendaBirthday')} · {row.name}</Link></p>)}
        {!rows.length && !contractDates.length && !birthdayDates.length && <p className="muted text-sm">{paged ? t('agendaPageIncomplete') : t('agendaNoDisplayedEvents')}</p>}
      </section>;
    })}</div>
    {contracts && deadlines.data && <div className="my-5"><p className="muted text-sm">{t('agendaContractPage', { total: deadlines.data.total, warnings: deadlines.data.warningTotal, page: contractPage })}</p>
      {deadlines.data.warnings.map((row, index) => <p key={index} className="notice my-3"><Link className="text-accent" to={`/contracts/${row.contractId}`}>{t(row.code === 'SKIPPED_PAYMENT' ? 'agendaSkippedPayment' : 'agendaInvalidContract', { name: row.name, month: row.code === 'SKIPPED_PAYMENT' ? row.month : '' })}</Link></p>)}
      <div className="flex gap-3 mt-3 flex-wrap"><button className="secondary" disabled={contractPage === 1} onClick={() => setContractPage(contractPage - 1)}>{t('agendaContractPrevious')}</button><button className="secondary" disabled={contractPage * deadlines.data.pageSize >= Math.max(deadlines.data.total, deadlines.data.warningTotal)} onClick={() => setContractPage(contractPage + 1)}>{t('agendaContractNext')}</button></div>
    </div>}
    {birthdays.visible && <div className="my-5"><p className="muted text-sm">{t('agendaBirthdayPage', { total: birthdays.visible.total, page: birthdays.visible.page })}</p><div className="flex gap-3 mt-3 flex-wrap"><button className="secondary" disabled={birthdays.visible.page === 1} onClick={() => { void birthdays.reveal(birthdays.visible!.page - 1); }}>{t('agendaBirthdayPrevious')}</button><button className="secondary" disabled={birthdays.visible.page * birthdays.visible.pageSize >= birthdays.visible.total} onClick={() => { void birthdays.reveal(birthdays.visible!.page + 1); }}>{t('agendaBirthdayNext')}</button></div></div>}
  </>;
}
