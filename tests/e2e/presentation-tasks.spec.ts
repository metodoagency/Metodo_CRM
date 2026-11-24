import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PresentationRulePreview } from '../../shared/presentation-tasks';

for (const language of ['tr', 'en']) test(`owner previews and confirms presentation follow-up tasks (${language})`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  expect((await page.request.post('/auth/test', { headers: { origin }, data: { email: 'owner@example.com' } })).ok()).toBe(true);
  const headers = { origin, 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const settings = await (await page.request.get('/api/settings')).json();
  expect((await page.request.patch('/api/settings', { headers, data: { version: settings.version, language, theme: 'dark' } })).ok()).toBe(true);
  const rule = await (await page.request.get('/api/task-rules/presentation')).json();
  if (rule.enabled) {
    const off = await (await page.request.post('/api/task-rules/presentation/preview', { headers, data: { version: rule.version, enabled: false, sourceIds: [] } })).json();
    expect((await page.request.post('/api/task-rules/presentation/confirm', { headers, data: off })).ok()).toBe(true);
  }
  const suffix = `${language} ${Date.now()}`;
  const club = await (await page.request.post('/api/clubs', { headers, data: { name: `Örnek Takip Kulübü ${suffix}` } })).json();
  const person = await (await page.request.post('/api/people', { headers, data: { name: `Örnek Takip Kişisi ${suffix}` } })).json();
  const player = await (await page.request.post('/api/players', { headers, data: { name: `Örnek Takip Oyuncusu ${suffix}`, primaryPosition: 'CM' } })).json();
  expect((await page.request.post('/api/relations', { headers, data: { fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'memberOf' } })).status()).toBe(201);
  const made = await page.request.post('/api/presentations', { headers, data: { clubId: club.id, personId: person.id, playerId: player.id, date: '2026-01-01', followUpDate: '0001-01-01', channel: 'EMAIL', result: 'PENDING', note: '' } });
  expect(made.status()).toBe(201); const source = await made.json();
  if (language === 'en') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const privacy = await (await page.request.get('/api/privacy')).json();
  if (privacy.acknowledgementRequired) {
    await page.getByRole('checkbox', { name: language === 'tr' ? 'Bu sürümdeki bilgilendirmeyi okudum.' : 'I have read this version of the notice.' }).check();
    await page.getByRole('button', { name: language === 'tr' ? 'Okundu olarak kaydet ve devam et' : 'Record as read and continue' }).click();
  }
  await page.goto('/tasks');
  await page.getByRole('button', { name: language === 'tr' ? 'Takip kuralını düzenle' : 'Configure follow-up rule', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: language === 'tr' ? 'Yeni sunumlar için etkinleştir' : 'Enable for new presentations' }).check();
  await dialog.locator('label').filter({ hasText: player.name }).getByRole('checkbox').check();
  const response = page.waitForResponse(response => response.url().endsWith('/api/task-rules/presentation/preview') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: language === 'tr' ? 'Kesin değişiklikleri önizle' : 'Preview exact changes', exact: true }).click();
  const preview: PresentationRulePreview = await (await response).json(); expect(preview.tasks).toHaveLength(1); expect(preview.tasks[0].sourceId).toBe(source.id);
  expect((await page.request.get(`/api/tasks/${preview.tasks[0].id}`)).status()).toBe(404);
  await expect(dialog.getByRole('heading', { name: language === 'tr' ? 'Oluşturulacak görevler: 1' : 'Tasks to create: 1' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`presentation-rule-${language}.png`), fullPage: true });
  await dialog.getByRole('button', { name: language === 'tr' ? 'Kuralı ve görevleri onayla' : 'Confirm rule and tasks', exact: true }).click();
  await expect(dialog).toBeHidden();
  const task = await (await page.request.get(`/api/tasks/${preview.tasks[0].id}`)).json();
  expect(task).toMatchObject({ dueDate: '0001-01-01', status: 'OPEN', recurrence: 'NONE', linkedEntity: { id: source.id }, automation: { current: true } });
  expect((await page.request.post('/api/task-rules/presentation/confirm', { headers, data: preview })).status()).toBe(409);
  await page.goto(`/tasks?task=${task.id}`);
  await expect(page.getByRole('heading', { name: task.name, exact: true })).toBeVisible();
  if (language === 'tr') {
    // A committed response from a closed editor must not discard a newer draft.
    await page.getByRole('button', { name: 'Takip kuralını düzenle', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Yeni sunumlar için etkinleştir' }).uncheck();
    await dialog.getByRole('button', { name: 'Kesin değişiklikleri önizle', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Kuralı ve görevleri onayla', exact: true })).toBeEnabled();
    let release!: () => void; let committed!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const saved = new Promise<void>(resolve => { committed = resolve; });
    await page.route('**/api/task-rules/presentation/confirm', async route => { const response = await route.fetch(); committed(); await held; await route.fulfill({ response }); }, { times: 1 });
    await dialog.getByRole('button', { name: 'Kuralı ve görevleri onayla', exact: true }).click(); await saved;
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Takip kuralını düzenle', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Yeni sunumlar için etkinleştir' }).check();
    const response = page.waitForResponse(response => response.url().endsWith('/api/task-rules/presentation/confirm'));
    release(); await response;
    await dialog.getByRole('button', { name: 'Kesin değişiklikleri önizle', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Önizleme veya ayarlar değişti.');
    await expect(dialog.getByRole('checkbox', { name: 'Yeni sunumlar için etkinleştir' })).toBeChecked();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  }
  const currentRule = await (await page.request.get('/api/task-rules/presentation')).json();
  if (currentRule.enabled) {
    const off = await (await page.request.post('/api/task-rules/presentation/preview', { headers, data: { version: currentRule.version, enabled: false, sourceIds: [] } })).json();
    expect((await page.request.post('/api/task-rules/presentation/confirm', { headers, data: off })).ok()).toBe(true);
  }
});
