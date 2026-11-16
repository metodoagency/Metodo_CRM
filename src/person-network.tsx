import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { manualSourceUrl } from '../shared/club-sources';
import { personRoles } from '../shared/domain';
import { personNetworkSections, tenureCreate, tenureUpdate } from '../shared/person-network';
import type { NetworkSection, OverlappingTenures, PersonTenure, WorkedTogether } from '../shared/person-network';
import { api, ApiError, body } from './api';
import { Badge, Empty, ErrorMessage, Modal } from './components';

type ClubOption = { id: string; name: string };
const labels = { tenures: 'personTenures', workedTogether: 'personWorkedTogether', overlaps: 'personOverlaps' } as const;

function ClubStaffLink({ id, name }: { id: string; name: string }) {
  return <Link to={`/record/Club/${id}?tab=staff`} className="text-accent underline">{name}</Link>;
}

export function PersonNetwork({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [section, setSection] = useState<NetworkSection>('tenures');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<PersonTenure | 'new'>();
  const query = useQuery({
    queryKey: ['person-network', id, section, page],
    queryFn: () => api<{ items: (PersonTenure | WorkedTogether | OverlappingTenures)[]; more: boolean }>(`/api/people/${id}/network?section=${section}&page=${page}`),
  });
  const date = new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'UTC', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric',
  });
  function period(start: string | null, end: string | null) {
    return `${start ? date.format(new Date(start)) : t('personTenureUnknown')} – ${end ? date.format(new Date(end)) : t('personTenureActive')}`;
  }
  const role = (value: string) => t(value, { defaultValue: value });
  return <section className="panel panel-body mt-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2>{t('personNetwork')}</h2>
      <button className="secondary" onClick={() => setEdit('new')}>{t('personAddTenure')}</button>
    </div>
    <div className="tabs">{personNetworkSections.map(key => <button key={key} className={key === section ? 'selected' : ''}
      aria-pressed={key === section} onClick={() => { setSection(key); setPage(1); }}>{t(labels[key])}</button>)}</div>
    <p className="notice mb-3">{t('personTenureDates')}</p>
    {query.isPending && <p role="status">{t('loading')}</p>}
    {query.isError && <ErrorMessage />}
    {query.data && <>
      {query.data.items.length ? <ul className="divide-y">{query.data.items.map(row => <li key={row.id} className="py-3">
        {'verificationStatus' in row ? <div className="flex flex-wrap gap-3 items-start justify-between">
          <div><ClubStaffLink id={row.clubId} name={row.clubName} /><p className="mt-1">{role(row.role)}</p>
            <p className="muted text-xs mt-1">{period(row.startDate, row.endDate)}</p>
            <span className="mt-2 inline-flex items-center gap-3"><Badge value={row.verificationStatus} />
              {row.sourceUrl && <a href={row.sourceUrl} className="text-accent underline" target="_blank" rel="noopener noreferrer">{t('source')}</a>}
            </span>
          </div>
          <button className="secondary" onClick={() => setEdit(row)}>{t('personEditTenure')}</button>
        </div> : 'personId' in row ? <>
          <Link to={`/record/Person/${row.personId}`} className="font-semibold text-accent underline">{row.personName}</Link>
          <p className="mt-1"><ClubStaffLink id={row.clubId} name={row.clubName} /></p><p className="muted text-xs mt-1">{period(row.startDate, row.lastDay)}</p>
        </> : <>
          <div><ClubStaffLink id={row.firstClubId} name={row.firstClubName} /> · {role(row.firstRole)}</div>
          <div className="mt-1"><ClubStaffLink id={row.secondClubId} name={row.secondClubName} /> · {role(row.secondRole)}</div>
          <p className="muted text-xs mt-1">{period(row.startDate, row.lastDay)}</p>
        </>}
      </li>)}</ul> : <Empty />}
      {(page > 1 || query.data.more) && <div className="pagination">
        <button className="secondary" onClick={() => setPage(page - 1)} disabled={page === 1}>{t('previous')}</button>
        <button className="secondary" onClick={() => setPage(page + 1)} disabled={!query.data.more}>{t('next')}</button>
      </div>}
    </>}
    {edit && <TenureEditor id={id} value={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />}
  </section>;
}

function TenureEditor({ id, value, onClose }: { id: string; value?: PersonTenure; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [club, setClub] = useState<ClubOption>();
  const [invalid, setInvalid] = useState(false);
  const clubs = useQuery({
    queryKey: ['person-tenure-clubs', search], enabled: !value,
    queryFn: () => api<{ items: ClubOption[] }>(`/api/clubs?q=${encodeURIComponent(search)}`),
  });
  const options = clubs.data?.items ?? [];
  const save = useMutation({
    mutationFn: (data: ReturnType<typeof tenureCreate.parse> | ReturnType<typeof tenureUpdate.parse>) => api(`/api/people/${id}/tenures${value ? `/${value.id}` : ''}`,
      { method: value ? 'PATCH' : 'POST', body: body(data) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t(value ? 'personEditTenure' : 'personAddTenure')} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const fields = { role: form.get('role'), startDate: form.get('startDate') || null, endDate: form.get('endDate') || null, sourceUrl: form.get('sourceUrl') || null };
      const parsed = value ? tenureUpdate.safeParse({ ...fields, version: value.version }) : tenureCreate.safeParse({ ...fields, clubId: club?.id });
      setInvalid(!parsed.success);
      if (parsed.success) save.mutate(parsed.data);
    }}>
      {value ? <p className="notice mb-4">{value.clubName}</p> : <>
        <label className="field">{t('cardClubSearch')}<input maxLength={100} value={search} onChange={event => setSearch(event.currentTarget.value)} /></label>
        <label className="field">{t('club')}<select value={club?.id ?? ''} required aria-label={t('club')}
          onChange={event => setClub(options.find(option => option.id === event.currentTarget.value))}>
          <option value="">{t('select')}</option>
          {club && !options.some(option => option.id === club.id) && <option value={club.id}>{club.name}</option>}
          {options.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
        </select></label>
        {clubs.isError && <ErrorMessage />}
      </>}
      <label className="field">{t('role')}<select name="role" aria-label={t('role')} defaultValue={value?.role && personRoles.some(role => role === value.role) ? value.role : 'OTHER'}>
        {personRoles.map(role => <option key={role} value={role}>{t(role)}</option>)}
      </select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">{t('personTenureStart')}<input name="startDate" type="date" defaultValue={value?.startDate ?? ''} /></label>
        <label className="field">{t('personTenureEnd')}<input name="endDate" type="date" defaultValue={value?.endDate ?? ''} /></label>
      </div>
      <label className="field">{t('sourceAddress')}<input name="sourceUrl" type="url" maxLength={2048} defaultValue={manualSourceUrl.safeParse(value?.sourceUrl).data ?? ''} /></label>
      {invalid && <p className="error" role="alert">{t('invalid')}</p>}
      {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p className="error" role="alert">
        {t(save.error.code === 'DUPLICATE_TENURE' ? 'personDuplicateTenure' : 'contextChanged')}
      </p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
