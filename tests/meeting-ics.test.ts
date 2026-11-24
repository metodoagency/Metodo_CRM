import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { meetingCalendar, type CalendarMeeting } from '../server/meeting-ics.js';

const id = '11111111-1111-4111-8111-111111111111';
const sample = (changes: Partial<CalendarMeeting> = {}): CalendarMeeting => ({ id, version: 3, name: 'Örnek Takvim', date: '2026-11-19', time: '23:30', durationMin: 90, utcOffsetSeconds: 10800, ...changes });
function parse(source: string) {
  const calendar = new ICAL.Component(ICAL.parse(source)); const timezone = calendar.getFirstSubcomponent('vtimezone')!;
  ICAL.TimezoneService.register(new ICAL.Timezone({ component: timezone, tzid: 'Europe/Istanbul' }), 'Europe/Istanbul');
  return { calendar, events: calendar.getAllSubcomponents('vevent').map(row => new ICAL.Event(row)) };
}
describe('RFC5545 meeting calendar independent parser', () => {
  it('roundtrips current-zone start, midnight end, stable UID and version sequence with required publish metadata', () => {
    const source = meetingCalendar([sample()], new Date('2026-11-19T12:00:00.123Z')); const { calendar, events } = parse(source); const event = events[0];
    expect(source).toContain('DTSTAMP:20261119T120000Z\r\n');
    expect(calendar.getFirstPropertyValue('method')).toBe('PUBLISH'); expect(calendar.getFirstSubcomponent('vtimezone')).toBeTruthy();
    expect(event.uid).toBe(`urn:uuid:${id}`); expect(event.sequence).toBe(3);
    expect(event.startDate.toUnixTime()).toBe(Date.parse('2026-11-19T20:30:00Z') / 1000);
    expect(event.endDate.toUnixTime()).toBe(Date.parse('2026-11-19T22:00:00Z') / 1000);
    expect(event.component.getFirstPropertyValue('organizer')).toMatch(/^urn:uuid:/);
    expect(source).toContain('DTSTART;TZID=Europe/Istanbul:20261119T233000');
    expect(source).not.toContain('ATTENDEE'); expect(source).not.toContain('DTEND');
    const again = parse(meetingCalendar([sample({ version: 4 })])).events[0]; expect(again.uid).toBe(event.uid); expect(again.sequence).toBe(4);
  });
  it('keeps both fold choices distinct and elapsed duration exact through spring DST', () => {
    for (const [offset, expected] of [[10800, '2015-11-08T00:30:00Z'], [7200, '2015-11-08T01:30:00Z']] as const) {
      const source = meetingCalendar([sample({ date: '2015-11-08', time: '03:30', utcOffsetSeconds: offset })]); const event = parse(source).events[0];
      expect(event.startDate.toUnixTime()).toBe(Date.parse(expected) / 1000); expect(event.endDate.toUnixTime() - event.startDate.toUnixTime()).toBe(5400);
      expect(source).toContain('DTSTART:20151108T0');
    }
    const spring = parse(meetingCalendar([sample({ date: '2015-03-29', time: '02:30', durationMin: 60, utcOffsetSeconds: 7200 })])).events[0];
    expect(spring.startDate.toUnixTime()).toBe(Date.parse('2015-03-29T00:30:00Z') / 1000);
    expect(spring.endDate.toUnixTime()).toBe(Date.parse('2015-03-29T01:30:00Z') / 1000);
  });
  it('uses actual historical offsets and calendar observances across a bounded fall interval', () => {
    const maximum = parse(meetingCalendar([sample({ date: '2015-09-09', time: '00:00', utcOffsetSeconds: null }), sample({ date: '2015-11-09', time: '23:59', durationMin: 1440, utcOffsetSeconds: null })]));
    expect(maximum.events[1].endDate.toUnixTime()).toBe(Date.parse('2015-11-10T21:59:00Z') / 1000);
    const rows = [sample({ date: '2015-11-01', time: '12:00', utcOffsetSeconds: null }), sample({ id: '22222222-2222-4222-8222-222222222222', date: '2015-11-15', time: '12:00', utcOffsetSeconds: null })];
    const source = meetingCalendar(rows); const { events } = parse(source);
    expect(events.map(event => event.startDate.toUnixTime())).toEqual(['2015-11-01T09:00:00Z', '2015-11-15T10:00:00Z'].map(value => Date.parse(value) / 1000));
    expect(source).toContain('DTSTART:20151108T040000'); expect(source).toContain('TZOFFSETFROM:+0300\r\nTZOFFSETTO:+0200');
    const ancient = parse(meetingCalendar([sample({ date: '1800-01-01', time: '12:00', utcOffsetSeconds: null })])).events[0];
    expect(ancient.startDate.toUnixTime()).toBe(Date.parse('1800-01-01T10:04:08Z') / 1000);
  });
  it('escapes property injection and folds Turkish and emoji at75 UTF8 octets without breaking codepoints', () => {
    const name = 'Örnek şĞ😀'.repeat(18) + ',;\\\r\nATTENDEE:mailto:private@example.com';
    const source = meetingCalendar([sample({ name })]);
    for (const line of source.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(source.replaceAll('\r\n', '')).not.toContain('\ufffd'); expect(source.split('\r\n').filter(line => line.startsWith('ATTENDEE:'))).toEqual([]);
    expect(parse(source).events[0].summary).toBe(name.replace('\r\n', '\n'));
    expect(source.endsWith('\r\n')).toBe(true); expect(source.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
  });
  it('rejects unresolved legacy/gap times and unbounded exports instead of shifting or silently truncating', () => {
    expect(() => meetingCalendar([sample({ date: '2015-11-08', time: '03:30', utcOffsetSeconds: null })])).toThrow('MEETING_EXPORT_TIME');
    expect(() => meetingCalendar([sample({ date: '2015-03-29', time: '03:30', utcOffsetSeconds: null })])).toThrow('MEETING_EXPORT_TIME');
    expect(() => meetingCalendar([sample(), sample({ date: '2027-06-01' })])).toThrow('MEETING_EXPORT_LIMIT');
    expect(() => meetingCalendar(Array.from({ length: 1001 }, () => sample()))).toThrow('MEETING_EXPORT_LIMIT');
    expect(parse(meetingCalendar([])).events).toEqual([]);
    expect(() => meetingCalendar([sample({ date: '0001-01-01', time: '00:00', utcOffsetSeconds: null })])).toThrow('MEETING_EXPORT_TIME');
    expect(parse(meetingCalendar([sample({ date: '0001-01-01', time: '12:00', utcOffsetSeconds: null })])).events[0].startDate.year).toBe(1);
  });
});
