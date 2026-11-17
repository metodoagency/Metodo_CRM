import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { positions } from '../shared/domain';
import { formatMarketAmount, marketCurrencies } from '../shared/player-market';
import {
  footOptions, requestChanges, requestConstraintFields, requestInput, requestPriorities, requestStatuses, validRequestConstraints,
  type NamedRecord, type RequestRecord, type RequestStatus, type RequestSuggestion,
} from '../shared/transfer-requests';
import { api, ApiError, body } from './api';
import { Badge, Empty, ErrorMessage, Modal } from './components';
import { footLabels } from './player-card-editor';

type RequestPage = { items: RequestRecord[]; page: number; total: number };
const requestPageSize = 50;

function requestDay(value: string, language: string) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'UTC', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric',
  }).format(new Date(value));
}

function RecordLink({ kind, record }: { kind: 'Club' | 'Person' | 'Player'; record: NamedRecord | null }) {
  const { t } = useTranslation();
  return record ? <Link className="text-accent" to={`/record/${kind}/${record.id}`}>{record.name}</Link>
    : <span className="muted">{t(kind === 'Club' ? 'requestClubUnavailable' : kind === 'Person' ? 'requestContactUnavailable' : 'requestPlayerUnavailable')}</span>;
}

function useRefreshRequests() {
  const client = useQueryClient();
  return (id: string) => {
    void client.invalidateQueries({ queryKey: ['requests'] });
    void client.invalidateQueries({ queryKey: ['record', 'Request', id] });
    void client.invalidateQueries({ queryKey: ['timeline', 'Request', id] });
    void client.invalidateQueries({ queryKey: ['overview'] });
    void client.invalidateQueries({ queryKey: ['club-section'] });
  };
}

export function useRequestContacts(clubId: string) {
  return useQuery({
    queryKey: ['request-contacts', clubId], enabled: !!clubId,
    queryFn: ({ signal }) => api<NamedRecord[]>(`/api/requests/contacts?clubId=${encodeURIComponent(clubId)}`, { signal }),
  });
}

export function TransferRequests() {
  const { t } = useTranslation();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  return <>
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><div className="eyebrow">{t('workspace')}</div><h1>{t('requests')}</h1></div>
      <div className="flex gap-2">
        <a className="secondary" href="/api/export/Request"><Download size={15} />{t('export')}</a>
        <button className="primary" onClick={() => setCreate(true)}><Plus size={15} />{t('new')}</button>
      </div>
    </div>
    <div className="flex flex-wrap gap-3 items-end my-5">
      <div className="flex gap-2" role="group" aria-label={t('requestView')}>
        <button className={view === 'board' ? 'primary' : 'secondary'} aria-pressed={view === 'board'} onClick={() => setView('board')}>{t('requestKanban')}</button>
        <button className={view === 'list' ? 'primary' : 'secondary'} aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('requestList')}</button>
      </div>
      <form className="flex flex-wrap flex-1 gap-2 items-end max-w-lg" onSubmit={event => { event.preventDefault(); setQ(search.trim()); }}>
        <label className="field flex-1"><span className="sr-only">{t('searchLabel')}</span>
          <input value={search} maxLength={100} placeholder={t('search')} onChange={event => setSearch(event.target.value)} />
        </label>
        <button className="secondary">{t('searchLabel')}</button>
      </form>
    </div>
    {view === 'board'
      ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" key={q}>{requestStatuses.map(status => <RequestRows key={status} q={q} status={status} />)}</div>
      : <RequestRows key={q} q={q} />}
    {create && <RequestEditor onClose={() => setCreate(false)} />}
  </>;
}

function RequestRows({ q, status }: { q: string; status?: RequestStatus }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), q });
  if (status) params.set('status', status);
  const query = useQuery({ queryKey: ['requests', q, status, page], queryFn: ({ signal }) => api<RequestPage>(`/api/requests?${params}`, { signal }) });
  const data = query.data;
  return <section className="panel min-w-0" aria-label={t(status ?? 'requestList')}>
    {status && <div className="panel-header"><h2>{t(status)}</h2><span className="muted">{data?.total}</span></div>}
    {query.isError && <div className="p-3"><ErrorMessage /></div>}
    {query.isPending && <p className="p-3 muted" role="status">{t('loading')}</p>}
    {data && (!data.items.length ? <Empty /> : status
      ? <ul className="p-3 space-y-3">{data.items.map(row => <li key={row.id} className="rounded-md border p-3">
        <Link className="font-semibold break-words" to={`/record/Request/${row.id}`}>{row.name}</Link>
        {row.isExample && <span className="block muted text-xs">{t('example')}</span>}
        <p className="muted my-2">{t(row.position)} · {t(row.priority)}</p>
        <p className="text-sm"><RecordLink kind="Club" record={row.club} /></p>
        {row.deadline && <p className="text-xs muted mt-2">{requestDay(row.deadline, i18n.language)}</p>}
        <RequestStatusSelect row={row} />
      </li>)}</ul>
      : <div className="table-wrap"><table>
        <thead><tr>{['name', 'club', 'requestContact', 'position', 'deadline', 'status'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}>
          <td><Link className="font-semibold" to={`/record/Request/${row.id}`}>{row.name}</Link>{row.isExample && <small className="muted block">{t('example')}</small>}</td>
          <td><RecordLink kind="Club" record={row.club} /></td><td><RecordLink kind="Person" record={row.requester} /></td>
          <td>{t(row.position)}</td><td>{row.deadline ? requestDay(row.deadline, i18n.language) : '—'}</td><td><RequestStatusSelect row={row} /></td>
        </tr>)}</tbody>
      </table></div>)}
    {data && (page > 1 || data.total > requestPageSize) && <div className="pagination flex-wrap">
      <span>{t('page', { page, total: data.total })}</span>
      <div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
        <button className="secondary" disabled={page * requestPageSize >= data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
    </div>}
  </section>;
}

