import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { reviewInput, staffProposalInput, staffRoles } from '../shared/contracts';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';

type Proposal = { id: string; name: string; summary: string; type: string; version: number };
type Person = { id: string; name: string; version: number };
type Staff = Person & { tenureToken: string; headCoachToken: string | null; tenures: { id: string; role: string }[] };
type Context = { proposal: Proposal & { sourceUrl: string | null } } & (
  { supported: false } | { supported: true; club: { id: string; name: string; version: number }; people: Staff[] }
);
type ReviewInput = z.infer<typeof reviewInput>;

export function Proposals() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Proposal>();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['proposals', page], queryFn: () => api<Proposal[]>(`/api/proposals?page=${page}`) });
  return <><h1>{t('proposals')}</h1><p className="notice mt-5">{t('staffQueueHint')}</p>
    <section className="panel panel-body mt-5">
      {query.isPending && <p role="status">{t('loading')}</p>}
      {query.isError && <ErrorMessage />}
      {query.data && (query.data.length ? query.data.map(row => <div className="list-line" key={row.id}>
        <div><strong>{row.name}</strong><p className="muted mt-2 whitespace-pre-wrap">{row.summary}</p></div>
        <button className="secondary ml-auto" onClick={() => setSelected(row)}>{t('reviewProposal')}</button>
      </div>) : <Empty />)}
      {(page > 1 || query.data?.length === 50) && <div className="form-footer">
        <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
        <button className="secondary" disabled={query.data?.length !== 50} onClick={() => setPage(page + 1)}>{t('next')}</button>
      </div>}
    </section>
    {selected && <ReviewProposal key={selected.id} proposal={selected} onClose={() => setSelected(undefined)} />}
  </>;
}

