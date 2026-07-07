import { test, expect } from '@playwright/test';

// Runs against the deterministic seed (2 channels, Apr–Jun 2026). We widen the
// period to cover it, then exercise the core flows (S7.1).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('finance-filters', JSON.stringify({ state: { from: '2026-01-01', to: '2026-07-06', currency: 'USD', theme: 'light' }, version: 0 }));
  });
});

test('overview shows KPIs and channel ranking', async ({ page }) => {
  await page.goto('/');
  // KPI cards render with the revenue/profit chart heading.
  await expect(page.getByRole('heading', { name: /Receita . Custo . Lucro/ })).toBeVisible();
  // Seeded channels appear in the ranking table (link to detail).
  await expect(page.getByRole('link', { name: /REDE F — Alemão/ })).toBeVisible();
  // Unattributed bucket is visible.
  await expect(page.getByText('Não atribuído')).toBeVisible();
});

test('adding a cost changes the profit KPI', async ({ page }) => {
  await page.goto('/');
  const profitCard = page.locator('.card', { hasText: 'Lucro' }).first();
  const before = await profitCard.locator('.tabular').first().innerText();

  await page.goto('/costs');
  await page.getByPlaceholder('Categoria (ex.: TTS)').fill('Teste E2E');
  await page.getByPlaceholder('Valor').fill('123');
  await page.getByText('Compartilhado (rateado)'); // scope default
  await page.getByRole('button', { name: 'Lançar custo' }).click();
  await expect(page.getByText('Teste E2E')).toBeVisible();

  await page.goto('/');
  const after = await profitCard.locator('.tabular').first().innerText();
  expect(after).not.toEqual(before);
});

test('CSV import preview then confirm', async ({ page }) => {
  await page.goto('/costs');
  const csv = 'kind;category;description;amount;currency;channel_id;allocation_rule;allocation_custom;start_date;end_date\none_off;CSV E2E;x;15,00;USD;redef_de;;;2026-06-01;';
  await page.getByPlaceholder('cole o CSV aqui').fill(csv);
  await page.getByRole('button', { name: 'Prévia' }).click();
  await expect(page.getByText(/novos: 1/)).toBeVisible();
  await page.getByRole('button', { name: /Importar/ }).click();
  await expect(page.getByText('CSV E2E')).toBeVisible();
});

test('currency toggle re-renders values', async ({ page }) => {
  await page.goto('/');
  const revCard = page.locator('.card', { hasText: 'Receita' }).first().locator('.tabular').first();
  const usd = await revCard.innerText();
  await page.getByRole('button', { name: 'BRL' }).click();
  await expect(revCard).not.toHaveText(usd);
});

test('settings shows sync sources and Sync now', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('YouTube (AdSense)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeVisible();
});

test('settings shows the FX rate of the day', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText(/taxa do dia/)).toBeVisible();
  await expect(page.getByText(/US\$ 1 = R\$/)).toBeVisible();
});

test('daily revenue page lists days and opens the channel breakdown', async ({ page }) => {
  await page.goto('/daily');
  await expect(page.getByRole('heading', { name: 'Receita diária' })).toBeVisible();
  // Most recent seeded day (30/06/2026) is on top; expanding shows per-channel lines.
  const dayRow = page.getByRole('cell', { name: /30\/06\/2026/ });
  await expect(dayRow).toBeVisible();
  await dayRow.click();
  await expect(page.getByText('REDE F — Alemão')).toBeVisible();
});
