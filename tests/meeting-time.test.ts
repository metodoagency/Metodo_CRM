import { describe, expect, it } from 'vitest';
import { agendaQuery, agendaRange, meetingCreate, meetingPatch, type MeetingTimeInput } from '../shared/meetings.js';
import { istanbulParts, istanbulTransitions, meetingTimePreview } from '../server/meeting-time.js';

const input = (changes: Partial<MeetingTimeInput> = {}): MeetingTimeInput => ({ date: '2026-11-19', time: '23:30', durationMin: 90, utcOffsetSeconds: null, ...changes });
describe('Istanbul meeting wall times', () => {
  it('resolves current-zone midnight rollover independently of the host timezone', () => {
    expect(meetingTimePreview(input())).toMatchObject({ issue: null, selected: { instant: '2026-11-19T20:30:00.000Z', offsetSeconds: 10800, endDate: '2026-11-20', endTime: '01:00' } });
  });
  it('rejects the historical DST gap instead of silently shifting the meeting', () => {
    expect(meetingTimePreview(input({ date: '2015-03-29', time: '03:30' }))).toMatchObject({ issue: 'GAP', choices: [], selected: null });
  });
  it('requires an explicit offset for the historical repeated hour', () => {
    const ambiguous = input({ date: '2015-11-08', time: '03:30' });
    const preview = meetingTimePreview(ambiguous); expect(preview.issue).toBe('AMBIGUOUS');
    expect(preview.choices.map(choice => [choice.instant, choice.offsetSeconds])).toEqual([['2015-11-08T00:30:00.000Z', 10800], ['2015-11-08T01:30:00.000Z', 7200]]);
    expect(meetingTimePreview({ ...ambiguous, utcOffsetSeconds: 7200 }).selected?.instant).toBe('2015-11-08T01:30:00.000Z');
    expect(meetingTimePreview({ ...ambiguous, utcOffsetSeconds: 3600 }).issue).toBe('OFFSET');
  });
  it('keeps elapsed duration through a clock transition and preserves historical second offsets', () => {
    expect(meetingTimePreview(input({ date: '2015-03-29', time: '02:30', durationMin: 60 })).selected).toMatchObject({ endTime: '04:30', endOffsetSeconds: 10800 });
    expect(meetingTimePreview(input({ date: '1800-01-01', time: '12:00' })).selected).toMatchObject({ offsetSeconds: 6952, offsetLabel: 'UTC+01:55:52', instant: '1800-01-01T10:04:08.000Z' });
    expect(meetingTimePreview(input({ date: '1879-12-31', time: '23:30', durationMin: 60 })).selected).toMatchObject({ endDate: '1880-01-01', endTime: '00:31:04', endOffsetSeconds: 7016 });
  });
  it('bounds both dates and event end dates, including the four-digit year edges', () => {
    expect(meetingTimePreview(input({ date: '9999-12-31', durationMin: 90 })).issue).toBe('END_RANGE');
    expect(meetingTimePreview(input({ date: '0001-01-01', time: '00:00', durationMin: 60 })).selected).toMatchObject({ offsetSeconds: 6952, endDate: '0001-01-01', endTime: '01:00' });
    expect(meetingTimePreview(input({ time: '24:00' })).issue).toBe('INVALID');
    expect(meetingTimePreview(input({ date: '2026-02-30' })).issue).toBe('INVALID');
  });
  it('finds exact historical transition seconds and rejects unbounded scans', () => {
    const changes = istanbulTransitions(Date.parse('2015-11-01T00:00:00Z'), Date.parse('2015-11-15T00:00:00Z'));
    expect(changes).toEqual([{ instant: Date.parse('2015-11-08T01:00:00Z'), from: 10800, to: 7200 }]);
    expect(istanbulParts(changes[0].instant - 1000).offsetSeconds).toBe(10800);
    expect(istanbulParts(changes[0].instant).offsetSeconds).toBe(7200);
    expect(() => istanbulTransitions(0, 65 * 86400_000)).toThrow();
  });
  it('bounds inclusive agenda ranges and strict mutation/reference inputs', () => {
    expect(agendaRange('2026-11-19', 'week')).toMatchObject({ from: '2026-11-16', to: '2026-11-22' });
    expect(agendaRange('2024-02-29', 'month').days).toHaveLength(29);
    expect(agendaRange('9999-12-31', 'month')).toMatchObject({ from: '9999-12-01', to: '9999-12-31' });
    expect(agendaRange('0001-01-01', 'week')).toMatchObject({ from: '0001-01-01', to: '0001-01-07' });
    expect(agendaQuery.safeParse({ from: '2026-01-01', to: '2026-03-03' }).success).toBe(true);
    expect(agendaQuery.safeParse({ from: '2026-01-01', to: '2026-03-04' }).success).toBe(false);
    expect(agendaQuery.safeParse({ from: '9999-12-31', to: '9999-12-31' }).success).toBe(true);
    const draft = { ...input(), name: 'Örnek toplantı', participants: [], agenda: '', notes: '', outcome: null, locationOrUrl: null };
    expect(meetingCreate.safeParse(draft).success).toBe(true);
    expect(meetingCreate.safeParse({ ...draft, ownerId: 'other' }).success).toBe(false);
    const ref = { type: 'Club', id: '11111111-1111-4111-8111-111111111111' };
    expect(meetingCreate.safeParse({ ...draft, participants: [ref, ref] }).success).toBe(false);
    expect(meetingPatch.safeParse({ version: 1, changes: {} }).success).toBe(false);
    expect(meetingCreate.safeParse({ ...draft, notes: '\u0000' }).success).toBe(false);
  });
});
