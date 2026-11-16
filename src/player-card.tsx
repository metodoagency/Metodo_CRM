import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PlayerCard, PrivateCardFields } from '../shared/player-card';
import { formatMarketAmount } from '../shared/player-market';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';
import { PlayerCardEditor, footLabels } from './player-card-editor';
import { PlayerAvatar } from './player-photo';

type PrivatePreview = { fields: PrivateCardFields; validUntil: number; version: number };

function markPlayerCardPage(portal: HTMLDivElement | null) {
  document.documentElement.classList.toggle('player-card-page', portal !== null);
}

export function PlayerCardPanel({ id, version }: { id: string; version: number }) {
  const { t } = useTranslation();
  const card = useQuery({ queryKey: ['player-card', id, version], queryFn: () => api<PlayerCard>(`/api/players/${id}/card`) });
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [printFields, setPrintFields] = useState<PrivatePreview>();
  const [printError, setPrintError] = useState(false);
  const [readyPortraitVersion, setReadyPortraitVersion] = useState<number>();
  const printSelection = useRef<PrivatePreview>();
  const usedSelection = useRef(false);
  const clear = useCallback(() => { printSelection.current = undefined; setPrintFields(undefined); }, []);
  useEffect(() => {
    const before = () => {
      const selection = printSelection.current;
      if (!selection) return;
      if (usedSelection.current || selection.validUntil <= Date.now()) flushSync(clear);
      else usedSelection.current = true;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', clear);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', clear); };
  }, [clear]);
  useEffect(() => {
    if (!printFields) return;
    const timer = window.setTimeout(clear, Math.max(0, printFields.validUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [clear, printFields]);
  const snapshot = card.data;
  const ready = !snapshot?.photo || readyPortraitVersion === snapshot.version;
  function print(details?: PrivatePreview) {
    if (!ready || (details && (details.validUntil <= Date.now() || details.version !== snapshot?.version))) return;
    setPrintError(false);
    usedSelection.current = false;
    printSelection.current = details;
    flushSync(() => setPrintFields(details));
    try { window.print(); } catch {
      clear();
      setPrintError(true);
    }
  }
  return <section className="panel panel-body mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2>{t('cardTitle')}</h2>
      {snapshot && <div className="flex gap-2 flex-wrap">
        <button className="secondary" onClick={() => setEdit(true)}>{t('cardEdit')}</button>
        <button className="secondary" onClick={() => { setPreview(true); setPrintError(false); }}>{t('cardPrint')}</button>
      </div>}
    </div>
    {snapshot && <CardContent card={snapshot} />}
    {card.isPending && <p role="status">{t('loading')}</p>}
    {card.isError && <ErrorMessage />}
    {edit && snapshot && <PlayerCardEditor card={snapshot} onClose={() => setEdit(false)} />}
    {preview && snapshot && <PrintPreview key={snapshot.version} card={snapshot} print={print} ready={ready} printError={printError} onClose={() => {
      clear(); setPreview(false);
    }} />}
    {createPortal(<div className="player-card-print" ref={markPlayerCardPage}>{snapshot && <CardContent card={snapshot}
      details={printFields?.version === snapshot.version ? printFields.fields : undefined}
      print onPortraitReady={() => setReadyPortraitVersion(snapshot.version)} />}</div>, document.body)}
  </section>;
}

function PrintPreview({ card, print, ready, printError, onClose }: { card: PlayerCard; print: (details?: PrivatePreview) => void; ready: boolean; printError: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [includeAge, setAge] = useState(false);
  const [includeFit, setFit] = useState(false);
  const { data, mutate, isPending, isError, error, reset } = useMutation({
    mutationFn: async () => {
      const fields = await api<PrivateCardFields>(`/api/players/${card.id}/card/private`, {
        method: 'POST', body: body({ version: card.version, includeAge, includeFit }),
      });
      return { fields, validUntil: Date.now() + fields.expiresIn * 1000, version: card.version };
    }, gcTime: 0,
  });
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(reset, Math.max(0, data.validUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [data, reset]);
  const embedded = window.top !== window.self;
  const privateSelected = includeAge || includeFit;
  return <Modal title={t('cardPrint')} onClose={onClose}>
    <p className="notice mb-4">{t('cardPrintPrivacy')}</p>
    <CardContent card={card} details={data?.fields} />
    {embedded ? <a className="secondary mt-4" href={`/record/Player/${card.id}`} target="_blank" rel="noopener noreferrer">{t('cardPrintTopLevel')}</a> : <>
      {card.hasBirthDate && <fieldset className="mt-4 grid gap-2" disabled={isPending}>
        <legend className="mb-2">{t('cardPrintOptional')}</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeAge} onChange={event => { reset(); setAge(event.currentTarget.checked); }} />{t('cardPrintAge')}</label>
        {card.levelScore && <label className="flex items-center gap-2"><input type="checkbox" checked={includeFit} onChange={event => { reset(); setFit(event.currentTarget.checked); }} />{t('cardPrintFit')}</label>}
        {privateSelected && <button type="button" className="secondary justify-self-start" onClick={() => mutate()}>{t('cardPrivatePreview')}</button>}
      </fieldset>}
      {data && <p className="notice mt-3" role="status">{t('cardPrivateExpires')}</p>}
      {isError && (error instanceof ApiError && error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      {printError && <ErrorMessage />}
      {!ready && <p className="muted mt-3" role="status">{t('cardPrintLoadingPhoto')}</p>}
      <div className="form-footer"><button className="primary" disabled={!ready || isPending || (privateSelected && !data)} onClick={() => print(data)}>{t('cardPrintAction')}</button></div>
    </>}
  </Modal>;
}

function CardContent({ card, details, print = false, onPortraitReady }: { card: PlayerCard; details?: PrivateCardFields; print?: boolean; onPortraitReady?: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en-GB' : 'tr-TR';
  const localized = (value: string) => language === 'tr-TR' ? value.replace('.', ',') : value;
  const fit = details?.fit;
  const fitLabel = fit ? [
    'tier' in fit ? t('fitTierLabel', { tier: fit.tier }) : null, t(`fit_${fit.status}`), fit.example ? t('example') : null,
  ].filter(Boolean).join(' · ') : null;
  const fields = [
    { label: 'documentNationalities', value: card.nationalities.join(' · ') },
    { label: 'cardEuStatus', value: card.euPassport === null ? null : t(card.euPassport ? 'cardYes' : 'cardNo') },
    { label: 'documentHeight', value: card.heightCm },
    { label: 'documentWeight', value: card.weightKg && localized(card.weightKg) },
    { label: 'position', value: t(card.primaryPosition) },
    { label: 'documentSecondary', value: card.secondaryPositions.map(position => t(position)).join(' · ') },
    { label: 'documentFoot', value: card.preferredFoot && t(footLabels[card.preferredFoot]) },
    { label: 'club', value: card.currentClub?.name },
    { label: 'documentLeague', value: card.currentLeague?.name },
    { label: 'playerContractEnd', value: card.contractEndDate && new Intl.DateTimeFormat(language, {
      day: '2-digit', month: language === 'tr-TR' ? '2-digit' : 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(card.contractEndDate)) },
    { label: 'playerMarketValue', value: card.marketValue && (card.marketValueCurrency ? formatMarketAmount(card.marketValue, card.marketValueCurrency, i18n.language) : localized(card.marketValue)) },
    { label: 'playerScore', value: card.levelScore && localized(card.levelScore) },
    ...(details && 'age' in details ? [{ label: 'playerAge', value: details.age }] : []),
    ...(details && 'fit' in details ? [{ label: 'playerFit', value: fitLabel }] : []),
  ];
  return <article className="player-infographic">
    <header className="player-infographic-header">
      <PlayerAvatar id={card.id} version={card.version} available={card.photo} large eager={print} onReady={onPortraitReady} />
      <div className="min-w-0">
        <p className="player-infographic-kicker">{t('cardTitle')}</p>
        <h3>{card.name}</h3>
        {card.isExample && <span className="badge mt-2">{t('example')}</span>}
      </div>
    </header>
    <dl className="player-infographic-grid">{fields.map(({ label, value }) => <div key={label}>
      <dt>{t(label)}</dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>)}</dl>
    {print && <footer className="player-infographic-footer">{t('cardPrintVersion', { version: card.version })}</footer>}
  </article>;
}