function RequestStatusSelect({ row }: { row: RequestRecord }) {
  const { t } = useTranslation();
  const refresh = useRefreshRequests();
  const change = useMutation({
    mutationFn: (status: RequestStatus) => api<RequestRecord>(`/api/records/Request/${row.id}`, {
      method: 'PATCH', body: body({ version: row.version, changes: { status } }),
    }),
    onSettled: () => refresh(row.id),
  });
  return <>
    <label className="field mt-2">
      <span className="sr-only">{t('requestMove')} · {row.name}</span>
      <select disabled={change.isPending} value={row.status} onChange={event => change.mutate(event.target.value as RequestStatus)}>
        {requestStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}
      </select>
    </label>
    {change.isError && <RequestError error={change.error} />}
  </>;
}

function RequestError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'PERSON_NOT_AT_CLUB') return <p className="error" role="alert">{t('requestContactInvalid')}</p>;
  if (code === 'REQUEST_CONSTRAINTS') return <p className="error" role="alert">{t('requestConstraints')}</p>;
  if (code === 'STALE_VERSION') return <p className="error" role="alert">{t('contextChanged')}</p>;
  return <ErrorMessage />;
}

export function RequestEditor({ request: initial, onClose }: { request?: RequestRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refresh = useRefreshRequests();
  const [request] = useState(initial);
  const [clubSearch, setClubSearch] = useState('');
  const [clubQ, setClubQ] = useState('');
  const [clubId, setClubId] = useState(request?.clubId ?? '');
  const [requesterId, setRequesterId] = useState(request?.requesterId ?? '');
  const [chosenClub, setChosenClub] = useState<NamedRecord | null>(request?.club ?? null);
  const [invalid, setInvalid] = useState(false);
  const clubs = useQuery({
    queryKey: ['request-clubs', clubQ], queryFn: ({ signal }) => api<{ items: NamedRecord[] }>(`/api/clubs?q=${encodeURIComponent(clubQ)}`, { signal }),
  });
  const contacts = useRequestContacts(clubId);
  const activeContacts = contacts.data ?? [];
  const historicContact = clubId === request?.clubId && requesterId === request.requesterId
    && !!requesterId && !activeContacts.some(person => person.id === requesterId);

  const save = useMutation({
    mutationFn: (input: object) => api<RequestRecord>(request ? `/api/records/Request/${request.id}` : '/api/requests', {
      method: request ? 'PATCH' : 'POST', body: body(request ? { version: request.version, changes: input } : input),
    }),
    onSuccess: row => { refresh(row.id); onClose(); if (!request) navigate(`/record/Request/${row.id}`); },
    onError: error => { if (request && error instanceof ApiError && error.code === 'STALE_VERSION') refresh(request.id); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const read = (key: string) => String(values.get(key) ?? '').trim();
    const list = (key: 'preferredCountries' | 'preferredLeagues' | 'tags') => {
      const prior = request?.[key];
      return prior && values.get(key) === prior.join(', ') ? prior : [...new Set(read(key).split(',').map(value => value.trim()).filter(Boolean))];
    };
    const maybeInt = (key: string) => read(key) ? Number(read(key)) : null;
    const input = {
      name: read('name'), clubId, requesterId: requesterId || undefined, position: read('position'),
      status: read('status'), priority: read('priority'), deadline: read('deadline') || null,
      ageMin: maybeInt('ageMin'), ageMax: maybeInt('ageMax'), preferredFoot: read('preferredFoot') || null,
      euRequired: read('euRequired') === 'yes' ? true : read('euRequired') === 'no' ? false : null,
      preferredCountries: list('preferredCountries'), preferredLeagues: list('preferredLeagues'), tags: list('tags'),
      salaryMax: read('salaryMax').replace(',', '.') || null, salaryCurrency: read('salaryCurrency') || null,
      feeMax: read('feeMax').replace(',', '.') || null, feeCurrency: read('feeCurrency') || null,
      profileText: read('profileText'),
    };
    if (!requesterId && (clubId !== request?.clubId || request.requesterId)) { setInvalid(true); return; }
    const changes = request ? Object.fromEntries(Object.entries(input).filter(([key, proposed]) => {
      if (proposed === undefined) return false;
      const previous = key === 'deadline' ? request.deadline?.slice(0, 10) ?? null : request[key as keyof RequestRecord];
      return JSON.stringify(proposed) !== JSON.stringify(previous);
    })) : input;
    if ((!request || requestConstraintFields.some(key => key in changes)) && !validRequestConstraints(input)) { setInvalid(true); return; }
    const parsed = (request ? requestChanges : requestInput).safeParse(changes);
    if (!parsed.success) { setInvalid(true); return; }
    setInvalid(false);
    if (!Object.keys(parsed.data).length) { onClose(); return; }
    save.mutate(parsed.data);
  }

  const availableClubs = clubs.data?.items ?? [];
  return <Modal title={request ? t('requestEdit') : `${t('new')} · ${t('Request')}`} onClose={onClose}>
    <form onSubmit={submit} noValidate={!!request} className="space-y-3">
      <label className="field">{t('name')}<input name="name" defaultValue={request?.name} minLength={2} maxLength={160} required /></label>
      <div className="flex gap-2 flex-wrap items-end">
        <label className="field flex-1">{t('requestClubSearch')}<input value={clubSearch} maxLength={100} onChange={event => setClubSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setClubQ(clubSearch.trim()); } }} /></label>
        <button className="secondary" type="button" onClick={() => setClubQ(clubSearch.trim())}>{t('searchLabel')}</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="field">{t('club')}<select value={clubId} required onChange={event => {
          const selected = event.target.value;
          setClubId(selected); setChosenClub(availableClubs.find(club => club.id === selected) ?? null); setRequesterId('');
        }}>
          <option value="">{t('select')}</option>
          {clubId && !availableClubs.some(club => club.id === clubId) && <option value={clubId}>{chosenClub?.name ?? t('requestClubUnavailable')}</option>}
          {availableClubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select></label>
        <label className="field">{t('requestContact')}<select value={requesterId} required={!request || clubId !== request.clubId || !!request.requesterId} disabled={!clubId}
          onChange={event => setRequesterId(event.target.value)}>
          <option value="">{t('select')}</option>
          {historicContact && <option value={requesterId}>{request?.requester?.name ?? t('requestContactUnavailable')}</option>}
          {activeContacts.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
      </div>
      {clubs.isError || contacts.isError ? <ErrorMessage /> : clubId && contacts.data?.length === 0 && !historicContact
        ? <p className="muted">{t('requestNoContacts')}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="field">{t('position')}<select name="position" defaultValue={request?.position ?? positions[0]}>{positions.map(position => <option key={position} value={position}>{t(position)}</option>)}</select></label>
        <label className="field">{t('status')}<select name="status" defaultValue={request?.status ?? 'OPEN'}>{requestStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label>
        <label className="field">{t('requestPriority')}<select name="priority" defaultValue={request?.priority ?? 'MEDIUM'}>{requestPriorities.map(priority => <option key={priority} value={priority}>{t(priority)}</option>)}</select></label>
        <label className="field">{t('deadline')}<input type="date" name="deadline" defaultValue={request?.deadline?.slice(0, 10)} /></label>
        <label className="field">{t('requestAgeMin')}<input type="number" min="1" max="120" name="ageMin" defaultValue={request?.ageMin ?? ''} /></label>
        <label className="field">{t('requestAgeMax')}<input type="number" min="1" max="120" name="ageMax" defaultValue={request?.ageMax ?? ''} /></label>
        <label className="field">{t('requestFoot')}<select name="preferredFoot" defaultValue={request?.preferredFoot ?? ''}><option value="">{t('requestAny')}</option>
          {footOptions.map(foot => <option key={foot} value={foot}>{t(footLabels[foot])}</option>)}</select></label>
        <label className="field">{t('requestEu')}<select name="euRequired" defaultValue={request?.euRequired == null ? '' : request.euRequired ? 'yes' : 'no'}>
          <option value="">{t('requestAny')}</option><option value="yes">{t('requestNeeded')}</option><option value="no">{t('cardNo')}</option>
        </select></label>
        {(['salary', 'fee'] as const).map(kind => {
          const amount = kind === 'salary' ? 'salaryMax' : 'feeMax';
          const currency = kind === 'salary' ? 'salaryCurrency' : 'feeCurrency';
          return <div className="contents" key={kind}>
            <label className="field">{t(kind === 'salary' ? 'requestSalary' : 'requestFee')}<input name={amount} inputMode="decimal" maxLength={19} defaultValue={request?.[amount] ?? ''} /></label>
            <label className="field">{t(kind === 'salary' ? 'requestSalaryCurrency' : 'requestFeeCurrency')}<select name={currency} defaultValue={request?.[currency] ?? ''}><option value="">{t('select')}</option>
              {marketCurrencies.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>;
        })}
      </div>
      <p className="text-xs muted">{t('requestListFields')}</p>
      {(['preferredCountries', 'preferredLeagues', 'tags'] as const).map(field => <label key={field} className="field">
        {t(field === 'preferredCountries' ? 'requestCountries' : field === 'preferredLeagues' ? 'requestLeagues' : 'tags')}
        <input name={field} maxLength={2400} defaultValue={request?.[field]?.join(', ')} />
      </label>)}
      <label className="field">{t('requestProfile')}<textarea name="profileText" rows={3} maxLength={4000} defaultValue={request?.profileText} /></label>
      {invalid && <p className="error" role="alert">{t('invalid')}</p>}
      {save.isError && <RequestError error={save.error} />}
      <div className="form-footer"><button className="secondary" type="button" onClick={onClose}>{t('cancel')}</button>
        <button className="primary" disabled={save.isPending}>{t(request ? 'save' : 'create')}</button></div>
    </form>
  </Modal>;
}

export function RequestSummary({ request }: { request: RequestRecord }) {
  const { t, i18n } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [page, setPage] = useState(1);
  const suggestions = useQuery({ queryKey: ['request-suggestions', request.id, page], queryFn: () =>
    api<{ items: RequestSuggestion[]; more: boolean }>(`/api/requests/${request.id}/suggestions?page=${page}`) });
  const criteria = [
    ['position', t(request.position)], ['requestAgeMin', request.ageMin], ['requestAgeMax', request.ageMax],
    ['requestFoot', request.preferredFoot && t(footLabels[request.preferredFoot])],
    ['requestEu', request.euRequired == null ? null : t(request.euRequired ? 'requestNeeded' : 'cardNo')],
    ['requestCountries', request.preferredCountries?.join(', ')], ['requestLeagues', request.preferredLeagues?.join(', ')],
    ['requestSalary', request.salaryMax && request.salaryCurrency ? formatMarketAmount(request.salaryMax, request.salaryCurrency, i18n.language) : null],
    ['requestFee', request.feeMax && request.feeCurrency ? formatMarketAmount(request.feeMax, request.feeCurrency, i18n.language) : null],
    ['tags', request.tags?.join(', ')],
  ] as const;
  return <section className="panel panel-body my-5 space-y-4">
    <div className="flex flex-wrap gap-2 justify-between items-center">
      <div className="flex flex-wrap gap-3"><RecordLink kind="Club" record={request.club} /><RecordLink kind="Person" record={request.requester} />
        <Badge value={request.priority} />{request.deadline && <span className="muted">{requestDay(request.deadline, i18n.language)}</span>}</div>
      <button className="secondary" onClick={() => setEdit(true)}>{t('requestEdit')}</button>
    </div>
    <dl className="grid sm:grid-cols-2 gap-2">{criteria.map(([label, value]) => value != null && value !== '' && <div className="break-words" key={label}>
      <dt className="muted text-xs">{t(label)}</dt><dd>{value}</dd>
    </div>)}</dl>
    {request.profileText && <p className="whitespace-pre-wrap break-words">{request.profileText}</p>}
    <h2>{t('requestSuggestions')}</h2>
    {suggestions.isError && <ErrorMessage />}
    {suggestions.isPending && <p role="status" className="muted">{t('loading')}</p>}
    {suggestions.data && (suggestions.data.items.length ? <ul className="divide-y">{suggestions.data.items.map(item => <li className="py-3" key={item.id}>
      <p className="flex flex-wrap gap-3"><RecordLink kind="Player" record={item.player} /><RecordLink kind="Club" record={item.club} /><RecordLink kind="Person" record={item.person} /></p>
      <p className="muted text-sm mt-1">{requestDay(item.date, i18n.language)} · {item.matchScore === null ? t('requestNoSuggestionScore') : t('matchScoreValue', { score: item.matchScore })}</p>
      <p className="whitespace-pre-wrap break-words mt-1">{item.whyGoodTransfer}</p>
    </li>)}</ul> : <p className="muted">{t('empty')}</p>)}
    {(page > 1 || suggestions.data?.more) && <div className="flex gap-2">
      <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
      <button className="secondary" disabled={!suggestions.data?.more} onClick={() => setPage(page + 1)}>{t('next')}</button>
    </div>}
    {edit && <RequestEditor request={request} onClose={() => setEdit(false)} />}
  </section>;
}
