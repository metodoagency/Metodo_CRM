import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiBlob, body } from './api';
import { ErrorMessage } from './components';
import type { DocumentInput } from '../shared/documents';

export async function downloadDocument(path: string, input: DocumentInput, filename: string) {
  const file = await apiBlob(path, { method: 'POST', body: body(input) });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfileExport({ id, version }: { id: string; version: number }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const language = i18n.language === 'en' ? 'en' : 'tr';
  const download = useMutation({
    mutationFn: (format: DocumentInput['format']) => downloadDocument(
      `/api/documents/profile/${id}`, { format, language, version }, `metodo-profile-${language}.${format}`,
    ),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['timeline', 'Player', id] }); },
  });
  return <section className="panel panel-body mt-5">
    <h2>{t('profileDocument')}</h2>
    <div className="flex gap-2 flex-wrap mt-3">
      <button className="secondary" disabled={download.isPending} onClick={() => download.mutate('pdf')}>{t('documentPdf')}</button>
      <button className="secondary" disabled={download.isPending} onClick={() => download.mutate('docx')}>{t('documentDocx')}</button>
    </div>
    {download.isError && <ErrorMessage />}
  </section>;
}
