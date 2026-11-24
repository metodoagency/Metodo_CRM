import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { opportunityStages, type OpportunityRecord, type PipelineStage } from '../shared/pipeline';
import { api } from './api';
import { ErrorMessage } from './components';

export function SponsorshipBoard({ q, selectedStage, open }: { q: string; selectedStage: string; open: (id: string) => void }) {
  const { t } = useTranslation(); const [search, setSearch] = useState(q);
  // One owner search updates up to nine stage queries; debounce typing rather than amplifying every keystroke.
  useEffect(() => { const timer = setTimeout(() => setSearch(q), 300); return () => clearTimeout(timer); }, [q]);
  return <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" aria-label={t('pipelineBoard')}>{opportunityStages.filter(stage => !selectedStage || stage === selectedStage).map(stage => <BoardColumn key={`${stage}:${search}`} stage={stage} q={search} open={open} />)}</section>;
}
function BoardColumn({ stage, q, open }: { stage: PipelineStage; q: string; open: (id: string) => void }) {
  const { t, i18n } = useTranslation(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['opportunities', 'board', stage, q, page], queryFn: () => api<{ items: OpportunityRecord[]; total: number }>(`/api/sponsorship/opportunities?${new URLSearchParams({ stage, q, page: String(page) })}`) });
  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / 50)) : page;
  // A confirmed move/delete can empty the final page while earlier records remain.
  useEffect(() => { if (!query.isError && page > lastPage) setPage(lastPage); }, [page, lastPage, query.isError]);
  return <section className="panel panel-body" aria-label={t(`pipelineStage_${stage}`)}><div className="flex justify-between gap-3 mb-4"><h3 className="text-base">{t(`pipelineStage_${stage}`)}</h3>{!query.isError && query.data && <span className="badge"><span className="sr-only">{t('pipelineStageCount')}: </span>{query.data.total}</span>}</div>{query.isPending && <p role="status">{t('loading')}</p>}{query.isError && <ErrorMessage />}{!query.isError && query.data?.items.map(row => <button key={row.id} className="w-full text-left rounded-xl border border-line p-4 my-2" onClick={() => open(row.id)}><strong>{row.name}</strong><p className="muted text-sm my-2">{row.brand.name}</p><p className="text-sm">{row.players.map(p => p.player?.name ?? t('pipelineUnavailable')).join(' · ')}</p>{row.nextActionDate && <p className="muted text-sm mt-2">{t('pipelineNextDate')}: {new Intl.DateTimeFormat(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: i18n.language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(row.nextActionDate))}</p>}</button>)}{!query.isError && query.data && !query.data.items.length && <p className="muted text-sm">{t('pipelineBoardEmpty')}</p>}{!query.isError && query.data && query.data.total > 50 && <div className="flex gap-2 mt-4"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button><button className="secondary" disabled={page * 50 >= query.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button></div>}</section>;
}
