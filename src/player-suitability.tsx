import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leagueTiers, suitabilityTiers, type LeagueTier, type Suitability } from '../shared/player-suitability';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';

export function PlayerFit({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, mutate, reset } = useMutation({
    mutationFn: () => api<Suitability>(`/api/players/${id}/suitability`, { method: 'POST' }), gcTime: 0,
  });
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => { reset(); setOpen(false); }, data.expiresIn * 1000);
    return () => window.clearTimeout(timer);
  }, [data, reset]);
  const best = data?.results.find(tier => tier.status === 'SUITABLE') ?? data?.results.find(tier => tier.status === 'CLOSE');
  const label = data ? best ? `${t('fitTierLabel', { tier: best.tier })} · ${t(`fit_${best.status}`)}`
    : data.missing.length ? t('playerFitUnassessed') : t('fit_UNSUITABLE') : t('fitCheck');
  return <>
    <button className="secondary" disabled={isPending} aria-label={`${label} · ${name}`} onClick={() => { setOpen(true); if (!data) mutate(); }}>{label}</button>
    {data?.example && <small className="block muted mt-1">{t('example')}</small>}
    {open && <Modal title={t('playerFit')} onClose={() => setOpen(false)}>
      {isPending && <p role="status">{t('loading')}</p>}
      {isError && <ErrorMessage />}
      {data && <>
        {data.example && <p className="notice mb-3">{t('fitExample')}</p>}
        {data.missing.length ? <p className="muted">{t('fitMissing', { fields: data.missing.map(field => t(field === 'score' ? 'playerScore' : 'birthDate')).join(', ') })}</p> :
          <ul className="divide-y">{data.results.map(tier => <li className="py-3" key={tier.tier}>
            <h3 className="font-semibold">{t('fitTierLabel', { tier: tier.tier })} · {t(`fit_${tier.status}`)}</h3>
            <p className="muted mt-1">{t(tier.scoreMeets ? 'fitScoreMet' : 'fitScoreBelow', { score: tier.minScore })}</p>
            <p className="muted mt-1">{t(tier.ageMeets ? 'fitAgeMet' : 'fitAgeOutside', { age: tier.referenceAge, distance: tier.maxAgeDiff })}</p>
          </li>)}</ul>}
        <p className="notice mt-3">{t('fitRule')}</p>
      </>}
    </Modal>}
  </>;
}

type Settings = { version: number; leagueTiers: unknown };
export function LeagueTiersPanel() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
  return <section className="panel panel-body mt-5">
    <h2>{t('fitSettings')}</h2><p className="muted my-3">{t('fitRule')}</p>
    {query.isError && <ErrorMessage />}
    {query.data && <TiersForm key={query.data.version} settings={query.data} />}
  </section>;
}

function TiersForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const initial = suitabilityTiers(settings.leagueTiers);
  const [tiers, setTiers] = useState<LeagueTier[]>(() => [...initial.tiers]);
  const [invalid, setInvalid] = useState(false);
  const fields = [
    { name: 'tier', label: 'fitTierNumber', min: 1, max: 99, step: 1 },
    { name: 'minScore', label: 'fitMinimumScore', min: 1, max: 10, step: 0.5 },
    { name: 'referenceAge', label: 'fitReferenceAge', min: 13, max: 60, step: 1 },
    { name: 'maxAgeDiff', label: 'fitMaxAgeDiff', min: 0, max: 30, step: 1 },
  ] as const;
  const mutation = useMutation({
    mutationFn: (values: LeagueTier[]) => api('/api/settings', { method: 'PATCH', body: body({ version: settings.version, leagueTiers: values }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['settings'] }); },
  });
  function addTier() {
    const tier = Array.from({ length: 99 }, (_, index) => index + 1).find(value => !tiers.some(item => item.tier === value)) ?? 1;
    setTiers([...tiers, { tier, minScore: 6, referenceAge: 25, maxAgeDiff: 5 }]);
  }
  return <form onSubmit={event => {
    event.preventDefault();
    const result = leagueTiers.safeParse(tiers);
    setInvalid(!result.success);
    if (result.success) mutation.mutate(result.data);
  }}>
    {initial.example && <p className="notice mb-3">{t('fitExample')}</p>}
    {tiers.map((tier, index) => <fieldset key={index} className="border rounded-md px-3 py-2 mb-3">
      <legend className="muted px-2">{t('fitTierRow', { row: index + 1 })}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(field => <label className="field" key={field.name}>
        {t(field.label)}<input type="number" min={field.min} max={field.max} step={field.step} required
          value={Number.isNaN(tier[field.name]) ? '' : tier[field.name]}
          onChange={event => { const value = event.currentTarget.valueAsNumber; setTiers(previous => previous.map((item, row) => row === index ? { ...item, [field.name]: value } : item)); }} />
      </label>)}</div>
      <button type="button" className="secondary" disabled={tiers.length <= 1 || mutation.isPending}
        onClick={() => setTiers(tiers.filter((_, row) => index !== row))}>{t('fitRemoveTier')}</button>
    </fieldset>)}
    {invalid && <p className="error" role="alert">{t('fitInvalidTiers')}</p>}
    {mutation.isError && (mutation.error instanceof ApiError && mutation.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
    <div className="flex gap-2 flex-wrap">
      <button type="button" className="secondary" disabled={tiers.length >= 20 || mutation.isPending} onClick={addTier}>{t('fitAddTier')}</button>
      <button className="primary" disabled={mutation.isPending}>{t('fitSaveTiers')}</button>
    </div>
  </form>;
}
