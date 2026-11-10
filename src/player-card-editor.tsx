import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { positions } from '../shared/domain';
import { playerCardWrite, playerFeet, type PlayerCard } from '../shared/player-card';
import { api, ApiError, body } from './api';
import { ErrorMessage, Modal } from './components';

type LinkOption = { id: string; name: string };
export const footLabels = { LEFT: 'documentLeft', RIGHT: 'documentRight', BOTH: 'documentBoth' } as const;

function draft(card: PlayerCard) {
  return {
    nationalities: card.nationalities, euPassport: card.euPassport, heightCm: card.heightCm, weightKg: card.weightKg,
    secondaryPositions: card.secondaryPositions, preferredFoot: card.preferredFoot,
    currentClubId: card.currentClub?.id ?? null, currentLeagueId: card.currentLeague?.id ?? null,
  };
}

export function PlayerCardEditor({ card, onClose }: { card: PlayerCard; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState(card);
  const [error, setError] = useState<'invalid' | 'cardNoChanges'>();
  const [clubSearch, setClubSearch] = useState('');
  const [club, setClub] = useState(initial.currentClub);
  const clubs = useQuery({ queryKey: ['player-card-clubs', clubSearch], queryFn: () => api<{ items: LinkOption[] }>(`/api/clubs?q=${encodeURIComponent(clubSearch)}`) });
  const leagues = useQuery({ queryKey: ['player-options'], queryFn: () => api<{ leagues: LinkOption[] }>('/api/players/options') });
  const clubOptions = mergeOption(clubs.data?.items, club);
  const leagueOptions = mergeOption(leagues.data?.leagues, initial.currentLeague);
  const save = useMutation({
    mutationFn: (input: ReturnType<typeof playerCardWrite.parse>) => api(`/api/players/${initial.id}/card`, { method: 'PATCH', body: body(input) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  return <Modal title={t('cardEdit')} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const before = draft(initial);
      const nationalities = String(data.get('nationalities') ?? '');
      const newFields = {
        nationalities: nationalities === before.nationalities.join('\n') ? before.nationalities : nationalities.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
        euPassport: data.get('euPassport') === '' ? null : data.get('euPassport') === 'yes',
        heightCm: data.get('heightCm') === '' ? null : Number(data.get('heightCm')),
        weightKg: String(data.get('weightKg') ?? '').trim().replace(',', '.') || null,
        secondaryPositions: data.getAll('secondaryPositions'),
        preferredFoot: data.get('preferredFoot') || null,
        currentClubId: club?.id ?? null, currentLeagueId: data.get('currentLeagueId') || null,
      };
      // Compare position sets so editing an unrelated field preserves the stored order.
      const visiblePositions = before.secondaryPositions.filter(position => position !== initial.primaryPosition);
      const positionsChanged = visiblePositions.length !== newFields.secondaryPositions.length
        || visiblePositions.some(position => !newFields.secondaryPositions.includes(position));
      const changes = Object.fromEntries(Object.entries(newFields).filter(([key, value]) => key === 'secondaryPositions'
        ? positionsChanged : JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])));
      if (!Object.keys(changes).length) { setError('cardNoChanges'); return; }
      const input = playerCardWrite.safeParse({ version: initial.version, changes, sourceUrl: data.get('sourceUrl') || undefined });
      setError(input.success ? undefined : 'invalid');
      if (input.success) save.mutate(input.data);
    }}>
      <label className="field">{t('documentNationalities')}<textarea name="nationalities" rows={3} defaultValue={initial.nationalities.join('\n')} />
        <small className="muted">{t('cardNationalityHint')}</small>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field">{t('cardEuStatus')}<select name="euPassport" aria-label={t('cardEuStatus')} defaultValue={initial.euPassport === null ? '' : initial.euPassport ? 'yes' : 'no'}>
          <option value="">{t('empty')}</option><option value="yes">{t('cardYes')}</option><option value="no">{t('cardNo')}</option>
        </select></label>
        <label className="field">{t('documentHeight')}<input name="heightCm" type="number" step="1" defaultValue={initial.heightCm ?? ''} /></label>
        <label className="field">{t('documentWeight')}<input name="weightKg" inputMode="decimal" defaultValue={initial.weightKg ?? ''} /></label>
      </div>
      <fieldset className="border rounded-lg px-3 py-3 mb-4">
        <legend className="px-2">{t('documentSecondary')}</legend>
        <div className="flex flex-wrap gap-3">{positions.filter(position => position !== initial.primaryPosition).map(position => <label className="flex items-center gap-2" key={position}>
          <input type="checkbox" name="secondaryPositions" value={position} defaultChecked={initial.secondaryPositions.includes(position)} />{t(position)}
        </label>)}</div>
      </fieldset>
      <label className="field">{t('documentFoot')}<select name="preferredFoot" aria-label={t('documentFoot')} defaultValue={initial.preferredFoot ?? ''}>
        <option value="">{t('empty')}</option>{playerFeet.map(foot => <option key={foot} value={foot}>{t(footLabels[foot])}</option>)}
      </select></label>
      <label className="field">{t('cardClubSearch')}<input value={clubSearch} maxLength={100} onChange={event => setClubSearch(event.currentTarget.value)} /></label>
      <label className="field">{t('club')}<select name="currentClubId" aria-label={t('club')} value={club?.id ?? ''}
        onChange={event => setClub(clubOptions.find(option => option.id === event.currentTarget.value) ?? null)}>
        <option value="">{t('empty')}</option>{clubOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>
      <label className="field">{t('documentLeague')}<select name="currentLeagueId" aria-label={t('documentLeague')} defaultValue={initial.currentLeague?.id ?? ''}>
        <option value="">{t('empty')}</option>{leagueOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>
      <label className="field">{t('sourceAddress')}<input name="sourceUrl" type="url" maxLength={2048} /></label>
      {(clubs.isError || leagues.isError) && <ErrorMessage />}
      {error && <p className="error" role="alert">{t(error)}</p>}
      {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p> : <ErrorMessage />)}
      <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
    </form>
  </Modal>;
}

function mergeOption(options: LinkOption[] = [], selected: LinkOption | null) {
  return selected && !options.some(option => option.id === selected.id) ? [selected, ...options] : options;
}
