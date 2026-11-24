import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Handshake, ExternalLink, ArrowUpRight } from 'lucide-react';
import { brandFields, brandContactFields, type BrandContact, type BrandInput, type BrandRecord } from '../shared/sponsorship';
import { api, ApiError, body } from './api';
import { Empty, ErrorMessage, Modal } from './components';
import { RecordPicker } from './presentations';
import { PipelineWorkspace } from './sponsorship-pipeline';

function BrandError({ error }: { error: Error | null }) { const { t } = useTranslation(); return error && <div className="error" role="alert"><p>{t(error instanceof ApiError && error.code === 'BRAND_CONTACT_IN_TRASH' ? 'brandContactInTrash' : error instanceof ApiError && error.code === 'BRAND_CONTACT_EXISTS' ? 'brandContactExists' : error instanceof ApiError && error.status === 409 ? 'brandConflict' : 'brandInvalid')}</p>{error instanceof ApiError && error.code === 'BRAND_CONTACT_IN_TRASH' && <Link className="text-accent" to="/trash">{t('trash')}</Link>}</div>; }
function useBrandSuccess<T>(saved: (value: T) => Promise<void>) {
  const active = useRef(true); const client = useQueryClient();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return async (value: T) => {
    await Promise.all(['brands', 'brand', 'brand-contacts', 'brand-timeline', 'trash'].map(key => client.invalidateQueries({ queryKey: [key] })));
    if (active.current) await saved(value);
  };
}
export function Sponsorship() {
  const { t } = useTranslation(); const [params, setParams] = useSearchParams(); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [adding, setAdding] = useState(false);
  const client = useQueryClient(); const id = params.get('brand');
  const brands = useQuery({ queryKey: ['brands', q, page], queryFn: () => api<{ items: BrandRecord[]; total: number }>(`/api/brands?${new URLSearchParams({ q, page: String(page) })}`) });
  const selected = useQuery({ queryKey: ['brand', id], enabled: !!id, queryFn: () => api<BrandRecord>(`/api/brands/${id}`) });
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['brands'] }), client.invalidateQueries({ queryKey: ['brand'] }), client.invalidateQueries({ queryKey: ['brand-contacts'] }), client.invalidateQueries({ queryKey: ['brand-timeline'] })]); }
  return <>
    <header className="flex justify-between items-start gap-4 flex-wrap"><div><p className="muted mb-2">{t('brandDirectory')}</p><h1 className="flex items-center gap-3"><Handshake className="text-accent" />{t('sponsorship')}</h1><p className="muted mt-3 max-w-2xl">{t('brandIntro')}</p></div><button className="primary" onClick={() => setAdding(true)}>{t('brandAdd')}</button></header>
    <PipelineWorkspace />
    <label className="field my-6">{t('searchLabel')}<input value={q} maxLength={100} onChange={event => { setQ(event.target.value); setPage(1); }} /></label>
    {brands.isError && <ErrorMessage />}{brands.isPending && <p role="status">{t('loading')}</p>}
    {brands.data && <><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{brands.data.items.map(row => <button className="panel panel-body text-left" key={row.id} onClick={() => setParams({ brand: row.id })}><div className="flex justify-between gap-3"><strong className="text-lg">{row.name}</strong><ArrowUpRight size={18} className="text-accent shrink-0" /></div><p className="muted my-3">{row.sector || t('brandUnknown')}</p><div className="flex gap-3 justify-between flex-wrap text-sm"><span className="badge">{t(row.relationStatus)}</span><span className="muted">{t('brandContactCount', { count: row.contactCount })}</span></div>{row.isExample && <small className="block muted mt-3">{t('example')}</small>}</button>)}</div>{!brands.data.items.length && <Empty />}<div className="pagination mt-4"><span>{t('page', { page, total: brands.data.total })}</span><div className="flex gap-2"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= brands.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div></div></>}
    {id && <section className="panel panel-body mt-6" aria-label={t('brandDirectory')}><button className="secondary mb-4" onClick={() => setParams({})}>{t('close')}</button>{selected.isError && <ErrorMessage />}{selected.data && <BrandPanel key={id} row={selected.data} refresh={refresh} deleted={() => { setParams({}); void refresh(); }} />}</section>}
    {adding && <BrandEditor close={() => setAdding(false)} saved={async row => { setAdding(false); setParams({ brand: row.id }); await refresh(); }} />}
  </>;
}
function BrandPanel({ row, refresh, deleted }: { row: BrandRecord; refresh: () => Promise<void>; deleted: () => void }) {
  const { t, i18n } = useTranslation(); const [editor, setEditor] = useState(false); const [contact, setContact] = useState<BrandContact | 'new'>(); const [remove, setRemove] = useState<BrandContact | 'brand'>(); const [page, setPage] = useState(1);
  const contacts = useQuery({ queryKey: ['brand-contacts', row.id, page], queryFn: () => api<{ items: BrandContact[]; total: number }>(`/api/brands/${row.id}/contacts?page=${page}`) });
  const timeline = useQuery({ queryKey: ['brand-timeline', row.id], queryFn: () => api<{ id: string; createdAt: string; summaryTr: string; summaryEn: string }[]>(`/api/brands/${row.id}/timeline`) });
  const day = (value: string) => new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  return <><h2>{row.name}</h2><p className="muted my-3">{row.sector || t('brandUnknown')} · {t(row.relationStatus)}</p>{row.website && <a className="text-accent inline-flex gap-2 items-center" href={row.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{t('brandOpenWebsite')}</a>}
    <div className="flex gap-3 my-5 flex-wrap"><button className="secondary" onClick={() => setEditor(true)}>{t('brandEdit')}</button><button className="secondary" onClick={() => setRemove('brand')}>{t('brandDelete')}</button></div>
    <div className="flex justify-between gap-3 items-center flex-wrap my-4"><h3>{t('brandContacts')}</h3><button className="primary" onClick={() => setContact('new')}>{t('brandContactAdd')}</button></div>
    {contacts.isError && <ErrorMessage />}{contacts.data && <>{!contacts.data.items.length ? <Empty /> : <div className="grid md:grid-cols-2 gap-3">{contacts.data.items.map(link => <article className="panel panel-body" key={link.id}><Link to={`/record/Person/${link.person.id}`} className="text-accent font-semibold">{link.person.name}</Link><p className="my-2">{link.roleTitle || t('brandUnknown')}</p>{link.startDate && <p className="muted text-sm">{t('brandContactStart')}: {day(link.startDate)}</p>}{link.endDate && <p className="muted text-sm">{t('brandContactEnd')}: {day(link.endDate)}</p>}<div className="flex gap-2 flex-wrap mt-4"><button className="secondary" onClick={() => setContact(link)}>{t('brandContactEdit')}</button><button className="secondary" onClick={() => setRemove(link)}>{t('brandContactRemove')}</button></div></article>)}</div>}<div className="flex gap-2 my-4"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= contacts.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div></>}
    <h3 className="mt-6">{t('brandTimeline')}</h3>{timeline.isError && <ErrorMessage />}{timeline.data?.map(event => <p className="my-3 text-sm muted" key={event.id}>{i18n.language === 'tr' ? event.summaryTr : event.summaryEn}</p>)}
    {editor && <BrandEditor row={row} close={() => setEditor(false)} saved={async () => { setEditor(false); await refresh(); }} />}
    {contact && <ContactEditor brand={row} row={contact === 'new' ? undefined : contact} close={() => setContact(undefined)} saved={async () => { setContact(undefined); await refresh(); }} />}
    {remove && <RemoveBrandLink brand={row} contact={remove === 'brand' ? undefined : remove} close={() => setRemove(undefined)} saved={async () => { setRemove(undefined); if (remove === 'brand') deleted(); else await refresh(); }} />}
  </>;
}
function BrandEditor({ row: current, close, saved }: { row?: BrandRecord; close: () => void; saved: (row: BrandRecord) => Promise<void> }) {
  const [row] = useState(current); const onSuccess = useBrandSuccess(saved);
  const { t } = useTranslation(); const [value, setValue] = useState<BrandInput>(() => row ? { name: row.name, sector: row.sector, website: row.website, relationStatus: row.relationStatus } : { name: '', sector: '', website: null, relationStatus: 'NEW' }); const [example, setExample] = useState(false); const [invalid, setInvalid] = useState(false);
  const mutation = useMutation({ mutationFn: () => api<BrandRecord>(row ? `/api/brands/${row.id}` : '/api/brands', { method: row ? 'PATCH' : 'POST', body: body(row ? { version: row.version, changes: value } : { ...value, isExample: example }) }), onSuccess });
  function submit(event: FormEvent) { event.preventDefault(); if (!brandFields.safeParse(value).success) { setInvalid(true); return; } setInvalid(false); mutation.mutate(); }
  return <Modal title={t(row ? 'brandEdit' : 'brandAdd')} onClose={close}><form onSubmit={submit}><label className="field">{t('brandName')}<input required minLength={2} maxLength={160} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} /></label><label className="field">{t('brandSector')}<input maxLength={100} value={value.sector} onChange={event => setValue({ ...value, sector: event.target.value })} /></label><label className="field">{t('brandWebsite')}<input type="url" maxLength={2000} value={value.website ?? ''} onChange={event => setValue({ ...value, website: event.target.value || null })} /></label><label className="field">{t('brandRelationship')}<select value={value.relationStatus} onChange={event => setValue({ ...value, relationStatus: event.target.value as BrandInput['relationStatus'] })}>{['NEW', 'WARM', 'ACTIVE', 'COLD'].map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label>{!row && <label className="flex gap-2 my-4"><input type="checkbox" checked={example} onChange={event => setExample(event.target.checked)} />{t('brandExample')}</label>}{invalid && <p className="error" role="alert">{t('brandInvalid')}</p>}<BrandError error={mutation.error} /><button className="primary mt-4" disabled={mutation.isPending}>{t('save')}</button></form></Modal>;
}
function ContactEditor({ brand: currentBrand, row: currentRow, close, saved }: { brand: BrandRecord; row?: BrandContact; close: () => void; saved: () => Promise<void> }) {
  const [brand] = useState(currentBrand); const [row] = useState(currentRow); const onSuccess = useBrandSuccess(saved);
  const { t } = useTranslation(); const [person, setPerson] = useState(row?.person); const [details, setDetails] = useState(() => ({ roleTitle: row?.roleTitle ?? '', startDate: row?.startDate ?? null, endDate: row?.endDate ?? null })); const [invalid, setInvalid] = useState(false);
  const mutation = useMutation({ mutationFn: () => api(`/api/brands/${brand.id}/contacts${row ? `/${row.id}` : ''}`, { method: row ? 'PATCH' : 'POST', body: body(row ? { version: row.version, brandVersion: brand.version, details } : { version: brand.version, personId: person?.id, details }) }), onSuccess });
  return <Modal title={t(row ? 'brandContactEdit' : 'brandContactAdd')} onClose={close}><form onSubmit={event => { event.preventDefault(); if (!person || !brandContactFields.safeParse(details).success) { setInvalid(true); return; } setInvalid(false); mutation.mutate(); }}>
    {row ? <p className="mb-4">{row.person.name}</p> : <RecordPicker type="Person" value={person} onChange={setPerson} />}
    <label className="field">{t('brandContactRole')}<input maxLength={100} value={details.roleTitle} onChange={event => setDetails({ ...details, roleTitle: event.target.value })} /></label>
    <label className="field">{t('brandContactStart')}<input type="date" min="0001-01-01" max="9999-12-31" value={details.startDate ?? ''} onChange={event => setDetails({ ...details, startDate: event.target.value || null })} /></label>
    <label className="field">{t('brandContactEnd')}<input type="date" min="0001-01-01" max="9999-12-31" value={details.endDate ?? ''} onChange={event => setDetails({ ...details, endDate: event.target.value || null })} /></label>
    {invalid && <p className="error" role="alert">{t('brandInvalid')}</p>}<BrandError error={mutation.error} /><button className="primary mt-4" disabled={mutation.isPending}>{t('save')}</button>
  </form></Modal>;
}
function RemoveBrandLink({ brand: currentBrand, contact: currentContact, close, saved }: { brand: BrandRecord; contact?: BrandContact; close: () => void; saved: () => Promise<void> }) {
  const [brand] = useState(currentBrand); const [contact] = useState(currentContact); const onSuccess = useBrandSuccess(saved);
  const { t } = useTranslation(); const mutation = useMutation({ mutationFn: () => api(`/api/brands/${brand.id}${contact ? `/contacts/${contact.id}` : ''}`, { method: 'DELETE', body: body(contact ? { version: contact.version, brandVersion: brand.version } : { version: brand.version }) }), onSuccess });
  return <Modal title={t(contact ? 'brandContactRemove' : 'brandDelete')} onClose={close}><p className="mb-3">{contact?.person.name ?? brand.name}</p><p>{t(contact ? 'brandContactRemoveHelp' : 'brandDeleteHelp')}</p><BrandError error={mutation.error} /><button className="primary mt-4" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{t(contact ? 'brandContactRemove' : 'brandDelete')}</button></Modal>;
}
