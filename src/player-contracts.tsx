import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { contractInput, contractPatch, contractThresholds, type ContractRecord } from '../shared/player-contracts';
import { isoDate, istanbulToday } from '../shared/domain';
import { marketCurrencies } from '../shared/player-market';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import { AttachmentPanel } from './files';

type Named = { id: string; name: string };
type Item = Named & { version: number; type: string; startDate: string; endDate: string; isActive: boolean; player: Named; club: Named | null; agent: Named | null };
type Group = 'releaseClause' | 'buyout' | 'extensionOption' | 'representation';
const groups: Group[] = ['releaseClause', 'buyout', 'extensionOption', 'representation'];
const contractTypes = ['EMPLOYMENT', 'REPRESENTATION', 'OTHER'];
function displayDay(value: string | null | undefined, language: string) {
  return value && Number.isFinite(new Date(value).getTime()) && isoDate.safeParse(value.slice(0, 10)).success ? new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric',
  }).format(new Date(value)) : value ?? '';
}
function Failure({ error }: { error: unknown }) { const { t } = useTranslation(); return <p role="alert" className="error">{t(error instanceof ApiError && error.status === 409 ? 'contractConflict' : 'contractInvalid')}</p>; }
function ExternalValue({ value }: { value: string | null }) {
  const url = value && URL.canParse(value) ? new URL(value) : null;
  return url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? <a href={value!} className="text-accent" target="_blank" rel="noopener noreferrer">{value}</a> : <>{value}</>;
}
export function PlayerContracts({ id }: { id: string }) { const { t } = useTranslation(); return <section className="panel panel-body mt-5"><h2>{t('contracts')}</h2><p className="notice my-3">{t('contractStatement')}</p><Link className="secondary" to={`/contracts?playerId=${id}`}>{t('contracts')}</Link></section>; }
export function Contracts() {
  const { t, i18n } = useTranslation(); const [params] = useSearchParams(); const [page, setPage] = useState(1);
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [active, setActive] = useState(''); const [create, setCreate] = useState(false);
  const playerId = params.get('playerId');
  const player = useQuery({ queryKey: ['contract-player', playerId], enabled: !!playerId, queryFn: () => api<Named>(`/api/records/Player/${playerId}`) });
  const query = useQuery({ queryKey: ['contracts', page, q, active, playerId], queryFn: () => api<{ items: Item[]; total: number }>(`/api/contracts?${new URLSearchParams({ page: String(page), q, ...(active ? { active } : {}), ...(playerId ? { playerId } : {}) })}`) });
  return <>
    <div className="flex justify-between gap-3"><h1>{t('contracts')}</h1><button className="primary" onClick={() => setCreate(true)}>{t('contractAdd')}</button></div>
    <p className="notice my-4">{t('contractStatement')}</p><p className="subtitle mb-4">{t('contractPlayerHelp')}</p>
    {player.data && <Link className="text-accent" to={`/record/Player/${player.data.id}`}>{player.data.name}</Link>}
    <form className="flex flex-wrap gap-3 items-end my-4" onSubmit={event => { event.preventDefault(); setQ(search); setPage(1); }}>
      <label className="field flex-1">{t('searchLabel')}<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
      <label className="field">{t('status')}<select value={active} onChange={event => { setActive(event.target.value); setPage(1); }}>
        <option value="">{t('contractActiveAll')}</option><option value="true">{t('contractActiveOnly')}</option><option value="false">{t('contractInactiveOnly')}</option>
      </select></label><button className="secondary">{t('searchLabel')}</button>
    </form>
    {query.isPending && <p role="status">{t('loading')}</p>}{(query.isError || player.isError) && <ErrorMessage />}
    {query.data && (!query.data.items.length ? <Empty /> : <div className="panel table-wrap"><table><thead><tr>{['contract_name', 'player', 'contractCounterpart', 'contract_endDate', 'contract_isActive'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
      <tbody>{query.data.items.map(row => <tr key={row.id}><td><Link className="text-accent" to={`/contracts/${row.id}`}>{row.name}</Link></td><td>{row.player.name}</td><td>{row.club?.name ?? row.agent?.name ?? t('select')}</td><td>{displayDay(row.endDate, i18n.language)}</td><td>{t(row.isActive ? 'contractMet_YES' : 'contractMet_NO')}</td></tr>)}</tbody></table></div>)}
    <div className="flex gap-3 my-4"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= (query.data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
    <ContractReminders />{create && <ContractEditor initialPlayer={player.data} onClose={() => setCreate(false)} />}
  </>;
}
export function ContractDetail() {
  const { id } = useParams(); const { t } = useTranslation();
  const query = useQuery({ queryKey: ['contract', id], queryFn: () => api<ContractRecord>(`/api/contracts/${id}`) });
  return query.isPending ? <p role="status">{t('loading')}</p> : query.isError ? <ErrorMessage /> : <ContractView key={id} record={query.data} />;
}
function ContractView({ record }: { record: ContractRecord }) {
  const { t, i18n } = useTranslation(); const client = useQueryClient(); const navigate = useNavigate();
  const [edit, setEdit] = useState<ContractRecord>(); const [remove, setRemove] = useState<number>();
  const deletion = useMutation({ mutationFn: () => api(`/api/contracts/${record.id}`, { method: 'DELETE', body: body({ version: remove }) }), onSuccess: () => { void client.invalidateQueries(); navigate('/contracts'); } });
  const timeline = useQuery({ queryKey: ['contract-timeline', record.id], queryFn: () => api<{ id: string; summaryTr: string; summaryEn: string }[]>(`/api/contracts/${record.id}/timeline`) });
  function renderValue(key: string, value: unknown): ReactNode {
    const text = String(value ?? '');
    if (key === 'type' && contractTypes.includes(text)) return t(`contractType_${text}`);
    if (key === 'salaryPeriod' && ['YEAR', 'MONTH', 'WEEK', 'DAY', 'ONE_OFF'].includes(text)) return t(`contractPeriod_${text}`);
    if (key === 'salaryBasis' && ['GROSS', 'NET'].includes(text)) return t(`contractBasis_${text}`);
    if (key === 'sourceUrl' || key === 'documentLink') return <ExternalValue value={text} />;
    return text;
  }
  return <>
    <Link className="text-accent" to="/contracts">{t('contracts')}</Link><div className="flex flex-wrap justify-between gap-3 my-4"><h1>{record.name}</h1><div className="flex gap-2"><button className="primary" onClick={() => setEdit(record)}>{t('contractEdit')}</button><button className="secondary" onClick={() => setRemove(record.version)}>{t('delete')}</button></div></div>
    <p className="notice mb-4">{t('contractStatement')}</p><Link className="text-accent" to={`/record/Player/${record.player.id}`}>{record.player.name}</Link>
    <section className="panel panel-body mt-4"><h2>{t('contractIdentity')}</h2><dl className="grid md:grid-cols-2 gap-4 my-4">
      {(['type', 'signedDate', 'startDate', 'endDate', 'isActive', 'paymentDay', 'noticeDeadline', 'salaryCurrency', 'salaryPeriod', 'salaryBasis', 'sourceUrl', 'sourceDate', 'methodNote', 'documentLink'] as const).map(key => <div key={key}><dt className="muted text-sm">{t(`contract_${key}`)}</dt><dd className="break-words">{typeof record[key] === 'boolean' ? t(record[key] ? 'contractMet_YES' : 'contractMet_NO') : key.endsWith('Date') || key === 'noticeDeadline' ? displayDay(record[key] as string | null, i18n.language) : renderValue(key, record[key])}</dd></div>)}
      <div><dt>{t('contractCounterpart')}</dt><dd>{record.club ? <Link to={`/record/Club/${record.club.id}`}>{record.club.name}</Link> : record.agent?.name}</dd></div>
    </dl>
      {record.endDate < istanbulToday() && <p className="notice mb-3">{t('contractOverdue')}</p>}
      {(!record.sourceUrl || !record.sourceDate || !record.methodNote) && <p className="notice mb-3">{t('contractMissingSource')}</p>}
      <div className="grid md:grid-cols-3 gap-4">{(['salaryAmount', 'bonuses', 'compliance'] as const).map(field => <ContractPrivate key={`${record.id}:${record.version}:${field}`} record={record} field={field} />)}</div>
    </section>
    {groups.map(group => <section className="panel panel-body mt-4" key={group}><h2>{t(`contract_${group}`)}</h2>{record.legacyGroups.includes(group) && <p className="notice my-3">{t('contractLegacy')}</p>}<ContractTerms value={record[group]} /></section>)}
    <section className="panel panel-body mt-4"><h2>{t('contractDeadlineTitle')}</h2>{record.dates.issues.map(issue => <p className="notice my-2" key={issue.field}>{t('contractDateIssue', { field: t(`contract_${issue.field}`) })}</p>)}
      {!!record.dates.skippedPaymentMonths.length && <p className="notice my-3">{t('contractSkippedMonths', { months: record.dates.skippedPaymentMonths.join(', ') })}</p>}
      {record.dates.deadlines.map(row => <div className="list-line" key={`${row.kind}:${row.date}`}><span>{t(`contractRule_${row.kind}`)}</span><span>{displayDay(row.date, i18n.language)}</span></div>)}
    </section>
    <ContractNotes id={record.id} /><AttachmentPanel type="Contract" id={record.id} />
    <section className="panel panel-body mt-4"><h2>{t('timeline')}</h2>{timeline.isError && <ErrorMessage />}{timeline.data?.map(event => <p className="list-line" key={event.id}>{i18n.language === 'tr' ? event.summaryTr : event.summaryEn}</p>)}</section>
    {edit && <ContractEditor key={`${edit.id}:${edit.version}`} record={edit} onClose={() => setEdit(undefined)} />}
    {remove !== undefined && <Modal title={t('delete')} onClose={() => setRemove(undefined)}><p>{t('deleteConfirm')}</p>{deletion.isError && <Failure error={deletion.error} />}<div className="form-footer"><button className="secondary" onClick={() => setRemove(undefined)}>{t('cancel')}</button><button className="danger" disabled={deletion.isPending} onClick={() => deletion.mutate()}>{t('delete')}</button></div></Modal>}
  </>;
}
function ContractTerms({ value }: { value: unknown }) {
  const { t, i18n } = useTranslation();
  const entries = value && typeof value === 'object' ? Object.entries(value) : [];
  if (!entries.length) return <Empty />;
  return <dl>{entries.map(([key, field]) => <div className="list-line" key={key}>
    <dt className="muted">{t(`contract_${key}`)}</dt><dd className="whitespace-pre-wrap break-words">{field === null ? ''
      : key === 'met' && ['YES', 'NO', 'UNKNOWN'].includes(String(field)) ? t(`contractMet_${field}`)
      : /Date|validFrom|validTo|deadline/.test(key) ? displayDay(String(field), i18n.language) : String(field)}</dd>
  </div>)}</dl>;
}
function ContractPrivate({ record, field }: { record: ContractRecord; field: 'salaryAmount' | 'bonuses' | 'compliance' }) {
  const { t, i18n } = useTranslation(); const timer = useRef<ReturnType<typeof setTimeout>>();
  const view = useMutation({ gcTime: 0, mutationFn: () => api<{ value?: string | null; minor?: boolean | null; status?: string; checkpoints?: { id: string; text: { tr: string; en: string }; version: string }[]; expiresIn: number }>(`/api/contracts/${record.id}/reveal`, { method: 'POST', body: body({ version: record.version, field }) }), onSuccess: data => { clearTimeout(timer.current); timer.current = setTimeout(() => view.reset(), data.expiresIn * 1000); } });
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = t(field === 'compliance' ? 'contractCompliance' : `contract_${field}`);
  return <div className="panel panel-body"><h3>{label}</h3>{view.data ? <>
    {field === 'compliance' ? <><p className="my-3">{t(view.data.minor === null ? 'contractUnknownAge' : view.data.minor ? 'contractMinor' : 'contractAdult')}</p>{view.data.status === 'NOT REVIEWED' && <p className="notice">{t('contractUnreviewed')}</p>}{view.data.checkpoints?.map(rule => <div key={rule.id}><p className="my-2">{rule.text[i18n.language === 'tr' ? 'tr' : 'en']}</p><small>{t('contractVersion', { version: rule.version })}</small></div>)}</> : <p className="my-3 whitespace-pre-wrap break-words">{view.data.value}</p>}
    <button className="secondary mt-3" onClick={() => { clearTimeout(timer.current); view.reset(); }}>{t('hide')}</button>
  </> : <><p className="my-3">{field === 'compliance' ? t('private') : record[field]}</p><button className="secondary" disabled={view.isPending} onClick={() => view.mutate()}>{field === 'compliance' ? label : t('reveal')}</button></>}{view.isError && <Failure error={view.error} />}</div>;
}
function ContractPicker({ kind, value, onChange, optional = false }: { kind: 'Player' | 'Club' | 'Agent'; value?: Named; onChange: (value?: Named) => void; optional?: boolean }) {
  const { t } = useTranslation(); const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const query = useQuery({ queryKey: ['contract-picker', kind, q], queryFn: async () => {
    if (kind === 'Player') { const rows = await Promise.all(['OWN', 'INTERMEDIARY'].map(status => api<{ items: Named[] }>(`/api/players?status=${status}&q=${encodeURIComponent(q)}`))); return { items: rows.flatMap(row => row.items) }; }
    return api<{ items: Named[] }>(`/api/${kind === 'Agent' ? 'calendar/agents' : 'clubs'}?q=${encodeURIComponent(q)}`);
  } });
  const label = t(kind === 'Agent' ? 'contractAgent' : kind);
  return <div className="my-3"><div className="flex gap-2 items-end"><label className="field flex-1">{t('presentationSearchRecord', { type: label })}<input value={search} onChange={event => setSearch(event.target.value)} maxLength={100} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setQ(search); } }} /></label><button type="button" className="secondary" onClick={() => setQ(search)}>{t('searchLabel')}</button></div>
    <label className="field">{label}<select required={!optional} value={value?.id ?? ''} onChange={event => onChange(query.data?.items.find(row => row.id === event.target.value))}><option value="">{t('select')}</option>{value && !query.data?.items.some(row => row.id === value.id) && <option value={value.id}>{value.name}</option>}{query.data?.items.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{query.isError && <ErrorMessage />}</div>;
}
function EditGroup({ name, editing, children }: { name: string; editing: boolean; children: ReactNode }) {
  const { t } = useTranslation(); const [mode, setMode] = useState(editing ? 'keep' : 'clear');
  return <fieldset className="border border-line rounded-xl p-4 my-4"><legend className="px-2">{t(`contract_${name}`)}</legend><label className="field">{t('contractMode', { field: t(`contract_${name}`) })}<select name={`${name}Mode`} value={mode} onChange={event => setMode(event.target.value)}>{editing && <option value="keep">{t('contractKeep')}</option>}<option value="replace">{t('contractReplace')}</option><option value="clear">{t('contractClear')}</option></select></label><fieldset disabled={mode !== 'replace'} className="grid md:grid-cols-2 gap-x-4">{children}</fieldset></fieldset>;
}
function ContractEditor({ record, initialPlayer, onClose }: { record?: ContractRecord; initialPlayer?: Named; onClose: () => void }) {
  const { t } = useTranslation(); const client = useQueryClient(); const navigate = useNavigate(); const [invalid, setInvalid] = useState(false);
  const [player, setPlayer] = useState<Named | undefined>(record?.player ?? initialPlayer);
  const [party, setParty] = useState<'none' | 'Club' | 'Agent'>(record?.club ? 'Club' : record?.agent ? 'Agent' : 'none');
  const [counterpart, setCounterpart] = useState<Named | undefined>(record?.club ?? record?.agent ?? undefined);
  const save = useMutation({ mutationFn: (data: unknown) => api<{ id: string }>(record ? `/api/contracts/${record.id}` : `/api/players/${player!.id}/contracts`, { method: record ? 'PATCH' : 'POST', body: body(data) }), onSuccess: result => { void client.invalidateQueries(); onClose(); navigate(`/contracts/${result.id}`); } });
  const defaultValue = (key: string) => {
    if (key === 'salaryAmount' || key === 'bonuses') return '';
    const [group, sub] = key.split('.'); const root = (record as unknown as Record<string, unknown> | undefined)?.[group];
    const value = sub && root && typeof root === 'object' ? (root as Record<string, unknown>)[sub] : root;
    return typeof value === 'string' || typeof value === 'number' ? value : '';
  };
  function input(key: string, type = 'text', required = false) {
    return <label className="field" key={key}>{t(`contract_${key.split('.').at(-1)}`)}<input name={key} type={type} required={required} defaultValue={key === 'sourceDate' && !record ? istanbulToday() : defaultValue(key)}
      maxLength={key === 'methodNote' ? 1000 : type === 'url' ? 2048 : key === 'name' ? 160 : 4000} {...(key === 'paymentDay' ? { min: 1, max: 31, step: 1 } : {})} /></label>;
  }
  function options(key: string, values: readonly string[], prefix?: string) { return <label className="field" key={key}>{t(`contract_${key.split('.').at(-1)}`)}<select name={key} defaultValue={defaultValue(key)} required={key.startsWith('salary')}><option value="">{t('select')}</option>{values.map(value => <option key={value} value={value}>{prefix ? t(`${prefix}_${value}`) : value}</option>)}</select></label>; }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const text = (key: string) => String(data.get(key) ?? '').trim(); const nullable = (key: string) => text(key) || null;
    if (['salaryAmount', 'bonuses'].some(key => text(`${key}Mode`) === 'replace' && !text(key))) { setInvalid(true); return; }
    const fields: Record<string, unknown> = { name: text('name'), type: text('type'), startDate: text('startDate'), endDate: text('endDate'), isActive: data.has('isActive'),
      signedDate: nullable('signedDate'), noticeDeadline: nullable('noticeDeadline'), paymentDay: text('paymentDay') ? Number(text('paymentDay')) : null,
      sourceUrl: nullable('sourceUrl'), sourceDate: nullable('sourceDate'), methodNote: nullable('methodNote'), documentLink: nullable('documentLink'),
      clubId: party === 'Club' ? counterpart?.id ?? null : null, agentId: party === 'Agent' ? counterpart?.id ?? null : null,
    };
    for (const key of ['salaryAmount', 'bonuses', ...groups]) {
      const mode = text(`${key}Mode`); if (mode === 'keep') continue;
      if (key === 'salaryAmount') {
        fields.salaryAmount = mode === 'clear' ? null : nullable('salaryAmount');
        if (mode === 'replace' || !record) for (const name of ['salaryCurrency', 'salaryPeriod', 'salaryBasis']) fields[name] = mode === 'clear' ? null : nullable(name);
      } else if (key === 'bonuses') fields.bonuses = mode === 'clear' ? null : nullable('bonuses');
      else if (mode === 'clear') fields[key] = null;
      else if (key === 'releaseClause' || key === 'buyout') fields[key] = { amount: nullable(`${key}.amount`), currency: nullable(`${key}.currency`), validFrom: nullable(`${key}.validFrom`), validTo: nullable(`${key}.validTo`), conditions: text(`${key}.conditions`), met: text(`${key}.met`) || 'UNKNOWN' };
      else if (key === 'extensionOption') fields[key] = { deadline: nullable(`${key}.deadline`), terms: text(`${key}.terms`) };
      else fields[key] = { scope: text(`${key}.scope`), startDate: nullable(`${key}.startDate`), endDate: nullable(`${key}.endDate`), commissionRate: nullable(`${key}.commissionRate`), paymentTerms: text(`${key}.paymentTerms`) };
    }
    const changes = record ? Object.fromEntries(Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify((record as unknown as Record<string, unknown>)[key]))) : fields;
    const parsed = record ? contractPatch.safeParse({ version: record.version, changes }) : contractInput.safeParse(fields);
    setInvalid(!parsed.success || !player || party !== 'none' && !counterpart); if (parsed.success && player && (party === 'none' || counterpart)) save.mutate(parsed.data);
  }
  return <Modal title={t(record ? 'contractEdit' : 'contractAdd')} onClose={onClose}><form onSubmit={submit}>
    <p className="notice mb-4">{t('contractStatement')}</p><p className="subtitle mb-4">{t('contractPlayerHelp')}</p>
    {record ? <p>{record.player.name}</p> : <ContractPicker kind="Player" value={player} onChange={setPlayer} />}
    <fieldset><legend>{t('contractIdentity')}</legend>{input('name', 'text', true)}<label className="field">{t('contract_type')}<select name="type" defaultValue={record?.type ?? 'EMPLOYMENT'}>{record && !contractTypes.includes(record.type) && <option value={record.type}>{record.type}</option>}{contractTypes.map(value => <option key={value} value={value}>{t(`contractType_${value}`)}</option>)}</select></label>
      <label className="field">{t('contractCounterpart')}<select value={party} onChange={event => { setParty(event.target.value as typeof party); setCounterpart(undefined); }}><option value="none">{t('select')}</option><option value="Club">{t('Club')}</option><option value="Agent">{t('contractAgent')}</option></select></label>{party !== 'none' && <ContractPicker key={party} kind={party} value={counterpart} onChange={setCounterpart} />}
    </fieldset>
    <fieldset className="mt-4"><legend>{t('contractDates')}</legend><div className="grid md:grid-cols-2 gap-x-4">{['signedDate', 'startDate', 'endDate', 'noticeDeadline'].map(key => input(key, 'date', key === 'startDate' || key === 'endDate'))}{input('paymentDay', 'number')}</div><p className="notice mb-3">{t('contractPaymentHelp')}</p><label className="field"><span><input type="checkbox" name="isActive" defaultChecked={record?.isActive ?? true} /> {t('contract_isActive')}</span></label></fieldset>
    <p className="notice my-4">{t('contractSecretHelp')}</p>
    <EditGroup name="salaryAmount" editing={!!record}>{input('salaryAmount', 'text', true)}{options('salaryCurrency', marketCurrencies)}{options('salaryPeriod', ['YEAR', 'MONTH', 'WEEK', 'DAY', 'ONE_OFF'], 'contractPeriod')}{options('salaryBasis', ['GROSS', 'NET'], 'contractBasis')}</EditGroup>
    <EditGroup name="bonuses" editing={!!record}><label className="field">{t('contract_bonuses')}<textarea name="bonuses" required maxLength={4000} /></label></EditGroup>
    {!!record?.legacyGroups.length && <p className="notice my-4">{t('contractLegacy')}</p>}
    {groups.map(group => <EditGroup key={group} name={group} editing={!!record}>{group === 'releaseClause' || group === 'buyout' ? <>{input(`${group}.amount`)}{options(`${group}.currency`, marketCurrencies)}{input(`${group}.validFrom`, 'date')}{input(`${group}.validTo`, 'date')}{input(`${group}.conditions`)}{options(`${group}.met`, ['YES', 'NO', 'UNKNOWN'], 'contractMet')}</> : group === 'extensionOption' ? <>{input(`${group}.deadline`, 'date')}{input(`${group}.terms`)}</> : <>{input(`${group}.scope`)}{input(`${group}.startDate`, 'date')}{input(`${group}.endDate`, 'date')}{input(`${group}.commissionRate`)}{input(`${group}.paymentTerms`)}</>}</EditGroup>)}
    <fieldset><legend>{t('contractSource')}</legend>{input('sourceUrl', 'url', !record || !!record.sourceUrl)}{input('sourceDate', 'date', !record || !!record.sourceDate)}{input('methodNote', 'text', !record || !!record.methodNote)}{input('documentLink', 'url')}</fieldset>
    {invalid && <p role="alert" className="error">{t('contractInvalid')}</p>}{save.isError && <Failure error={save.error} />}<div className="form-footer"><button type="button" className="secondary" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
  </form></Modal>;
}
function ContractNotes({ id }: { id: string }) {
  const { t } = useTranslation(); const client = useQueryClient(); const [text, setText] = useState(''); const [edit, setEdit] = useState<{ id: string; version: number }>();
  const query = useQuery({ queryKey: ['contract-notes', id], queryFn: () => api<{ id: string; version: number; text: string }[]>(`/api/contracts/${id}/notes`) });
  const save = useMutation({ mutationFn: () => api(`/api/contracts/${id}/notes${edit ? `/${edit.id}` : ''}`, { method: edit ? 'PATCH' : 'POST', body: body({ text, ...(edit ? { version: edit.version } : {}) }) }), onSuccess: () => { setText(''); setEdit(undefined); void client.invalidateQueries(); } });
  const remove = useMutation({ mutationFn: (note: { id: string; version: number }) => api(`/api/contracts/${id}/notes/${note.id}`, { method: 'DELETE', body: body({ version: note.version }) }), onSuccess: () => { void client.invalidateQueries(); } });
  return <section className="panel panel-body mt-4"><h2>{t('notes')}</h2><p className="subtitle my-3">{t('contractNotesHelp')}</p><form onSubmit={event => { event.preventDefault(); save.mutate(); }}><label className="field">{t(edit ? 'contractEditNote' : 'contractAddNote')}<textarea required maxLength={4000} value={text} onChange={event => setText(event.target.value)} /></label><button className="primary" disabled={save.isPending}>{t('save')}</button>{edit && <button type="button" className="secondary ml-2" onClick={() => { setEdit(undefined); setText(''); }}>{t('cancel')}</button>}</form>
    {query.isError && <ErrorMessage />}{save.isError && <Failure error={save.error} />}{remove.isError && <Failure error={remove.error} />}{query.data?.map(note => <div className="list-line flex-wrap gap-3" key={note.id}><p className="flex-1 whitespace-pre-wrap break-words">{note.text}</p><button className="secondary" onClick={() => { setText(note.text); setEdit(note); }}>{t('contractEditNote')}</button><button className="secondary" disabled={remove.isPending} onClick={() => remove.mutate(note)}>{t('delete')}</button></div>)}</section>;
}
function ContractReminders() {
  const { t, i18n } = useTranslation(); const client = useQueryClient(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['contract-reminders', page], queryFn: () => api<{ items: { id: string; entityId: string; name: string; type: string; targetDate: string; thresholdDays: number }[]; more: boolean }>(`/api/contracts/reminders?page=${page}`) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<{ version: number; notificationThresholds: number[] }>('/api/settings') });
  const refresh = useMutation({ mutationFn: () => api('/api/contracts/reminders', { method: 'POST' }), onSuccess: () => { void client.invalidateQueries(); } });
  return <section className="panel panel-body mt-6"><h2>{t('contractReminders')}</h2><p className="notice my-3">{t('contractReminderHelp')}</p>{settings.data && <ThresholdEditor key={settings.data.version} settings={settings.data} />}
    <button className="secondary my-3" disabled={refresh.isPending} onClick={() => refresh.mutate()}>{t('contractRefreshReminders')}</button>{(query.isError || refresh.isError || settings.isError) && <ErrorMessage />}
    {query.data?.items.map(row => <div className="list-line flex-wrap" key={row.id}><Link className="text-accent" to={`/contracts/${row.entityId}`}>{row.name}</Link><span>{t(`contractRule_${row.type.slice('CONTRACT_'.length)}`)} · {displayDay(row.targetDate, i18n.language)} · {t('contractThreshold', { days: row.thresholdDays })}</span></div>)}
    <div className="flex gap-3 my-3"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={!query.data?.more} onClick={() => setPage(page + 1)}>{t('next')}</button></div>
  </section>;
}
function ThresholdEditor({ settings }: { settings: { version: number; notificationThresholds: number[] } }) {
  const { t } = useTranslation(); const client = useQueryClient(); const [value, setValue] = useState(settings.notificationThresholds.join(',')); const [invalid, setInvalid] = useState(false);
  const save = useMutation({ mutationFn: (notificationThresholds: number[]) => api('/api/settings', { method: 'PATCH', body: body({ version: settings.version, notificationThresholds }) }), onSuccess: () => { void client.invalidateQueries(); } });
  return <form onSubmit={event => { event.preventDefault(); const parsed = contractThresholds.safeParse(value.trim() ? value.split(',').map(part => part.trim() ? Number(part) : NaN) : []); setInvalid(!parsed.success); if (parsed.success) save.mutate(parsed.data); }}><label className="field">{t('contractThresholds')}<input value={value} onChange={event => setValue(event.target.value)} placeholder={t('contractThresholdHint')} /></label><p className="subtitle mb-3">{t('contractThresholdHelp')}</p><button className="secondary" disabled={save.isPending}>{t('save')}</button>{invalid && <p className="error" role="alert">{t('contractInvalid')}</p>}{save.isError && <Failure error={save.error} />}</form>;
}
