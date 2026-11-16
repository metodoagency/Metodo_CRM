import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { manualSourceUrl } from '../shared/club-sources';
import { istanbulToday, personInput, personRoles } from '../shared/domain';
import type { AgeReveal } from '../shared/person-network';
import { api, ApiError, body } from './api';
import { Badge, ErrorMessage, Modal } from './components';
import type { PersonRecord } from './types';

export function PersonProfile({ person }: { person: PersonRecord }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const links = [
    { url: person.transfermarktUrl, label: 'personOpenTransfermarkt' },
    { url: person.tffProfileUrl, label: 'personOpenTff' },
  ];
  return <section className="panel panel-body mt-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2>{t('personProfile')}</h2>
      <button className="secondary" onClick={() => setEditing(true)}>{t('personEdit')}</button>
    </div>
    <dl className="mt-3">
      <div className="detail-field"><dt>{t('role')}</dt><dd>{t(person.role)}</dd></div>
      <div className="detail-field"><dt>{t('field_country')}</dt><dd>{person.country ?? '—'}</dd></div>
      <div className="detail-field"><dt>{t('relationStatus')}</dt><dd><Badge value={person.relationStatus} /></dd></div>
    </dl>
    <PersonAge key={`${person.id}:${person.version}`} id={person.id} />
    <div className="flex flex-wrap gap-2 mt-3">{links.map(link => {
      const parsed = manualSourceUrl.safeParse(link.url);
      return parsed.success && <a key={link.label} href={parsed.data} className="secondary" target="_blank" rel="noopener noreferrer">{t(link.label)}</a>;
    })}</div>
    {editing && <PersonEditor person={person} onClose={() => setEditing(false)} />}
  </section>;
}

function PersonAge({ id }: { id: string }) {
  const { t } = useTranslation();
  const reveal = useMutation({
    mutationFn: () => api<AgeReveal>(`/api/records/Person/${id}/age`, { method: 'POST' }),
    gcTime: 0,
  });
  const { data, reset } = reveal;
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(reset, data.expiresIn * 1000);
    return () => window.clearTimeout(timer);
  }, [data, reset]);
  return <div className="mt-3 flex gap-3 flex-wrap items-center">
    {data ? <>
      <span role="status">{data.age === null ? t('personNoAge') : `${t('playerAge')} · ${data.age}`}</span>
      {data.minor && <span className="badge">{t('personMinor')}</span>}
      <button className="secondary" onClick={() => reset()}>{t('hide')}</button>
    </> : <button className="secondary" disabled={reveal.isPending} onClick={() => reveal.mutate()}>{t('personShowAge')}</button>}
    {reveal.isError && <ErrorMessage />}
  </div>;
}

function PersonEditor({ person, onClose }: { person: PersonRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState(person);
  const [invalid, setInvalid] = useState(false);
  const schema = personInput.partial();
  const save = useMutation({
    mutationFn: (changes: ReturnType<typeof schema.parse>) => api(`/api/records/Person/${initial.id}`, { method: 'PATCH', body: body({ version: initial.version, changes }) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t('personEdit')} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const str = (field: string) => String(data.get(field) ?? '').trim();
      const date = str('birthDate');
      const clear = data.has('clearBirthDate');
      const fields = {
        name: str('name'), country: str('country') || null, role: str('role'), relationStatus: str('relationStatus'),
        transfermarktUrl: str('transfermarktUrl') || null, tffProfileUrl: str('tffProfileUrl') || null,
        hideBirthYear: data.has('hideBirthYear'),
      };
      const previous = { ...initial, transfermarktUrl: manualSourceUrl.safeParse(initial.transfermarktUrl).data ?? null, tffProfileUrl: manualSourceUrl.safeParse(initial.tffProfileUrl).data ?? null };
      const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) => previous[key as keyof typeof previous] !== value));
      if (date || clear) changes.birthDate = clear ? null : date;
      const input = schema.safeParse(changes);
      setInvalid(!input.success || (clear && !!date));
      if (!input.success || (clear && date)) return;
      if (!Object.keys(changes).length) { onClose(); return; }
      save.mutate(input.data);
    }}>
      <label className="field">{t('name')}<input name="name" required minLength={2} maxLength={160} defaultValue={initial.name} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">{t('role')}<select name="role" aria-label={t('role')} defaultValue={initial.role}>
          {personRoles.map(role => <option key={role} value={role}>{t(role)}</option>)}
        </select></label>
        <label className="field">{t('relationStatus')}<select name="relationStatus" aria-label={t('relationStatus')} defaultValue={initial.relationStatus}>
          {['NEW', 'WARM', 'ACTIVE', 'COLD'].map(status => <option key={status} value={status}>{t(status)}</option>)}
        </select></label>
      </div>
      <label className="field">{t('field_country')}<input name="country" maxLength={100} defaultValue={initial.country ?? ''} /></label>
      <label className="field">{t('birthDate')}<input name="birthDate" type="date" max={istanbulToday()} /></label>
      <p className="notice mb-3">{t('personBirthDateHelp')}</p>
      <label className="flex gap-2 mb-3"><input name="clearBirthDate" type="checkbox" />{t('personClearBirthDate')}</label>
      <label className="flex gap-2 mb-3"><input name="hideBirthYear" type="checkbox" defaultChecked={initial.hideBirthYear} />{t('personHideBirthYear')}</label>
      <label className="field">{t('personTransfermarkt')}<input name="transfermarktUrl" type="url" maxLength={2048}
        defaultValue={manualSourceUrl.safeParse(initial.transfermarktUrl).data ?? ''} /></label>
      <label className="field">{t('personTff')}<input name="tffProfileUrl" type="url" maxLength={2048}
        defaultValue={manualSourceUrl.safeParse(initial.tffProfileUrl).data ?? ''} /></label>
      {invalid && <p className="error" role="alert">{t('invalid')}</p>}
      {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
