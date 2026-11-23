import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FolderOpen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError, body } from './api';
import { Modal, ErrorMessage } from './components';
import { ImpactList, type Impact } from './admin';
import { externalResourceFields, externalResourceKinds, externalResourcePatch, type ExternalResourceInfo, type ExternalResources, type ExternalResourceView, type ResourceParent, type ResourceConnections } from '../shared/external-resources';

function useRefreshResources() {
  const client = useQueryClient();
  return () => { void client.invalidateQueries({ queryKey: ['resources'] }); void client.invalidateQueries({ queryKey: ['trash'] }); };
}
function ResourceItem({ row, parent }: { row: ExternalResourceInfo; parent?: ResourceParent }) {
  const { t } = useTranslation(); const refresh = useRefreshResources();
  const [editor, setEditor] = useState<ExternalResourceInfo>(); const [confirm, setConfirm] = useState<ExternalResourceInfo>(); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState<{ url: string; version: number; expiresAt: number }>();
  const [connections, setConnections] = useState(false);
  const generation = useRef(0); const controller = useRef<AbortController>(); const timer = useRef<ReturnType<typeof setTimeout>>();
  const hide = useCallback(() => { generation.current++; controller.current?.abort(); clearTimeout(timer.current); setRevealed(undefined); setBusy(false); }, []);
  useEffect(hide, [hide, row.version, row.linkVersion]);
  useEffect(() => {
    window.addEventListener('focus', hide); window.addEventListener('blur', hide); document.addEventListener('visibilitychange', hide);
    return () => { generation.current++; controller.current?.abort(); clearTimeout(timer.current); window.removeEventListener('focus', hide); window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', hide); };
  }, [hide]);
  async function reveal() {
    hide(); setFailed(false); const current = ++generation.current; const started = Date.now(); const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const result = await api<ExternalResourceView>(`/api/resources/${row.id}/reveal`, { method: 'POST', body: body({ version: row.version }), signal: abort.signal });
      const expiresAt = Math.min(started + 60_000, Date.parse(result.expiresAt));
      if (current !== generation.current || abort.signal.aborted || document.visibilityState !== 'visible' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
      setRevealed({ url: result.externalUrl, version: row.version, expiresAt }); timer.current = setTimeout(hide, expiresAt - Date.now());
    } catch { if (current === generation.current) setFailed(true); }
    finally { if (current === generation.current) setBusy(false); }
  }
  const visible = revealed && revealed.version === row.version && revealed.expiresAt > Date.now();
  return <article className="resource-item" data-resource-id={row.id}>
    <div className="resource-icon" aria-hidden="true"><FolderOpen size={21} /></div>
    <div className="resource-description"><h3>{row.name}</h3><p className="muted">{t(`resourceKind_${row.kind}`)}{row.isExample && <span className="badge ml-2">{t('example')}</span>}</p>
      {visible && <a className="secondary mt-3" href={revealed.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink size={15} />{t('resourceOpen')}</a>}
      {connections && <Connections id={row.id} />}
      {failed && <ErrorMessage />}
    </div>
    <div className="resource-actions">
      <button className="secondary" aria-expanded={connections} onClick={() => { hide(); setConnections(!connections); }}>{t('resourceConnections')}</button>
      <button className="secondary" disabled={busy} onClick={() => { if (visible) hide(); else void reveal(); }}>{t(visible ? 'resourceHide' : 'resourceReveal')}</button>
      <button className="secondary" onClick={() => { hide(); setEditor(row); }}>{t('resourceEdit')}</button>
      <button className="secondary" onClick={() => { hide(); setConfirm(row); }}>{t(parent ? 'resourceUnlink' : 'resourceDelete')}</button>
    </div>
    {editor && <ResourceEditor row={editor} onClose={() => setEditor(undefined)} onSaved={refresh} />}
    {confirm && <ResourceRemoval row={confirm} parent={parent} onClose={() => setConfirm(undefined)} onSaved={refresh} />}
  </article>;
}
function Connections({ id }: { id: string }) {
  const { t } = useTranslation(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['resources', 'connections', id, page], queryFn: () => api<ResourceConnections>(`/api/resources/${id}/links?page=${page}`) });
  return <section className="mt-4" aria-label={t('resourceConnections')}>
    {query.isPending && <p role="status">{t('loading')}</p>}{query.isError && <ErrorMessage />}
    {query.data?.total === 0 && <p className="subtitle">{t('resourceNoConnections')}</p>}
    {query.data?.items.map(item => <div className="list-line" key={item.id}><span className="muted">{t(`model${item.parent.type}`)}</span>{item.href ? <Link className="text-accent" to={item.href}>{item.label}</Link> : <span>{t('resourceUnavailable')}</span>}</div>)}
    {query.data && query.data.total > 50 && <div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('resourcePrevious')}</button><span>{t('resourcePage', { page })}</span><button className="secondary" disabled={page * 50 >= query.data.total} onClick={() => setPage(page + 1)}>{t('resourceNext')}</button></div>}
  </section>;
}
function ResourceEditor({ row, parent, onClose, onSaved }: { row?: ExternalResourceInfo; parent?: ResourceParent; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(); const [busy, setBusy] = useState(false); const [error, setError] = useState<'url' | 'request'>(); const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const externalUrl = String(data.get('externalUrl') ?? '').trim();
    const changes = { name: String(data.get('name')), kind: String(data.get('kind')), ...(!row || externalUrl ? { externalUrl } : {}) };
    const input = row ? externalResourcePatch.safeParse({ version: row.version, changes }) : externalResourceFields.safeParse(changes);
    if (!input.success) { setError('url'); return; }
    setBusy(true); setError(undefined); const controller = new AbortController(); abort.current = controller;
    try { await api(row ? `/api/resources/${row.id}` : '/api/resources', { method: row ? 'PATCH' : 'POST', body: body({ ...input.data, ...(!row && parent ? { parent } : {}) }), signal: controller.signal }); if (!controller.signal.aborted) { onSaved(); onClose(); } }
    catch { if (!controller.signal.aborted) setError('request'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <Modal title={t(row ? 'resourceEdit' : 'resourceAdd')} onClose={onClose}>
    <p className="notice mb-4">{t('resourcePolicy')}</p><form onSubmit={event => { void submit(event); }}>
      <label className="field">{t('resourceName')}<input name="name" required minLength={2} maxLength={160} defaultValue={row?.name} /></label>
      <label className="field">{t('resourceKind')}<select name="kind" aria-label={t('resourceKind')} defaultValue={row?.kind ?? 'DOCUMENT'}>{externalResourceKinds.map(kind => <option key={kind} value={kind}>{t(`resourceKind_${kind}`)}</option>)}</select></label>
      <label className="field">{t(row ? 'resourceReplaceUrl' : 'resourceUrl')}<input name="externalUrl" type="url" required={!row} maxLength={4096} autoComplete="off" spellCheck={false} /></label>
      <p className="subtitle">{t(row ? 'resourceUrlUnchanged' : 'resourceUrlHelp')}</p>
      {error === 'url' && <p role="alert" className="error">{t('resourceInvalidUrl')}</p>}{error === 'request' && <ErrorMessage />}
      <div className="form-footer"><button type="button" className="secondary" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy}>{t('save')}</button></div>
    </form>
  </Modal>;
}
function ResourceRemoval({ row, parent, onClose, onSaved }: { row: ExternalResourceInfo; parent?: ResourceParent; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController>(); useEffect(() => () => abort.current?.abort(), []);
  const preview = useQuery({ queryKey: ['resources', 'delete-preview', row.id, row.version], queryFn: () => api<Impact & { version: number }>(`/api/resources/${row.id}/delete-preview`), enabled: !parent });
  async function confirm() {
    setBusy(true); setFailed(false); const controller = new AbortController(); abort.current = controller;
    try {
      await api(parent ? `/api/resources/${row.id}/links/${row.linkId}` : `/api/resources/${row.id}`, { method: 'DELETE',
        body: body({ version: row.version, ...(parent ? { linkVersion: row.linkVersion } : { previewToken: preview.data?.previewToken }) }), signal: controller.signal }); if (!controller.signal.aborted) { onSaved(); onClose(); }
    } catch { if (!controller.signal.aborted) setFailed(true); } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <Modal title={t(parent ? 'resourceUnlink' : 'resourceDelete')} onClose={onClose}><h3>{row.name}</h3><p className="notice mt-4">{t(parent ? 'resourceUnlinkHelp' : 'resourceDeleteHelp')}</p>
    {!parent && preview.data && <ImpactList plan={preview.data} />}{(failed || preview.isError || !parent && preview.data && preview.data.version !== row.version) && <ErrorMessage />}<div className="form-footer"><button className="secondary" onClick={onClose}>{t('cancel')}</button><button className="danger" disabled={busy || !parent && (!preview.data || preview.data.version !== row.version)} onClick={() => { void confirm(); }}>{t('resourceConfirm')}</button></div></Modal>;
}
function AttachResource({ parent, onClose, onSaved }: { parent: ResourceParent; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<ExternalResourceInfo>(); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false); const [duplicate, setDuplicate] = useState(false);
  const query = useQuery({ queryKey: ['resources', 'picker', search, page], queryFn: () => api<ExternalResources>('/api/resources?' + new URLSearchParams({ q: search, page: String(page) })) });
  const abort = useRef<AbortController>(); useEffect(() => () => abort.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const row = selected; if (!row) return; setBusy(true); setFailed(false); setDuplicate(false);
    const controller = new AbortController(); abort.current = controller;
    try { await api(`/api/resources/${row.id}/links`, { method: 'POST', body: body({ version: row.version, parent }), signal: controller.signal }); if (!controller.signal.aborted) { onSaved(); onClose(); } }
    catch (error) { if (!controller.signal.aborted) { if (error instanceof ApiError && error.code === 'RESOURCE_ALREADY_LINKED') setDuplicate(true); else setFailed(true); } } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <Modal title={t('resourceLink')} onClose={onClose}><form onSubmit={event => { void submit(event); }}>
    <label className="field">{t('resourceSearch')}<input value={search} maxLength={100} onChange={event => { setSearch(event.currentTarget.value); setPage(1); setSelected(undefined); }} /></label>
    <label className="field">{t('resourceChoose')}<select aria-label={t('resourceChoose')} required value={selected?.id ?? ''} onChange={event => setSelected(query.data?.items.find(item => item.id === event.currentTarget.value))}><option value="">{t('resourceChoosePlaceholder')}</option>{query.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {query.data && <div className="pagination"><button type="button" className="secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected(undefined); }}>{t('resourcePrevious')}</button><span>{t('resourcePage', { page })}</span><button type="button" className="secondary" disabled={page * 50 >= query.data.total} onClick={() => { setPage(page + 1); setSelected(undefined); }}>{t('resourceNext')}</button></div>}
    {(failed || query.isError) && <ErrorMessage />}{duplicate && <p role="alert" className="error">{t('resourceAlreadyLinked')}</p>}
    <div className="form-footer"><button type="button" className="secondary" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy || !selected}>{t('resourceLink')}</button></div>
  </form></Modal>;
}
export function ResourceWorkspace({ parent }: { parent?: ResourceParent }) {
  const { t } = useTranslation(); const refresh = useRefreshResources(); const [search, setSearch] = useState(''); const [kind, setKind] = useState(''); const [page, setPage] = useState(1); const [create, setCreate] = useState(false); const [attach, setAttach] = useState(false);
  const query = useQuery({ queryKey: ['resources', parent?.type, parent?.id, search, kind, page], queryFn: () => api<ExternalResources>(parent
    ? `/api/records/${parent.type}/${parent.id}/resources?${new URLSearchParams({ page: String(page) })}`
    : '/api/resources?' + new URLSearchParams({ page: String(page), q: search, ...(kind ? { kind } : {}) })) });
  return <section className="panel mt-5" aria-label={t('resourceTitle')}><div className="panel-header resource-heading"><div><h2>{t('resourceTitle')}</h2>{query.data && <p className="subtitle mt-2">{t('resourceCount', { count: query.data.total })}</p>}</div>
    <div className="resource-actions">{parent && <button className="secondary" onClick={() => setAttach(true)}>{t('resourceLink')}</button>}<button className="primary" onClick={() => setCreate(true)}><Plus size={16} />{t('resourceAdd')}</button></div></div>
    <div className="panel-body"><p className="notice mb-4">{t('resourcePolicy')}</p>
      {!parent && <div className="resource-filters"><label className="field">{t('resourceSearch')}<input value={search} maxLength={100} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} /></label>
        <label className="field">{t('resourceKind')}<select aria-label={t('resourceKind')} value={kind} onChange={event => { setKind(event.currentTarget.value); setPage(1); }}><option value="">{t('resourceAllKinds')}</option>{externalResourceKinds.map(item => <option key={item} value={item}>{t(`resourceKind_${item}`)}</option>)}</select></label></div>}
      {query.isPending && <p role="status">{t('loading')}</p>}{query.isError && <ErrorMessage />}
      {query.data?.items.map(row => <ResourceItem key={row.linkId ?? row.id} row={row} parent={parent} />)}
      {query.data?.total === 0 && <div className="empty"><FolderOpen size={30} aria-hidden="true" /><strong>{t('resourceNoItems')}</strong><p>{t('resourceEmptyHelp')}</p></div>}
      {query.data && <div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('resourcePrevious')}</button><span>{t('resourcePage', { page })}</span><button className="secondary" disabled={page * 50 >= query.data.total} onClick={() => setPage(page + 1)}>{t('resourceNext')}</button></div>}
      <p className="subtitle mt-4">{t('resourceRevealHelp')}</p>
    </div>
    {create && <ResourceEditor parent={parent} onClose={() => setCreate(false)} onSaved={refresh} />}{attach && parent && <AttachResource parent={parent} onClose={() => setAttach(false)} onSaved={refresh} />}
  </section>;
}
export function ResourceLibrary() { const { t } = useTranslation(); return <><div className="eyebrow">{t('workspace')}</div><h1>{t('resourceLibrary')}</h1><p className="subtitle">{t('resourceSubtitle')}</p><ResourceWorkspace /></>; }
