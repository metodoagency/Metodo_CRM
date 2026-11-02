import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { db } from '../server/db.js';
import { encrypt, blindIndex } from '../server/crypto.js';
import { normalizeSearch, istanbulToday } from '../shared/domain.js';
import { createSuggestion } from '../server/suggestions.js';

export const exampleId = (name: string) => {
  const h = createHash('sha256').update(`metodo-example:${name}`).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
};
const dateAfter = (days: number) => new Date(new Date(`${istanbulToday()}T00:00:00Z`).getTime() + days * 86400_000);
const e = (key: string) => ({ id: exampleId(key), isExample: true });
export async function seedExamples(client: PrismaClient) {
  if (process.env.NODE_ENV === 'production') throw new Error('Example seed is forbidden in production');
  await client.owner.upsert({ where: { id: 'owner' }, create: { id: 'owner', email: encrypt('owner@example.com', 'Owner.email') }, update: {} });
  await client.$transaction(async tx => {
    await tx.continent.createMany({ data: [{ ...e('continent'), name: 'Örnek Avrupa' }], skipDuplicates: true });
    await tx.country.createMany({ data: [{ ...e('country-tr'), name: 'Örnek Türkiye', isoCode: 'TR', continentId: exampleId('continent'), isTracked: true }, { ...e('country-rs'), name: 'Örnek Sırbistan', isoCode: 'RS', continentId: exampleId('continent') }], skipDuplicates: true });
    await tx.league.createMany({ data: [{ ...e('league'), name: 'ÖRNEK Süper Lig', countryId: exampleId('country-tr') }], skipDuplicates: true });
    const clubs = ['Örnek SK A', 'Örnek SK B', 'Örnek FK C'];
    await tx.club.createMany({ data: clubs.map((name, i) => ({ ...e(`club-${i}`), name, searchName: normalizeSearch(name), countryId: exampleId('country-tr'), city: `Örnek Şehir ${i + 1}`, lat: 40 + i * 0.1, lng: 29 + i * 0.1, isTracked: true, relationStatus: i === 0 ? 'ACTIVE' as const : 'WARM' as const, websiteUrl: `https://example.com/club/${i}` })), skipDuplicates: true });
    await tx.ageTeam.createMany({ data: [{ ...e('team-a'), name: 'Örnek SK A A takımı', clubId: exampleId('club-0'), ageCategory: 'A', leagueId: exampleId('league') }, { ...e('team-u19'), name: 'Örnek SK A U19', clubId: exampleId('club-0'), ageCategory: 'U19', leagueId: exampleId('league') }], skipDuplicates: true });
    for (let i = 0; i < 3; i++) {
      const people = Array.from({ length: 3 }, (_, j) => ({ ...e(`person-${i}-${j}`), name: `Örnek ${j === 0 ? 'Antrenör' : 'Yetkili'} ${i + 1} ${j + 1}`, searchName: normalizeSearch(`Örnek ${j === 0 ? 'Antrenör' : 'Yetkili'} ${i + 1} ${j + 1}`), role: j === 0 ? 'HEAD_COACH' as const : 'OFFICIAL' as const, email: encrypt(`contact${i}${j}@example.com`, 'Person.email'), emailIndex: blindIndex(`contact${i}${j}@example.com`) }));
      await tx.person.createMany({ data: people, skipDuplicates: true });
      await tx.relation.createMany({ data: people.map((p, j) => ({ ...e(`member-${i}-${j}`), fromType: 'Person', fromId: p.id, toType: 'Club', toId: exampleId(`club-${i}`), relation: 'memberOf' as const, startDate: dateAfter(-50) })), skipDuplicates: true });
    }
    await tx.agent.createMany({ data: [{ ...e('agent'), name: 'Örnek Menajer', agency: 'Örnek Ajans', countries: ['TR'], markets: ['Örnek Pazar'], networkMemberships: [] }], skipDuplicates: true });
    const birth = `${Number(istanbulToday().slice(0, 4)) - 17}${istanbulToday().slice(4)}`;
    await tx.player.createMany({ data: (['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED'] as const).map((status, i) => ({ ...e(`player-${i}`), name: `Örnek Oyuncu ${i + 1}`, searchName: normalizeSearch(`Örnek Oyuncu ${i + 1}`), status, primaryPosition: i === 0 ? 'CM' as const : 'CF' as const, currentClubId: exampleId(`club-${i % 3}`), currentLeagueId: exampleId('league'), nationalities: ['TR'], secondaryPositions: [], birthDate: i === 1 ? encrypt(birth, 'Player.birthDate') : null, birthDateIndex: i === 1 ? blindIndex(birth) : null, agentId: i === 2 ? exampleId('agent') : null, levelScore: '7.0' })), skipDuplicates: true });
    await tx.guardian.createMany({ data: [{ ...e('guardian'), name: 'Örnek Veli', playerId: exampleId('player-1'), relation: 'Örnek Ebeveyn', phone: encrypt('+900000000000', 'Guardian.phone'), phoneIndex: blindIndex('+900000000000'), parentalConsentDocumentRef: 'https://example.com/consent' }], skipDuplicates: true });
    await tx.medicalRecord.createMany({ data: [{ ...e('medical'), name: 'Örnek Kontrol', playerId: exampleId('player-0'), date: dateAfter(0), type: 'CHECK', resultCategory: 'FIT', summary: encrypt('Örnek kontrol notu', 'MedicalRecord.summary') }], skipDuplicates: true });
    await tx.licenseRecord.createMany({ data: [{ ...e('licence'), name: 'Örnek Lisans', agentId: exampleId('agent'), holder: 'AGENT', issuer: 'Örnek Kurum', referenceNo: 'EXAMPLE-REGISTRATION', issuedAt: dateAfter(-300), expiresAt: dateAfter(45) }], skipDuplicates: true });
    await tx.contract.createMany({ data: [{ ...e('contract'), name: 'Örnek Sözleşme', playerId: exampleId('player-0'), clubId: exampleId('club-0'), type: 'Örnek Temsil', startDate: dateAfter(-340), endDate: dateAfter(25), salaryAmount: encrypt('10000.00', 'Contract.salaryAmount'), salaryCurrency: 'TRY', releaseClause: { amount: '100000.00', currency: 'TRY', validFrom: dateAfter(0).toISOString().slice(0, 10), validTo: dateAfter(15).toISOString().slice(0, 10), met: 'UNKNOWN' } }], skipDuplicates: true });
    await tx.mandate.createMany({ data: [{ ...e('mandate'), name: 'Örnek Yetki', playerId: exampleId('player-3'), clubId: exampleId('club-0'), scope: 'Örnek kapsam', startDate: dateAfter(-30), endDate: dateAfter(90), commissionTerms: encrypt('{}', 'Mandate.commissionTerms') }], skipDuplicates: true });
    await tx.imageRightsAgreement.createMany({ data: [{ ...e('image-rights'), name: 'Örnek Görsel Hakları', playerId: exampleId('player-0'), territories: ['TR'], mediaTypes: ['PHOTO'], productCategory: 'Örnek Kategori', startDate: dateAfter(-30), endDate: dateAfter(90), fee: '0.00', currency: 'TRY', status: 'ACTIVE' }], skipDuplicates: true });
    await tx.request.createMany({ data: [{ ...e('request'), name: 'Örnek Orta Saha Talebi', clubId: exampleId('club-0'), requesterId: exampleId('person-0-1'), position: 'CM', deadline: dateAfter(15), preferredCountries: [], preferredLeagues: [], tags: [] }], skipDuplicates: true });
    await tx.deal.createMany({ data: [{ ...e('deal'), name: 'Örnek Transfer', type: 'TRANSFER', stage: 'OPEN', probability: 50, expectedAmount: '300.00', currency: 'EUR', closeDate: dateAfter(30) }], skipDuplicates: true });
    await tx.commissionTerm.createMany({ data: [{ ...e('commission'), name: 'Örnek Komisyon', dealId: exampleId('deal'), payer: 'Örnek SK A', basis: 'FIXED', fixedAmount: '300.00', currency: 'EUR' }], skipDuplicates: true });
    await tx.paymentSchedule.createMany({ data: [0, 1, 2].map(i => ({ ...e(`installment-${i}`), name: `Örnek Taksit ${i + 1}`, commissionTermId: exampleId('commission'), dueDate: dateAfter(10 + i * 30), amount: '100.00', currency: 'EUR' as const, status: 'OPEN' })), skipDuplicates: true });
    await tx.salesListing.createMany({ data: [{ ...e('sale'), name: 'Örnek Satış', playerId: exampleId('player-3'), clubId: exampleId('club-0'), askingAmount: '10000.00', currency: 'TRY', confidentiality: 'PRIVATE', scope: 'Örnek Kapsam', status: 'OPEN', interestedClubs: [] }], skipDuplicates: true });
    await tx.meeting.createMany({ data: [0, 1].map(i => ({ ...e(`meeting-${i}`), name: `Örnek ${i ? 'Portföy' : 'Transfer'} Görüşmesi`, date: dateAfter(i), time: i ? '14:00' : '11:00', locationOrUrl: 'https://example.com/meeting', participants: [{ type: 'Club', id: exampleId('club-0') }] })), skipDuplicates: true });
    await tx.event.createMany({ data: [{ ...e('event'), name: 'Örnek Deal Done Serbia', dateFrom: dateAfter(60), dateTo: dateAfter(62), city: 'Örnek Şehir', country: 'Örnek Sırbistan', currency: 'EUR' }], skipDuplicates: true });
    await tx.speaker.createMany({ data: (['CANDIDATE', 'INVITED', 'CONFIRMED'] as const).map((pipelineStatus, i) => ({ ...e(`speaker-${i}`), name: `Örnek Konuşmacı ${i + 1}`, eventId: exampleId('event'), personId: exampleId(`person-${i}-1`), currency: 'EUR' as const, pipelineStatus })), skipDuplicates: true });
    await tx.scoutReport.createMany({ data: [0, 1].map(i => ({ ...e(`scout-${i}`), name: `Örnek Gözlem ${i + 1}`, matchDate: dateAfter(-i), teams: 'Örnek SK A · Örnek SK B', minutesWatched: 90, playerId: exampleId(`player-${i}`), relationType: i ? 'TARGET' : 'OWN', performanceScore: '7.5', strengths: 'Örnek güçlü yön', weaknesses: 'Örnek gelişim alanı', opinion: 'Örnek gözlem notu' })), skipDuplicates: true });
    await tx.tool.createMany({ data: [20, 60].map((days, i) => ({ ...e(`tool-${i}`), name: `Örnek Araç ${i + 1}`, provider: 'Örnek Sağlayıcı', plan: 'Örnek Plan', fee: '10.00', currency: 'EUR' as const, renewalDate: dateAfter(days), users: [], decision: 'TRIAL' })), skipDuplicates: true });
    await tx.financeEntry.createMany({ data: [0, 1, 2].map(i => ({ ...e(`finance-${i}`), name: `Örnek Muhasebe ${i + 1}`, date: dateAfter(-i), type: i ? 'EXPENSE' as const : 'INCOME' as const, category: 'Örnek Kategori', amount: '100.00', currency: i === 1 ? 'EUR' as const : 'TRY' as const, exchangeRate: i === 1 ? '40.000000' : '1.000000', exchangeRateDate: dateAfter(-i), rateSource: 'Örnek manuel kur; gerçek piyasa verisi değildir', amountTry: i === 1 ? '4000.00' : '100.00', paymentStatus: 'OPEN' })), skipDuplicates: true });
    await tx.workLog.createMany({ data: [0, 1, 2, 3, 4].map(i => ({ ...e(`work-${i}`), name: `Örnek Çalışma ${i + 1}`, date: dateAfter(-i), summary: 'Örnek çalışma notu', category: 'ADMIN', durationMin: 30, status: 'DONE' })), skipDuplicates: true });
    await tx.updateProposal.createMany({ data: [{ ...e('proposal'), name: 'Örnek Antrenör Ayrılığı', targetType: 'Club', targetId: exampleId('club-0'), type: 'coach_departure', summary: 'Örnek antrenör değişikliği; sahibi tarafından incelenmeli', payload: { personId: exampleId('person-0-0'), effectiveDate: istanbulToday() }, sourceUrl: 'https://example.com/proposal' }], skipDuplicates: true });
    await tx.case.createMany({ data: [{ ...e('case'), name: 'Örnek Dosya', type: 'OTHER', parties: ['Örnek Taraf'], filedAt: dateAfter(-10), nextDeadline: dateAfter(10), deadlineSource: 'owner-authored', status: 'OPEN' }], skipDuplicates: true });
    await tx.transferWindow.createMany({ data: [{ ...e('window'), name: 'Örnek Transfer Dönemi', countryId: exampleId('country-tr'), leagueId: exampleId('league'), opensOn: dateAfter(-10), closesOn: dateAfter(40), sourceNote: 'Örnek dönem; resmi tarih değildir' }], skipDuplicates: true });
    await tx.task.createMany({ data: [{ ...e('task'), name: 'Örnek portföy değerlendirmesi', dueDate: dateAfter(1), priority: 'HIGH', entityType: 'Club', entityId: exampleId('club-0') }], skipDuplicates: true });
  });
  if (!await client.suggestion.findFirst({ where: { requestId: exampleId('request'), isExample: true } })) await createSuggestion(client, { requestId: exampleId('request'), playerId: exampleId('player-0'), personId: exampleId('person-0-1'), whyGoodTransfer: 'Örnek oyun profili uyumu', matchScore: null }, true);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await seedExamples(db); console.log('Example seed ready'); } finally { await db.$disconnect(); }
}
