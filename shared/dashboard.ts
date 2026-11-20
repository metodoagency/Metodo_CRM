import { z } from 'zod';
import { istanbulToday } from './domain.js';
import { agendaRange } from './meetings.js';

export const dashboardWidgetIds = ['summary', 'todayTasks', 'tasks', 'todayMeetings', 'weekMeetings', 'deadlines', 'proposals', 'followUps', 'activity'] as const;
export type DashboardWidgetId = typeof dashboardWidgetIds[number];
export const dashboardLayout = z.array(z.object({ id: z.enum(dashboardWidgetIds), visible: z.boolean() }).strict()).max(dashboardWidgetIds.length)
  .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'DUPLICATE_WIDGET');
export type DashboardLayout = z.infer<typeof dashboardLayout>;
export function resolveDashboardLayout(value: unknown): { layout: DashboardLayout; invalid: boolean } {
  const parsed = dashboardLayout.safeParse(value);
  const saved = parsed.success ? parsed.data : [];
  return { layout: [...saved, ...dashboardWidgetIds.filter(id => !saved.some(row => row.id === id)).map(id => ({ id, visible: true }))], invalid: !parsed.success };
}
export function moveDashboardWidget(layout: DashboardLayout, id: DashboardWidgetId, to: number): DashboardLayout {
  const from = layout.findIndex(row => row.id === id);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= layout.length || from === to) return layout;
  const next = [...layout]; const [row] = next.splice(from, 1); next.splice(to, 0, row); return next;
}
export function dashboardDates(now = new Date()) {
  const today = istanbulToday(now); const week = agendaRange(today, 'week');
  return { today, weekFrom: week.from, weekTo: week.to };
}
