import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { positionCriteria, positions } from '../shared/domain';
import { criteriaScores, levelScore, playerScoringInput, positionWeights, scoreWeights, weightsFor, type PlayerScoring, type ScoreHistoryEntry } from '../shared/player-scoring';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';
import type { z } from 'zod';

export function PlayerScoringPanel({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['player-scoring', id], queryFn: () => api<PlayerScoring>(`/api/players/${id}/scoring`) });
  const data = query.data;
  const local = i18n.language === 'tr' ? 'tr-TR' : 'en-GB';
  return <section className="panel panel-body mt-5">
    <div className="flex justify-between gap-3 flex-wrap">
      <div><h2>{t('scoringTitle')}</h2>{data && <p className="muted mt-2">{t(data.position)} · {data.score === null ? t('scoringUnrated') : new Intl.NumberFormat(local, { minimumFractionDigits: 1 }).format(Number(data.score))}</p>}</div>
      <button className="secondary" disabled={!data} onClick={() => setEditing(true)}>{t('scoringEdit')}</button>
    </div>
    {query.isError && <ErrorMessage />}
    {!!data?.history.length && <ScoreHistory entries={data.history} />}
    {editing && data && <ScoringForm key={id} id={id} snapshot={data} onClose={() => setEditing(false)} />}
  </section>;
}

function ScoringForm({ id, snapshot, onClose }: { id: string; snapshot: PlayerScoring; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState(snapshot);
  const [scores, setScores] = useState(initial.scores?.map(String) ?? ['', '', '']);
  const [invalid, setInvalid] = useState(false);
  const preview = criteriaScores.safeParse(scores.map(Number));
  const mutation = useMutation({
    mutationFn: (input: z.infer<typeof playerScoringInput>) => api(`/api/players/${id}/scoring`, { method: 'PATCH', body: body(input) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t('scoringEdit')} onClose={onClose}>
    <p className="muted mb-4">{t(initial.position)}</p>
    <form onSubmit={event => {
      event.preventDefault();
      const input = playerScoringInput.safeParse({ version: initial.version, settingsVersion: initial.settingsVersion, scores: scores.map(Number), note: new FormData(event.currentTarget).get('note') });
      setInvalid(!input.success);
      if (input.success) mutation.mutate(input.data);
    }}>
      {positionCriteria[initial.position].map((criterion, index) => <label className="field" key={criterion}>
        <span>{t(`criterion_${criterion}`)} · {t('scoringWeight')} {initial.weights[index]}</span>
        <input type="number" min={1} max={10} step={0.5} required value={scores[index]} aria-label={t(`criterion_${criterion}`)}
          onChange={event => setScores(previous => previous.map((value, row) => row === index ? event.target.value : value))} />
      </label>)}
      {preview.success && <p className="notice mb-4" role="status">{t('scoringPreview')} · {new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1 }).format(levelScore(preview.data, initial.weights))}</p>}
      <label className="field">{t('scoringNote')}<textarea name="note" required maxLength={1000} /></label>
      {invalid && <p className="error" role="alert">{t('invalid')}</p>}
      {mutation.isError && (mutation.error instanceof ApiError && mutation.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={mutation.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}

function ScoreHistory({ entries }: { entries: ScoreHistoryEntry[] }) {
  const { t, i18n } = useTranslation();
  const local = i18n.language === 'tr' ? 'tr-TR' : 'en-GB';
  const score = new Intl.NumberFormat(local, { minimumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(local, { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' });
  const plotted = entries.slice(-20);
  const coordinates = plotted.map((entry, index) => [14 + 292 * index / Math.max(1, plotted.length - 1), 104 - 88 * (entry.score - 1) / 9]);
  return <details className="mt-4"><summary>{t('scoringHistory')}</summary>
    <svg viewBox="0 0 320 120" className="score-history-chart" role="img" aria-label={t('scoringHistory')}>
      <polyline points={coordinates.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} />
      {coordinates.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={4} fill="currentColor" />)}
    </svg>
    <ul className="divide-y">{[...entries].reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className="py-3">
      <strong>{score.format(entry.score)} · {t(entry.position)} · {date.format(new Date(entry.at))}</strong>
      <p className="muted mt-2 break-words whitespace-pre-wrap">{entry.note}</p>
      <ul className="muted text-xs mt-2 space-y-1">{positionCriteria[entry.position].map((criterion, index) => <li key={criterion}>
        {t(`criterion_${criterion}`)} · {score.format(entry.scores[index])} · {t('scoringWeight')} {entry.weights[index]}
      </li>)}</ul>
    </li>)}</ul>
  </details>;
}

type Settings = { version: number; levelWeights: z.infer<typeof positionWeights> };

export function ScoringWeightsPanel() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
  const [position, setPosition] = useState<typeof positions[number]>('GK');
  return <section className="panel panel-body mt-5">
    <h2>{t('scoringWeights')}</h2><p className="muted my-3">{t('scoringWeightsHint')}</p>
    <label className="field max-w-sm">{t('position')}<select aria-label={t('position')} value={position} onChange={event => setPosition(event.target.value as typeof position)}>
      {positions.map(value => <option key={value} value={value}>{t(value)}</option>)}
    </select></label>
    {query.isError && <ErrorMessage />}
    {query.data && <WeightsForm key={`${position}:${query.data.version}`} settings={query.data} position={position} />}
  </section>;
}

function WeightsForm({ settings, position }: { settings: Settings; position: typeof positions[number] }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [invalid, setInvalid] = useState(false);
  const configured = positionWeights.safeParse(settings.levelWeights);
  const existing = configured.success ? configured.data : {};
  const weights = weightsFor(existing, position);
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof scoreWeights>) => api<Settings>('/api/settings', {
    method: 'PATCH', body: body({ version: settings.version, levelWeights: { ...existing, [position]: values } }),
  }), onSuccess: result => {
    client.setQueryData(['settings'], result);
    void client.invalidateQueries({ queryKey: ['player-scoring'] });
  } });
  return <form onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = scoreWeights.safeParse(positionCriteria[position].map(criterion => Number(form.get(criterion))));
    setInvalid(!parsed.success || !configured.success);
    if (parsed.success && configured.success) mutation.mutate(parsed.data);
  }}>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{positionCriteria[position].map((criterion, index) => <label className="field" key={criterion}>
      {t(`criterion_${criterion}`)}<input name={criterion} type="number" min={0} max={100} step={1} required defaultValue={weights[index]} />
    </label>)}</div>
    {(invalid || !configured.success) && <p role="alert" className="error">{t('invalid')}</p>}
    {mutation.isError && <ErrorMessage />}
    <button className="secondary" disabled={mutation.isPending || !configured.success}>{t('scoringSaveWeights')}</button>
  </form>;
}
