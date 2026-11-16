import { lazy, Suspense, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';
import { areaInput, type ClubFilters, type ClubGeography, type ClubMarker } from '../shared/club-network';

const ClubMap = lazy(() => import('./club-map'));
const emptyMarkers: ClubMarker[] = [];
export const geographyKey = ['club-geography'];
export function clubSearchParams(filters: ClubFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export function ClubExplorer({ filters, q, onChange }: { filters: ClubFilters; q: string; onChange: (filters: ClubFilters) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [areaForm, setAreaForm] = useState(false);
  const [mapLabel, setMapLabel] = useState('');
  const geography = useQuery({ queryKey: geographyKey, queryFn: () => api<ClubGeography>('/api/clubs/geography') });
  const params = clubSearchParams(filters);
  params.set('q', q);
  const markers = useQuery({ queryKey: ['club-markers', params.toString()], queryFn: () => api<{ items: ClubMarker[] }>(`/api/clubs/markers?${params}`) });
  const data = geography.data;
  const country = data?.countries.find(row => row.id === filters.countryId);
  const region = data?.regions.find(row => row.id === filters.regionId);
  const continent = data?.continents.find(row => row.id === filters.continentId);
  const selectedName = region?.name || country?.name || continent?.name || (filters.countryCode ? mapLabel || filters.countryCode : '') || (filters.unassigned ? t('clubUnassigned') : t('clubAllAreas'));

  function countryRows(countries: ClubGeography['countries']) {
    return <ul className="space-y-1 pl-3">{countries.map(row => <li key={row.id}>
      <button className="area-button" aria-pressed={filters.countryId === row.id && !filters.regionId}
        onClick={() => onChange({ countryId: row.id })}><span>{row.name}</span><span>{row.count}</span></button>
      <ul className="pl-4">{data?.regions.filter(area => area.countryId === row.id).map(area => <li key={area.id}>
        <button className="area-button" aria-pressed={filters.regionId === area.id}
          onClick={() => onChange({ countryId: row.id, regionId: area.id })}><span>{area.name}</span><span>{area.count}</span></button>
      </li>)}</ul>
    </li>)}</ul>;
  }

  return <div className="club-explorer mt-5">
    <section className="panel panel-body">
      <h2>{t('clubGeography')}</h2>
      <button className="secondary mt-3" onClick={() => setAreaForm(true)} disabled={!data}>{t('clubAddArea')}</button>
      {geography.isError && <ErrorMessage />}
      {data && <div className="mt-3">
        <button className="area-button" aria-pressed={!Object.keys(filters).length} onClick={() => onChange({})}><span>{t('clubAllAreas')}</span><span>{data.total}</span></button>
        {data.continents.map(row => <div key={row.id}>
          <button className="area-button font-semibold" aria-pressed={filters.continentId === row.id}
            onClick={() => onChange({ continentId: row.id })}><span>{row.name}</span><span>{row.count}</span></button>
          {countryRows(data.countries.filter(item => item.continentId === row.id))}
        </div>)}
        {data.countries.some(row => !row.continentId) && <><p className="muted text-xs mt-3">{t('clubWithoutContinent')}</p>{countryRows(data.countries.filter(row => !row.continentId))}</>}
        <button className="area-button" aria-pressed={!!filters.unassigned} onClick={() => onChange({ unassigned: 'true' })}><span>{t('clubUnassigned')}</span><span>{data.unassigned}</span></button>
      </div>}
    </section>
    <div className="min-w-0">
      <p className="muted text-sm mb-2" role="status">{t('clubSelectedArea', { name: selectedName })}</p>
      {markers.isError && <ErrorMessage />}
      <Suspense fallback={<p role="status">{t('loading')}</p>}>
        <ClubMap markers={markers.data?.items ?? emptyMarkers} countryCode={country?.isoCode.toUpperCase() || filters.countryCode} region={!!region}
          onCountry={(code, name) => {
            const known = data?.countries.find(row => row.isoCode.toUpperCase() === code);
            setMapLabel(name);
            onChange(known ? { countryId: known.id } : { countryCode: code });
          }}
          onClub={id => navigate(`/record/Club/${id}`)} />
      </Suspense>
    </div>
    {areaForm && data && <AreaForm geography={data} onClose={() => setAreaForm(false)} />}
  </div>;
}

function AreaForm({ geography, onClose }: { geography: ClubGeography; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [type, setType] = useState<'Continent' | 'Country' | 'Region'>('Continent');
  const mutation = useMutation({
    mutationFn: (values: unknown) => api('/api/clubs/geography', { method: 'POST', body: body(areaInput.parse(values)) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: geographyKey }); onClose(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ ...Object.fromEntries(new FormData(event.currentTarget)), type });
  }
  return <Modal title={t('clubAddArea')} onClose={onClose}>
    <form onSubmit={submit}>
      <label className="field">{t('clubAreaType')}<select aria-label={t('clubAreaType')} value={type} onChange={event => setType(event.target.value as typeof type)}>
        <option value="Continent">{t('clubContinent')}</option><option value="Country">{t('clubCountry')}</option><option value="Region">{t('clubRegion')}</option>
      </select></label>
      <label className="field">{t('name')}<input name="name" required maxLength={100} /></label>
      {type === 'Country' && <>
        <label className="field">{t('clubCountryCode')}<input name="isoCode" required maxLength={2} pattern="[A-Za-z]{2}" /></label>
        <label className="field">{t('clubContinent')}<select aria-label={t('clubContinent')} name="continentId" required><option value="">{t('select')}</option>
          {geography.continents.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
      </>}
      {type === 'Region' && <label className="field">{t('clubCountry')}<select aria-label={t('clubCountry')} name="countryId" required><option value="">{t('select')}</option>
        {geography.countries.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>}
      {mutation.isError && (mutation.error instanceof ApiError && mutation.error.code === 'AREA_EXISTS'
        ? <p role="alert" className="error">{t('clubAreaExists')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}
