import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './components';

const BiographyEditor = lazy(() => import('./player-biography-editor'));

export function PlayerBiography({ id, version, html }: { id: string; version: number; html: string }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return <section className="panel panel-body mt-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2>{t('playerBiography')}</h2>
      <button className="secondary" onClick={() => setEditing(true)}>{t('editBiography')}</button>
    </div>
    {/* The owner API sanitizes both saved and legacy markup before returning it. */}
    {html ? <div className="player-rich-text mt-3" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="muted mt-3">{t('empty')}</p>}
    {editing && <Modal title={t('editBiography')} onClose={() => setEditing(false)}>
      <Suspense fallback={<p role="status">{t('loading')}</p>}>
        <BiographyEditor id={id} version={version} html={html} onClose={() => setEditing(false)} />
      </Suspense>
    </Modal>}
  </section>;
}
