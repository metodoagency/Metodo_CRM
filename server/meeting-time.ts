import { meetingTimeInput, type MeetingTimeChoice, type MeetingTimeInput, type MeetingTimePreview } from '../shared/meetings.js';
import { taskDate } from '../shared/tasks.js';

export const meetingTimezone = 'Europe/Istanbul';
const formatter = new Intl.DateTimeFormat('en-GB-u-ca-iso8601-nu-latn', {
  timeZone: meetingTimezone, year: 'numeric', era: 'short', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
});
const pad = (value: number, width = 2) => String(value).padStart(width, '0');
export function istanbulParts(instant: number) {
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  const year = values.era === 'BC' ? 1 - Number(values.year) : Number(values.year);
  const offset = /^GMT(?:([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(values.timeZoneName);
  if (!offset) throw new Error('Unsupported Intl timezone offset format');
  const offsetSeconds = offset[1] ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] ?? 0)) : 0;
  return { year, month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second), offsetSeconds,
    date: `${pad(year, 4)}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
export function offsetLabel(seconds: number) {
  const absolute = Math.abs(seconds);
  return `UTC${seconds < 0 ? '-' : '+'}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute % 3600 / 60))}${absolute % 60 ? `:${pad(absolute % 60)}` : ''}`;
}
// All arithmetic is UTC and all display/round trips name the zone explicitly.
// Never use host-local Date constructors or the special Date.UTC year0–99 path.
function naiveInstant(date: string, time: string) { return Date.parse(`${date}T${time}:00Z`); }
export function meetingTimePreview(input: MeetingTimeInput): MeetingTimePreview {
  if (!meetingTimeInput.safeParse(input).success) return { timezone: meetingTimezone, choices: [], selected: null, issue: 'INVALID' };
  const wall = naiveInstant(input.date, input.time);
  const offsets = new Set([-2, -1, 0, 1, 2].map(days => istanbulParts(wall + days * 86400_000).offsetSeconds));
  const choices: MeetingTimeChoice[] = []; let endOutside = false;
  for (const offsetSeconds of offsets) {
    const instant = wall - offsetSeconds * 1000; const local = istanbulParts(instant);
    if (local.date !== input.date || local.time !== input.time || local.second !== 0) continue;
    const end = istanbulParts(instant + input.durationMin * 60000);
    if (!taskDate.safeParse(end.date).success) { endOutside = true; continue; }
    choices.push({ instant: new Date(instant).toISOString(), offsetSeconds, offsetLabel: offsetLabel(offsetSeconds), endDate: end.date, endTime: end.time + (end.second ? `:${pad(end.second)}` : ''), endOffsetSeconds: end.offsetSeconds });
  }
  choices.sort((a, b) => a.instant.localeCompare(b.instant));
  if (!choices.length) return { timezone: meetingTimezone, choices, selected: null, issue: endOutside ? 'END_RANGE' : 'GAP' };
  const selected = input.utcOffsetSeconds === null ? choices.length === 1 ? choices[0] : null : choices.find(choice => choice.offsetSeconds === input.utcOffsetSeconds) ?? null;
  return { timezone: meetingTimezone, choices, selected, issue: selected ? null : input.utcOffsetSeconds !== null ? 'OFFSET' : 'AMBIGUOUS' };
}
export type ZoneTransition = { instant: number; from: number; to: number };
// Bounded exports use interval-specific observances, including historical offsets.
export function istanbulTransitions(from: number, to: number): ZoneTransition[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 64 * 86400_000) throw new Error('Unbounded timezone interval');
  const transitions: ZoneTransition[] = []; let cursor = Math.floor(from / 1000) * 1000; let offset = istanbulParts(cursor).offsetSeconds;
  while (cursor < to) {
    const next = Math.min(cursor + 6 * 3600_000, to); const changed = istanbulParts(next).offsetSeconds;
    if (changed !== offset) {
      let lower = Math.floor(cursor / 1000); let upper = Math.floor(next / 1000);
      while (upper - lower > 1) { const middle = Math.floor((lower + upper) / 2); if (istanbulParts(middle * 1000).offsetSeconds === offset) lower = middle; else upper = middle; }
      transitions.push({ instant: upper * 1000, from: offset, to: changed }); offset = changed;
    }
    cursor = next;
  }
  return transitions;
}
