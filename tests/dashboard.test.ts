import { describe, expect, it } from 'vitest';
import { dashboardDates, dashboardLayout, dashboardWidgetIds, moveDashboardWidget, resolveDashboardLayout } from '../shared/dashboard.js';

describe('dashboard layouts and Istanbul periods', () => {
  it('resolves legacy defaults without mutation and appends new widgets after saved choices', () => {
    const empty: unknown[] = []; expect(resolveDashboardLayout(empty)).toEqual({ layout: dashboardWidgetIds.map(id => ({ id, visible: true })), invalid: false }); expect(empty).toEqual([]);
    const saved = [{ id: 'tasks', visible: false }]; const result = resolveDashboardLayout(saved);
    expect(result.layout[0]).toEqual(saved[0]); expect(result.layout).toHaveLength(dashboardWidgetIds.length); expect(saved).toHaveLength(1);
    expect(resolveDashboardLayout([{ id: 'future', visible: true }])).toMatchObject({ invalid: true, layout: dashboardWidgetIds.map(id => ({ id, visible: true })) });
  });
  it('rejects ambiguous or malformed new saves', () => {
    for (const value of [[{ id: 'tasks', visible: true }, { id: 'tasks', visible: false }], [{ id: 'unknown', visible: true }], [{ id: 'tasks', visible: 'false' }], [{ id: 'tasks', visible: true, extra: 1 }], null]) expect(dashboardLayout.safeParse(value).success).toBe(false);
  });
  it('reorders immutably, retains visibility and respects boundaries', () => {
    const { layout } = resolveDashboardLayout([{ id: 'tasks', visible: false }]); const moved = moveDashboardWidget(layout, 'tasks', 2);
    expect(moved[2]).toEqual({ id: 'tasks', visible: false }); expect(layout[0].id).toBe('tasks');
    expect(moveDashboardWidget(layout, 'tasks', -1)).toBe(layout); expect(moveDashboardWidget(layout, 'tasks', layout.length)).toBe(layout); expect(moveDashboardWidget(layout, 'tasks', 0)).toBe(layout);
  });
  it('uses Istanbul midnight and Monday–Sunday weeks across years', () => {
    expect(dashboardDates(new Date('2026-11-22T20:59:59Z'))).toEqual({ today: '2026-11-22', weekFrom: '2026-11-16', weekTo: '2026-11-22' });
    expect(dashboardDates(new Date('2026-11-22T21:00:00Z'))).toEqual({ today: '2026-11-23', weekFrom: '2026-11-23', weekTo: '2026-11-29' });
    expect(dashboardDates(new Date('2026-12-31T21:00:00Z'))).toEqual({ today: '2027-01-01', weekFrom: '2026-12-28', weekTo: '2027-01-03' });
  });
});
