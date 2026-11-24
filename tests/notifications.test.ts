import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { effectiveNotificationState, notificationAction, notificationQuery, notificationTransition } from '../shared/notifications.js';
import { notificationTr, notificationEn } from '../shared/notification-locales.js';

describe('notification state and input contracts', () => {
  it('wakes at the exact snooze boundary, including legacy null deadlines', () => {
    const now = new Date('2026-11-19T21:00:00.000Z');
    expect(effectiveNotificationState({ status: 'SNOOZED', snoozedUntil: new Date(now.getTime() + 1) }, now)).toBe('SNOOZED');
    expect(effectiveNotificationState({ status: 'SNOOZED', snoozedUntil: now }, now)).toBe('NEW');
    expect(effectiveNotificationState({ status: 'SNOOZED', snoozedUntil: null }, now)).toBe('NEW');
    expect(effectiveNotificationState({ status: 'READ', snoozedUntil: now }, now)).toBe('READ');
    expect(effectiveNotificationState({ status: 'NEW', snoozedUntil: null }, now)).toBe('NEW');
  });
  it('uses server clock for exact one/seven-day snoozes and clears timestamps on read', () => {
    const now = new Date('2026-12-31T23:59:59.999Z');
    expect(notificationTransition('snooze1', now)).toEqual({ status: 'SNOOZED', snoozedUntil: new Date('2027-01-01T23:59:59.999Z') });
    expect(notificationTransition('snooze7', now)).toEqual({ status: 'SNOOZED', snoozedUntil: new Date('2027-01-07T23:59:59.999Z') });
    expect(notificationTransition('read', now)).toEqual({ status: 'READ', snoozedUntil: null });
  });
  it('rejects caller-defined timestamps/status and bounds pagination', () => {
    expect(notificationQuery.parse({})).toEqual({ page: 1, view: 'unread' });
    for (const page of ['0', '-1', '1.5', '100001', 'Infinity']) expect(notificationQuery.safeParse({ page }).success).toBe(false);
    for (const input of [{ version: 1, action: 'snooze', days: 3 }, { version: 1, action: 'snooze7', snoozedUntil: '2028-01-01' }, { version: 0, action: 'read' }, { version: 1, action: 'delete' }]) expect(notificationAction.safeParse(input).success).toBe(false);
    expect(notificationAction.parse({ version: 3, action: 'read' })).toEqual({ version: 3, action: 'read' });
  });
  it('interpolates both languages without displaying raw templates', async () => {
    const instance = i18next.createInstance();
    await instance.init({ lng: 'tr', resources: { tr: { translation: notificationTr }, en: { translation: notificationEn } } });
    for (const lng of ['tr', 'en']) for (const key of ['notificationUntil', 'notificationThreshold', 'notificationCount']) {
      const result = instance.t(key, { lng, count: 4, days: 30, date: '19.11.2026' });
      expect(result).not.toContain('{{'); expect(result).not.toBe(key);
    }
  });
});
