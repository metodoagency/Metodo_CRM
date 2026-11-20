import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { nextTaskOccurrence, taskCreate, taskDate, taskPatch } from '../shared/tasks.js';
import { taskTr, taskEn } from '../shared/task-locales.js';

describe('task dates and mutation schemas', () => {
  it('skips invalid monthly dates without clamping or catching up to today', () => {
    expect(nextTaskOccurrence('2026-01-31', 'MONTHLY')).toEqual({ nextDate: '2026-03-31', skippedMonths: ['2026-02'], limited: false });
    expect(nextTaskOccurrence('2026-01-30', 'MONTHLY').nextDate).toBe('2026-03-30');
    expect(nextTaskOccurrence('2024-01-29', 'MONTHLY').nextDate).toBe('2024-02-29');
    expect(nextTaskOccurrence('2025-01-29', 'MONTHLY').nextDate).toBe('2025-03-29');
    expect(nextTaskOccurrence('0004-01-29', 'MONTHLY').nextDate).toBe('0004-02-29');
    expect(nextTaskOccurrence('2026-12-31', 'MONTHLY').nextDate).toBe('2027-01-31');
  });
  it('uses calendar dates for weekly recurrence and preserves the no-recurrence choice', () => {
    expect(nextTaskOccurrence('2026-12-31', 'WEEKLY')).toEqual({ nextDate: '2027-01-07', skippedMonths: [], limited: false });
    expect(nextTaskOccurrence('2024-02-25', 'WEEKLY').nextDate).toBe('2024-03-03');
    expect(nextTaskOccurrence('0001-01-01', 'WEEKLY').nextDate).toBe('0001-01-08');
    expect(nextTaskOccurrence('9999-12-31', 'NONE')).toEqual({ nextDate: null, skippedMonths: [], limited: false });
  });
  it('reports the finite date limit and rejects malformed dates', () => {
    expect(nextTaskOccurrence('9999-12-24', 'WEEKLY').nextDate).toBe('9999-12-31');
    expect(nextTaskOccurrence('9999-12-25', 'WEEKLY').limited).toBe(true);
    expect(nextTaskOccurrence('9999-11-30', 'MONTHLY').nextDate).toBe('9999-12-30');
    expect(nextTaskOccurrence('9999-12-31', 'MONTHLY').limited).toBe(true);
    for (const date of ['0000-01-01', '2026-02-30', '10000-01-01', '2026-1-1', 'invalid']) {
      expect(taskDate.safeParse(date).success).toBe(false); expect(() => nextTaskOccurrence(date, 'MONTHLY')).toThrow();
    }
  });
  it('rejects internal fields and direct status transitions', () => {
    const draft = { name: 'Örnek görev', dueDate: '2026-01-31', priority: 'HIGH', recurrence: 'MONTHLY', linkedEntity: null };
    expect(taskCreate.safeParse(draft).success).toBe(true);
    for (const extra of [{ status: 'DONE' }, { generationKey: 'repeat:example' }, { recurrenceGenerated: false }, { ownerId: 'other' }]) {
      expect(taskCreate.safeParse({ ...draft, ...extra }).success).toBe(false);
      expect(taskPatch.safeParse({ version: 1, changes: extra }).success).toBe(false);
    }
    expect(taskPatch.safeParse({ version: 1, changes: {} }).success).toBe(false);
    expect(taskPatch.parse({ version: 1, changes: { name: 'Örnek güncel' } }).changes).toEqual({ name: 'Örnek güncel' });
  });
  it('renders variable messages in both languages', async () => {
    const instance = i18next.createInstance(); await instance.init({ lng: 'tr', resources: { tr: { translation: taskTr }, en: { translation: taskEn } } });
    for (const lng of ['tr', 'en']) {
      expect(instance.t('taskNextDate', { lng, date: '31.03.2026' })).toContain('31.03.2026');
      expect(instance.t('taskSkipped', { lng, months: '2026-02' })).toContain('2026-02');
    }
  });
});
