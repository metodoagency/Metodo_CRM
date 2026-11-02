import * as Dialog from '@radix-ui/react-dialog';
import { X, Inbox, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal"><div className="flex justify-between items-center mb-6"><Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label={t('close')}><X size={20} /></Dialog.Close></div><Dialog.Description className="sr-only">{title}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Empty() { const { t } = useTranslation(); return <div className="empty"><Inbox size={30} className="mb-4 opacity-40" /><strong>{t('empty')}</strong><p>{t('emptyHint')}</p></div>; }
export function ErrorMessage() { const { t } = useTranslation(); return <p role="alert" className="error"><AlertTriangle size={16} />{t('error')}</p>; }
export function Badge({ value }: { value: string }) { const { t } = useTranslation(); return <span className={`badge badge-${value.toLowerCase()}`}>{t(value)}</span>; }
