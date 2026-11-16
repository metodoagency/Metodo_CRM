import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { staffCsvHeader, staffCsvLimit, type StaffImportPreview } from '../shared/staff-import';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';

export function StaffImport({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<number>();
  return <>
    <button className="secondary mt-3" onClick={() => { setDone(undefined); setOpen(true); }}>{t('staffImport')}</button>
    {done !== undefined && <p role="status" className="notice mt-3">{t('staffImportDone', { count: done })}</p>}
    {open && <ImportDialog clubId={clubId} onClose={() => setOpen(false)} onImport={count => {
      void client.invalidateQueries(); setDone(count); setOpen(false);
    }} />}
  </>;
}

function ImportDialog({ clubId, onClose, onImport }: { clubId: string; onClose: () => void; onImport: (count: number) => void }) {
  const { t } = useTranslation();
  const [csv, setCsv] = useState('');
  const [fileError, setFileError] = useState(false);
  const [reading, setReading] = useState(false);
  const endpoint = `/api/clubs/${clubId}/staff-import`;
  const preview = useMutation({ mutationFn: (csv: string) => api<StaffImportPreview>(`${endpoint}/preview`, { method: 'POST', body: body({ csv }) }) });
  const apply = useMutation({ mutationFn: (input: { csv: string; previewToken: string }) => api<{ ids: string[] }>(`${endpoint}/apply`, { method: 'POST', body: body(input) }),
    onSuccess: result => onImport(result.ids.length) });
  const reset = () => { preview.reset(); apply.reset(); };
  const busy = preview.isPending || apply.isPending || reading;
  return <Modal title={t('staffImport')} onClose={onClose}>
    <p className="muted">{t('staffImportHint')}</p>
    <p className="muted mt-2">{t('staffImportActions')}</p><p className="muted mt-2">{t('staffImportRoles')}</p>
    <a className="text-accent block mt-3" href={`data:text/csv;charset=utf-8,${encodeURIComponent(staffCsvHeader.join(',') + '\r\n')}`} download="metodo-staff.csv">{t('staffImportTemplate')}</a>
    <form onSubmit={event => { event.preventDefault(); apply.reset(); preview.mutate(csv); }}>
      <label className="field">{t('staffImportFile')}<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        setFileError(false); reset();
        if (!file) return;
        if (file.size > staffCsvLimit) { setCsv(''); setFileError(true); return; }
        setReading(true);
        void file.text().then(text => { setCsv(text); }, () => { setCsv(''); setFileError(true); }).finally(() => setReading(false));
      }} /></label>
      <label className="field">{t('staffImportText')}<textarea required maxLength={staffCsvLimit} rows={5} value={csv} disabled={busy} onChange={event => { setCsv(event.target.value); setFileError(false); reset(); }} /></label>
      {(preview.isError || fileError) && <ErrorMessage />}
      <div className="form-footer"><button className="secondary" disabled={busy || !csv.trim()}>{t('previewStaffChange')}</button></div>
    </form>
    {preview.data && <section className="notice mt-4">
      {!!preview.data.issues.length && <ul role="alert" className="space-y-2">{preview.data.issues.map(issue => <li key={issue.line}>{t(`staffImport_${issue.code}`, { line: issue.line })}</li>)}</ul>}
      <ul className="space-y-2">{preview.data.rows.map(row => <li key={row.line} className="break-words">
        <strong>{row.person}</strong><p>{t(row.action)} · {t(row.role)} · {row.effectiveDate}</p>
        <a className="text-accent" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{t('source')}</a>
        {row.duplicate && <p className="muted">{t('staffImportDuplicate')}</p>}
      </li>)}</ul>
      {!preview.data.previewToken && !preview.data.issues.length && <p>{t('staffImportNone')}</p>}
      {apply.isError && (apply.error instanceof ApiError && apply.error.status === 409
        ? <p role="alert" className="error">{t('contextChanged')}</p> : <ErrorMessage />)}
      {preview.data.previewToken && <div className="form-footer"><button className="primary" disabled={busy} onClick={() => {
        const previewToken = preview.data?.previewToken;
        if (previewToken) apply.mutate({ csv, previewToken });
      }}>{t('staffImportApply')}</button></div>}
    </section>}
  </Modal>;
}