function ReviewProposal({ proposal, onClose }: { proposal: Proposal; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [reject, setReject] = useState(false);
  const [revision, setRevision] = useState(0);
  const context = useQuery({ queryKey: ['proposal-context', proposal.id], queryFn: () => api<Context>(`/api/proposals/${proposal.id}/context`) });
  const mutation = useMutation({
    mutationFn: (input: ReviewInput) => api(`/api/proposals/${proposal.id}/review`, { method: 'POST', body: body(input) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  const error = mutation.error instanceof ApiError ? mutation.error : null;
  function refresh() {
    mutation.reset();
    void context.refetch().then(() => setRevision(value => value + 1));
  }
  return <Modal title={t('reviewProposal')} onClose={onClose}>
    <h2>{proposal.name}</h2><p className="muted mb-4 whitespace-pre-wrap">{proposal.summary}</p>
    {context.isPending && <p role="status">{t('loading')}</p>}
    {context.isError && <ErrorMessage />}
    {context.data && (reject ? <form onSubmit={event => {
      event.preventDefault();
      const reason = new FormData(event.currentTarget).get('reason');
      const input = reviewInput.safeParse({ action: 'reject', reason, version: context.data?.proposal.version });
      if (input.success) mutation.mutate(input.data);
    }}>
      <label className="field">{t('reason')}<textarea name="reason" required minLength={3} maxLength={4000} /></label>
      <div className="form-footer"><button className="secondary" type="button" onClick={() => { mutation.reset(); setReject(false); }}>{t('cancel')}</button>
        <button className="danger" disabled={mutation.isPending}>{t('reject')}</button></div>
    </form> : <>
      {context.data.supported ? <StaffApproval key={revision} context={context.data} pending={mutation.isPending || context.isFetching} onApprove={mutation.mutate} />
        : <p className="notice">{t('unsupportedProposal')}</p>}
      <button className="secondary mt-3" disabled={mutation.isPending} onClick={() => { mutation.reset(); setReject(true); }}>{t('reject')}</button>
    </>)}
    {error && (['STALE_VERSION', 'PREVIEW_STALE', 'NOT_FOUND'].includes(error.code)
      ? <div className="notice mt-4"><p role="alert">{t('contextChanged')}</p><button className="secondary mt-3" onClick={refresh}>{t('refreshPreview')}</button></div>
      : <p className="error mt-4" role="alert">{t(error.code === 'TENURE_EXISTS' ? 'staffTenureDuplicate' : 'staffTenureInvalid')}</p>)}
    {mutation.isError && !error && <ErrorMessage />}
  </Modal>;
}

function StaffApproval({ context, pending, onApprove }: {
  context: Extract<Context, { supported: true }>; pending: boolean; onApprove: (input: ReviewInput) => void;
}) {
  const { t, i18n } = useTranslation();
  const appointment = context.proposal.type === 'coach_appointment';
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<typeof staffRoles[number]>('HEAD_COACH');
  const [invalid, setInvalid] = useState(false);
  const [preview, setPreview] = useState<{ input: ReviewInput; person: Person; closing?: Staff }>();
  const candidates = useQuery({
    queryKey: ['staff-candidates', search], enabled: appointment,
    queryFn: () => api<{ items: Person[] }>(`/api/people?q=${encodeURIComponent(search.trim())}`),
  });
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const departing = context.people.find(row => row.id === form.get('personId'));
    const person = appointment ? candidates.data?.items.find(row => row.id === form.get('personId')) : departing;
    const predecessor = appointment && role === 'HEAD_COACH' ? context.people.find(row => row.id === form.get('predecessor')) : undefined;
    const result = reviewInput.safeParse({
      action: 'approve', version: context.proposal.version, clubVersion: context.club.version,
      personId: person?.id, personVersion: person?.version, effectiveDate: form.get('effectiveDate'), sourceUrl: form.get('sourceUrl'),
      ...(appointment ? { staffRole: role } : { tenureToken: departing?.tenureToken }),
      ...(predecessor?.headCoachToken ? { predecessor: { personId: predecessor.id, version: predecessor.version, tenureToken: predecessor.headCoachToken } } : {}),
    });
    if (!result.success || !person || predecessor?.id === person.id) { setInvalid(true); return; }
    setInvalid(false);
    setPreview({ input: result.data, person, closing: appointment ? predecessor : departing });
  }
  const personLabel = t(appointment ? 'appointmentPerson' : 'selectedCoach');
  const people = appointment ? candidates.data?.items ?? [] : context.people;
  return <>
    <p className="mb-4">{context.club.name} · {t(context.proposal.type)}</p>
    <form onSubmit={prepare} hidden={!!preview}>
      {appointment && <label className="field">{t('appointmentSearch')}<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>}
      {appointment && candidates.isError && <ErrorMessage />}
      <label className="field">{personLabel}<select name="personId" key={search} aria-label={personLabel} required>
        <option value="">{t('chooseCoach')}</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      {appointment && <label className="field">{t('staffRole')}<select aria-label={t('staffRole')} value={role} onChange={event => setRole(event.target.value as typeof role)}>
        {staffRoles.map(key => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>}
      {appointment && role === 'HEAD_COACH' && <label className="field">{t('predecessor')}<select name="predecessor" aria-label={t('predecessor')}>
        <option value="">{t('predecessorNone')}</option>{context.people.filter(row => row.headCoachToken).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>}
      <label className="field">{t(appointment ? 'appointmentDate' : 'effectiveDate')}<input type="date" name="effectiveDate" required /></label>
      <label className="field">{t('approvalSource')}<input type="url" name="sourceUrl" defaultValue={context.proposal.sourceUrl ?? ''} maxLength={2048} required /></label>
      {invalid && <p role="alert" className="error">{t('staffTenureInvalid')}</p>}
      <div className="form-footer"><button className="primary" disabled={pending || !people.length}>{t('previewStaffChange')}</button></div>
    </form>
    {preview && <section className="notice">
      <ul className="space-y-2">
        {appointment && <li>{t('tenureWillStart', { name: preview.person.name, role: t(preview.input.staffRole ?? ''), date: formatDate(preview.input.effectiveDate, i18n.language) })}</li>}
        {preview.closing?.tenures.filter(row => !appointment || row.role === 'HEAD_COACH').map(row => <li key={row.id}>{t('tenureWillClose', {
          name: preview.closing?.name, role: t(row.role), date: formatDate(preview.input.effectiveDate, i18n.language),
        })}</li>)}
        {!appointment && <li>{t('staffFollowUpPreview')}</li>}
      </ul>
      <p className="mt-3 break-all">{t('approvalSource')} · {preview.input.sourceUrl}</p>
      <div className="form-footer"><button className="secondary" disabled={pending} onClick={() => setPreview(undefined)}>{t('editStaffChange')}</button>
        <button className="primary" disabled={pending} onClick={() => onApprove(preview.input)}>{t('approveProposal')}</button></div>
    </section>}
  </>;
}

function formatDate(date: string | undefined, language: string) {
  return date ? new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(date)) : '';
}

export function StaffProposalForm({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (form: FormData) => api(`/api/clubs/${clubId}/staff-proposals`, { method: 'POST', body: body(staffProposalInput.parse({
      type: form.get('type'), name: form.get('name'), summary: form.get('summary'), sourceUrl: form.get('sourceUrl') || undefined,
    })) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t('staffProposalNew')} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}>
      <label className="field">{t('staffProposalType')}<select name="type" aria-label={t('staffProposalType')}>
        {staffProposalInput.shape.type.options.map(type => <option key={type} value={type}>{t(type)}</option>)}
      </select></label>
      <label className="field">{t('name')}<input name="name" required maxLength={160} /></label>
      <label className="field">{t('staffProposalSummary')}<textarea name="summary" required maxLength={4000} /></label>
      <label className="field">{t('staffProposalSource')}<input type="url" name="sourceUrl" maxLength={2048} /></label>
      {mutation.isError && <ErrorMessage />}
      <div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
