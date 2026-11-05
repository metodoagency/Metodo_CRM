import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, body } from './api';
import { Modal, Empty, ErrorMessage } from './components';
import type { AttachmentInfo, ProcessingAdapterInfo, ProcessingPreview } from '../shared/files';
import type { RecordType } from './types';

function FileItem({ file }: { file: AttachmentInfo }) {
  const { t } = useTranslation(); const [url, setUrl] = useState<string>(); const timer = useRef<ReturnType<typeof setTimeout>>();
  const [process, setProcess] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const download = useMutation({ mutationFn: () => api<{ url: string; expiresIn: number }>(`/api/files/${file.id}/download`, { method: 'POST', body: body({ version: file.version }) }),
    onSuccess: result => { clearTimeout(timer.current); setUrl(result.url); timer.current = setTimeout(() => setUrl(undefined), result.expiresIn * 1000); } });
  return <div className="list-line flex-wrap"><span className="flex-1 break-all"><span className="block">{file.name}</span><small className="block muted">{file.mimeType} · {file.sizeBytes}</small></span>
    {url ? <a className="secondary" href={url} rel="noreferrer">{t('fileOpen')}</a> : <button className="secondary" disabled={download.isPending} onClick={() => download.mutate()}>{t('fileDownload')}</button>}
    <button className="secondary" onClick={() => setProcess(true)}>{t('fileProcessing')}</button>
    {download.isError && <ErrorMessage />}{process && <ProcessingDialog file={file} onClose={() => setProcess(false)} />}
  </div>;
}
export function FileMaintenance() {
  const { t } = useTranslation(); const client = useQueryClient();
  const status = useQuery({ queryKey: ['file-cleanup'], queryFn: () => api<{ pending: number; cleanupAvailable: boolean }>('/api/admin/files/status') });
  const cleanup = useMutation({ mutationFn: () => api('/api/admin/files/cleanup', { method: 'POST' }), onSuccess: () => { void client.invalidateQueries({ queryKey: ['file-cleanup'] }); } });
  return <section className="panel panel-body mt-6"><h2>{t('fileCleanup')}</h2><p className="subtitle my-3">{t('fileCleanupHelp')}</p>
    {status.data && <p role="status">{t('fileCleanupPending', { count: status.data.pending })}</p>}
    <button className="secondary mt-3" disabled={!status.data?.cleanupAvailable || !status.data.pending || cleanup.isPending} onClick={() => cleanup.mutate()}>{t('fileCleanupRetry')}</button>
    {(status.isError || cleanup.isError) && <ErrorMessage />}</section>;
}
export function AttachmentPanel({ type, id }: { type: RecordType; id: string }) {
  const { t } = useTranslation(); const client = useQueryClient(); const form = useRef<HTMLFormElement>(null);
  const query = useQuery({ queryKey: ['files', type, id], queryFn: () => api<{ items: AttachmentInfo[]; uploadAvailable: boolean }>(`/api/records/${type}/${id}/files`) });
  const upload = useMutation({ mutationFn: (data: FormData) => api(`/api/records/${type}/${id}/files`, { method: 'POST', body: data }), onSuccess: () => { form.current?.reset(); void client.invalidateQueries(); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); upload.mutate(new FormData(event.currentTarget)); }
  return <section className="panel mt-5"><div className="panel-header"><h2>{t('filesTitle')}</h2></div><div className="panel-body">
    <p className="notice mb-4">{t('filePolicy')}</p>{query.isError && <ErrorMessage />}
    {query.data?.uploadAvailable ? <form ref={form} onSubmit={submit}><label className="field">{t('fileSelect')}<input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" /></label><button className="primary" disabled={upload.isPending}>{t('fileUpload')}</button></form> : <p className="notice">{t('fileStorageMissing')}</p>}
    {upload.isError && <ErrorMessage />}{query.data?.items.length ? query.data.items.map(file => <FileItem key={file.id} file={file} />) : <Empty />}
    <p className="muted text-xs mt-4">{t('fileExpires')}</p>
  </div></section>;
}
function ProcessingDialog({ file, onClose }: { file: AttachmentInfo; onClose: () => void }) {
  const { t } = useTranslation(); const [preview, setPreview] = useState<ProcessingPreview>(); const [confirmed, setConfirmed] = useState(false);
  const adapters = useQuery({ queryKey: ['processing-adapters'], queryFn: () => api<ProcessingAdapterInfo[]>('/api/processing/adapters') });
  const prepare = useMutation({ mutationFn: (data: { adapterId: string; text: string }) => api<ProcessingPreview>('/api/processing/preview', { method: 'POST', body: body({ ...data, attachmentId: file.id, attachmentVersion: file.version }) }), onSuccess: setPreview });
  const run = useMutation({ mutationFn: async () => {
    const approved = await api<{ version: number }>(`/api/processing/${preview!.id}/approve`, { method: 'POST', body: body({ version: preview!.version, previewToken: preview!.previewToken, approved: true }) });
    return api(`/api/processing/${preview!.id}/run`, { method: 'POST', body: body({ version: approved.version }) });
  } });
  return <Modal title={t('fileProcessing')} onClose={onClose}>
    {run.isSuccess ? <p role="status">{t('processingDone')}</p> : preview ? <>
      <h3>{t('processingPreview')}</h3><p className="notice my-3">{t('processingNotice')}</p>
      <p>{t(preview.adapter.location === 'local' ? 'processingLocal' : 'processingExternal')} · {preview.adapter.destination}</p>
      <pre className="text-xs whitespace-pre-wrap break-all my-4 max-h-80 overflow-auto">{JSON.stringify(preview.payload, null, 2)}</pre>
      <label className="field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('processingConfirm')}</label>
      <button className="primary" disabled={!confirmed || run.isPending || run.isError} onClick={() => run.mutate()}>{t('processingRun')}</button>
    </> : adapters.data?.length ? <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); prepare.mutate({ adapterId: String(data.get('adapterId')), text: String(data.get('text')) }); }}>
      <label className="field">{t('processingAdapter')}<select name="adapterId" aria-label={t('processingAdapter')}>{adapters.data.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}</select></label>
      <label className="field">{t('processingText')}<textarea name="text" maxLength={100000} required /></label>
      <button className="primary" disabled={prepare.isPending}>{t('processingPreview')}</button>
    </form> : <p className="notice">{t('processingUnavailable')}</p>}
    {(prepare.isError || run.isError || adapters.isError) && <ErrorMessage />}
  </Modal>;
}
