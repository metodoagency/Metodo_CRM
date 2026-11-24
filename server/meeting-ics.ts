import { istanbulParts, istanbulTransitions, meetingTimePreview } from './meeting-time.js';
import { AppError } from './core.js';

export type CalendarMeeting = { id: string; version: number; name: string; date: string; time: string; durationMin: number; utcOffsetSeconds: number | null };
const compact = (value: string) => value.replaceAll('-', '').replaceAll(':', '');
const utc = (instant: number) => new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escapeText = (value: string) => value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
const pad = (number: number) => String(number).padStart(2, '0');
function offset(seconds: number) { const n = Math.abs(seconds); return `${seconds < 0 ? '-' : '+'}${pad(Math.floor(n / 3600))}${pad(Math.floor(n % 3600 / 60))}${n % 60 ? pad(n % 60) : ''}`; }
function wall(instant: number) { const parts = istanbulParts(instant); return compact(parts.date) + 'T' + compact(parts.time) + pad(parts.second); }
function fold(line: string) {
  const lines: string[] = []; let current = ''; let length = 0;
  for (const char of line) { const bytes = Buffer.byteLength(char); if (length + bytes > 75) { lines.push(current); current = ' '; length = 1; } current += char; length += bytes; }
  lines.push(current); return lines.join('\r\n');
}
function zone(from: number, to: number) {
  let baseline = from - 3600_000; if (istanbulParts(baseline).year < 1) baseline = from;
  const baseOffset = istanbulParts(baseline).offsetSeconds;
  const lines = ['BEGIN:VTIMEZONE', 'TZID:Europe/Istanbul', 'BEGIN:STANDARD', `DTSTART:${wall(baseline)}`, `TZOFFSETFROM:${offset(baseOffset)}`, `TZOFFSETTO:${offset(baseOffset)}`, 'END:STANDARD'];
  for (const change of istanbulTransitions(baseline, to)) {
    const kind = change.to > change.from ? 'DAYLIGHT' : 'STANDARD';
    // An observance DTSTART is local wall time immediately before the shift.
    const beforeWall = new Date(change.instant + change.from * 1000).toISOString().slice(0, 19);
    lines.push(`BEGIN:${kind}`, `DTSTART:${compact(beforeWall)}`, `TZOFFSETFROM:${offset(change.from)}`, `TZOFFSETTO:${offset(change.to)}`, `END:${kind}`);
  }
  return [...lines, 'END:VTIMEZONE'];
}
export function meetingCalendar(rows: CalendarMeeting[], now = new Date()) {
  if (rows.length > 1000) throw new AppError('MEETING_EXPORT_LIMIT', 409);
  const events = rows.map(row => { const preview = meetingTimePreview({ date: row.date, time: row.time, durationMin: row.durationMin, utcOffsetSeconds: row.utcOffsetSeconds }); if (!preview.selected) throw new AppError('MEETING_EXPORT_TIME', 409); return { row, preview, selected: preview.selected }; });
  const starts = events.map(event => Date.parse(event.selected.instant)); const ends = events.map(event => Date.parse(event.selected.instant) + event.row.durationMin * 60000);
  const first = starts.length ? Math.min(...starts) : now.getTime(); const last = ends.length ? Math.max(...ends) : first;
  // The API bounds the date range. Keep a second bound here for direct callers.
  const dates = rows.map(row => Date.parse(row.date));
  if (dates.length && Math.max(...dates) - Math.min(...dates) >= 62 * 86400_000) throw new AppError('MEETING_EXPORT_LIMIT', 409);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Metodo CRM//Owner Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...zone(first, last)];
  for (const { row, preview, selected } of events) {
    // RFC5545 resolves ambiguous local DTSTART to its first occurrence. UTC also
    // keeps elapsed minutes exact across a transition (including historical seconds).
    const absolute = preview.choices.length > 1 || selected.offsetSeconds !== selected.endOffsetSeconds || selected.offsetSeconds % 60 !== 0;
    if (absolute && (!/^[0-9]{4}-/.test(selected.instant) || selected.instant.startsWith('0000-'))) throw new AppError('MEETING_EXPORT_TIME', 409);
    lines.push('BEGIN:VEVENT', `UID:urn:uuid:${row.id}`, `SEQUENCE:${row.version}`, `DTSTAMP:${utc(now.getTime())}`,
      'ORGANIZER:urn:uuid:00000000-0000-4000-8000-000000000001',
      absolute ? `DTSTART:${utc(Date.parse(selected.instant))}` : `DTSTART;TZID=Europe/Istanbul:${compact(row.date)}T${compact(row.time)}00`,
      `DURATION:PT${row.durationMin}M`, `SUMMARY:${escapeText(row.name)}`, 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
