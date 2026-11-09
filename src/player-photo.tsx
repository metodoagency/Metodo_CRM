import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AttachmentInfo } from '../shared/files';
import { activePhotoId, photoSelection, playerImageMimes } from '../shared/player-photo';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';
import type { RecordRow } from './types';

function Portrait({ id, available, large }: { id: string; available: boolean; large: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={large ? 'avatar player-portrait' : 'avatar player-avatar'}>
    {available && !failed
      ? <img src={`/api/players/${id}/photo`} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <UserRound size={large ? 36 : 17} aria-hidden="true" />}
  </span>;
}

export function PlayerAvatar({ id, version, available, large = false }: { id: string; version: number; available: boolean; large?: boolean }) {
  return <Portrait key={`${id}:${version}`} id={id} available={available} large={large} />;
}

export function PlayerPhotoPanel({ row }: { row: RecordRow }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const photoId = activePhotoId({ photo: row.photo ?? null, photoSourceUrl: row.photoSourceUrl ?? null, photoRightsNote: row.photoRightsNote ?? null });
  return <section className="panel panel-body mt-5">
    <div className="flex items-start gap-4 flex-wrap">
      <PlayerAvatar id={row.id} version={row.version} available={!!photoId} large />
      <div className="min-w-0 flex-1">
        <h2>{t('photoHeading')}</h2>
        {photoId && <>
          <p className="muted mt-2 whitespace-pre-wrap break-words">{row.photoRightsNote}</p>
          <a className="text-accent inline-block mt-2" href={row.photoSourceUrl ?? undefined} target="_blank" rel="noopener noreferrer">{t('source')}</a>
        </>}
      </div>
      <button className="secondary" onClick={() => setEditing(true)}>{t('photoSelect')}</button>
    </div>
    {editing && <PhotoForm row={row} photoId={photoId} onClose={() => setEditing(false)} />}
  </section>;
}

function PhotoForm({ row, photoId, onClose }: { row: RecordRow; photoId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState({ version: row.version, photoId, sourceUrl: row.photoSourceUrl, rightsNote: row.photoRightsNote });
  const [selected, setSelected] = useState(initial.photoId ?? '');
  const query = useQuery({ queryKey: ['files', 'Player', row.id], queryFn: () => api<{ items: AttachmentInfo[]; uploadAvailable: boolean }>(`/api/records/Player/${row.id}/files`) });
  const images = query.data?.items.filter(file => playerImageMimes.some(mime => file.mimeType === mime)) ?? [];
  const mutation = useMutation({
    mutationFn: (form?: FormData) => {
      const attachment = images.find(file => file.id === form?.get('attachmentId'));
      const input = photoSelection.parse(form ? {
        action: 'set', version: initial.version, attachmentId: attachment?.id, attachmentVersion: attachment?.version,
        sourceUrl: form.get('sourceUrl'), rightsNote: form.get('rightsNote'),
      } : { action: 'remove', version: initial.version });
      return api(`/api/players/${row.id}/photo`, { method: 'PATCH', body: body(input) });
    },
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t('photoSelect')} onClose={onClose}>
    <p className="muted mb-4">{t('photoUploadHint')}</p>
    {query.isError && <ErrorMessage />}
    {query.isPending && <p role="status">{t('loading')}</p>}
    <form onSubmit={event => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}>
      {!!images.length && <>
        <label className="field">{t('photoAttachment')}<select name="attachmentId" required value={selected} onChange={event => setSelected(event.currentTarget.value)}>
          <option value="">{t('empty')}</option>
          {images.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select></label>
        <div key={selected}>
          <label className="field">{t('sourceAddress')}<input name="sourceUrl" type="url" required maxLength={2048} defaultValue={selected === initial.photoId ? initial.sourceUrl ?? '' : ''} /></label>
          <label className="field">{t('photoRights')}<textarea name="rightsNote" required maxLength={1000} defaultValue={selected === initial.photoId ? initial.rightsNote ?? '' : ''} /></label>
        </div>
      </>}
      {mutation.isError && (mutation.error instanceof ApiError && mutation.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer">
        {initial.photoId && <button type="button" className="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>{t('photoRemove')}</button>}
        {!!images.length && <button className="primary" disabled={mutation.isPending}>{t('save')}</button>}
      </div>
    </form>
  </Modal>;
}
