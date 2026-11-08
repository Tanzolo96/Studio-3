// Walks the jury demo and screenshots every step at 1440 (dashboard) and 390 (app).
// Usage: npm run build && npx vite preview --port 4173 & node tests/shots.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = process.argv[2] ?? 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  if (!sessionStorage.getItem('init')) {
    sessionStorage.setItem('init', '1');
  }
});
const dash = await ctx.newPage();
await dash.setViewportSize({ width: 1440, height: 900 });
await dash.goto(`${BASE}/dashboard`);
await dash.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('qc.app.ready', '1');
});
await dash.reload();
await dash.waitForTimeout(400);
const shot = async (p, name, full = false) => {
  await p.waitForTimeout(350);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log('shot', name);
};
const theme = async (p, surface, t) => {
  await p.evaluate(([s, v]) => localStorage.setItem(`qc.${s}.theme`, v), [surface, t]);
  await p.reload();
};

// 1. Calm overview, both themes
await shot(dash, '01-dash-overview-calm-day', true);
await theme(dash, 'dash', 'night');
await shot(dash, '01-dash-overview-calm-night', true);
await theme(dash, 'dash', 'day');

const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(`${BASE}/app?as=krish`);
await shot(phone, '02-app-krish-calm-day');
await theme(phone, 'app', 'night');
await shot(phone, '02-app-krish-calm-night');
await theme(phone, 'app', 'day');

// 2. Simulator: drift on RF-12
await dash.getByRole('button', { name: 'Simulator' }).click();
await dash.getByRole('button', { name: /Winding sensor drift/ }).click();
await shot(dash, '03-dash-drift');

await phone.goto(`${BASE}/app?as=krish`);
await shot(phone, '04-app-krish-major-takeover');
await phone.goto(`${BASE}/app?as=rohan`);
await shot(phone, '05-app-rohan-test-requests');
await phone.getByRole('link', { name: /Count test on Frame 12/ }).click();
await phone.getByLabel(/Reading/).fill('28.9');
await shot(phone, '06-app-rohan-enter-result');
await phone.getByRole('button', { name: 'Save result' }).click();
await shot(phone, '07-app-rohan-saved');

// 3. Critical
await phone.goto(`${BASE}/app?as=krish`);
await shot(phone, '08-app-krish-critical-takeover');
await theme(phone, 'app', 'night');
await shot(phone, '08-app-krish-critical-takeover-night');
await theme(phone, 'app', 'day');
await dash.getByRole('button', { name: 'Close simulator' }).click();
await shot(dash, '09-dash-critical', true);

// 4. Nobody taps: skip 11 min
await dash.getByRole('button', { name: 'Simulator' }).click();
await dash.getByRole('button', { name: 'Skip 10 min' }).click();
await dash.getByRole('button', { name: 'Skip 5 min' }).click();
await dash.getByRole('button', { name: 'Close simulator' }).click();
await shot(dash, '10-dash-escalated');
await phone.goto(`${BASE}/app?as=priya`);
await shot(phone, '11-app-priya-escalated-takeover');

// 5. Krish responds
await phone.goto(`${BASE}/app?as=krish`);
await phone.getByRole('button', { name: /Seen, I’m on it/ }).click();
await shot(phone, '12-app-krish-ticket-seen', true);
await phone.getByRole('button', { name: /Start work/ }).click();
await phone.getByRole('button', { name: 'Send to a fitter' }).click();
await shot(phone, '13-app-krish-fitter-sheet');
await phone.getByRole('button', { name: 'Send repair job' }).click();
await phone.goto(`${BASE}/app?as=suresh`);
await shot(phone, '14-app-suresh-jobs');
await phone.getByRole('button', { name: 'Mark repair done' }).click();
await phone.goto(`${BASE}/app?as=krish`);
await phone.getByRole('link', { name: /Back/ }).count();
await phone.getByRole('button', { name: /Count test failed/ }).first().click();
await phone.getByRole('button', { name: 'Mark fixed' }).click();
await phone.getByRole('radio', { name: 'Draft setting slipped' }).click();
await shot(phone, '15-app-krish-fixed-sheet');
await phone.getByRole('dialog').getByRole('button', { name: 'Mark fixed' }).click();
await shot(phone, '16-app-krish-fixed', true);

// 6. Priya: held yarn
await dash.goto(`${BASE}/dashboard/held`);
await shot(dash, '17-dash-held', true);
await dash.locator('article', { hasText: 'RF-12' }).getByRole('button', { name: 'Ask for re-test' }).click();
await phone.goto(`${BASE}/app?as=rohan`);
await shot(phone, '17b-app-rohan-retest-request');
await phone.getByRole('link', { name: /Re-test of held yarn/ }).first().click();
await phone.getByLabel(/Reading/).fill('30.0');
await phone.getByRole('button', { name: 'Save result' }).click();
await dash.goto(`${BASE}/dashboard/held`);
const card = dash.locator('article', { hasText: 'RF-12' });
await card.getByRole('radio', { name: 'Release' }).click();
await card.getByRole('textbox').fill('Re-test passed on the held cones');
await shot(dash, '18-dash-held-decide', true);
await card.getByRole('button', { name: 'Release yarn' }).click();
await dash.goto(`${BASE}/dashboard/tickets?x=1`);
await dash.getByRole('combobox', { name: 'Status' }).selectOption('all');
await shot(dash, '19-dash-tickets', true);
await dash.locator('tbody tr').first().click();
await shot(dash, '20-dash-ticket-detail', true);
await theme(dash, 'dash', 'night');
await shot(dash, '20-dash-ticket-detail-night', true);
await theme(dash, 'dash', 'day');

await phone.goto(`${BASE}/app/previous?as=krish`);
await shot(phone, '21-app-previous');
await phone.goto(`${BASE}/app/raise?as=krish`);
await shot(phone, '22-app-raise', true);
await dash.goto(`${BASE}/kit`);
await shot(dash, '23-kit', true);
await dash.setViewportSize({ width: 1440, height: 900 });
await dash.goto(`${BASE}/demo`);
await dash.waitForTimeout(800);
await shot(dash, '24-demo');

await browser.close();
