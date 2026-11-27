// Reproduktionen der Fehlersuche (nicht Teil des Projekts). Jeder Test beschreibt das BEOBACHTETE Verhalten.
import { expect, test, type Page } from '@playwright/test';
const KEY = 'habla.progress.v1';
type W = { __log: { t: number; kind: string; text: string }[] };

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__log = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { w.__log.push({ t: performance.now(), kind: 'play', text: this.src }); return play.call(this); };
    if ('speechSynthesis' in window) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (u) => { w.__log.push({ t: performance.now(), kind: 'tts', text: u.text }); speak(u); };
    }
  });
}
const log = (page: Page) => page.evaluate(() => (window as unknown as W).__log);
async function seed(page: Page, value: unknown) {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, value]);
  await page.reload();
}

test.describe('ohne Service Worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('B1 beschädigter Speicherstand (lessons: null) → leere Seite', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page, { onboarded: true, lessons: null });
    await page.waitForTimeout(800);
    const html = await page.locator('#root').innerHTML();
    console.log('   root-Länge:', html.length, '| Fehler:', errors[0]);
    expect(html.length).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('B2 fehlende Aufnahmedatei → Gerätestimme startet doppelt', async ({ page }) => {
    await instrument(page);
    await page.route('**/audio/es-ES/hola.wav', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await seed(page, { onboarded: true });
    await page.locator('.node.is-current').click();
    await expect(page.locator('.flashcard')).toBeVisible();
    await page.waitForTimeout(1500);
    const l = await log(page);
    const tts = l.filter((e) => e.kind === 'tts').map((e) => e.text);
    console.log('   Protokoll:', JSON.stringify(l.map((e) => `${e.kind}:${e.text.split('/').pop()}`)));
    expect(tts.filter((x) => x === 'hola.').length).toBeGreaterThanOrEqual(2);
  });

  test('B3 schnelles „Weiter“ → Lösung der alten Übung wird über der neuen gesprochen', async ({ page }) => {
    await instrument(page);
    await seed(page, { onboarded: true, settings: { speechExercises: false } });
    await page.locator('.node.is-current').click();
    // Übung 1 ist eine Karte („hola“), Übung 2 ein Bild-Auswahl.
    await page.getByRole('button', { name: 'Kann ich →' }).click();
    await expect(page.locator('.pick-grid')).toBeVisible();
    await page.waitForTimeout(600);
    await page.locator('.pick-card').first().click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    const sol = (await page.locator('.sheet-solution [lang="es"], .sheet-solution .spoken, .sheet-solution').first().innerText()).split('\n')[0].trim();
    const tClick = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.waitForTimeout(1200);
    const l = (await log(page)).filter((e) => e.t > tClick);
    console.log('   Lösung:', sol, '| nach „Weiter“ gesprochen:', JSON.stringify(l.map((e) => `${Math.round(e.t - tClick)}ms ${e.text}`)));
    expect(l.some((e) => e.text.toLowerCase().includes(sol.toLowerCase().replace(/[.!¡¿?]/g, '')))).toBe(true);
  });

  test('B4 Enter bei offenem „Lektion beenden?“ schaltet dahinter weiter', async ({ page }) => {
    await seed(page, { onboarded: true, settings: { speechExercises: false } });
    await page.locator('.node.is-current').click();
    await page.getByRole('button', { name: 'Kann ich →' }).click();
    await expect(page.locator('.pick-grid')).toBeVisible();
    await page.locator('.pick-card').first().click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await page.getByLabel('Lektion verlassen').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const sheet = await page.locator('.sheet').count();
    const dialog = await page.getByRole('dialog').count();
    console.log('   Feedback-Leiste noch da:', sheet, '| Dialog offen:', dialog);
    expect(sheet).toBe(0);
    expect(dialog).toBe(1);
  });
});

test.describe('mit Service Worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('B5 offline nach dem ersten Besuch → App startet nicht', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    const cached = await page.evaluate(async () => (await (await caches.open('habla-v3')).keys()).map((r) => new URL(r.url).pathname));
    await context.setOffline(true);
    await page.reload().catch(() => {});
    await page.waitForTimeout(1000);
    const html = await page.locator('#root').innerHTML().catch(() => '');
    console.log('   im Cache:', JSON.stringify(cached), '| root-Länge offline:', html.length);
    expect(html.length).toBe(0);
  });

  test('B6 Aufnahmen werden nicht offline verfügbar (Teilantworten 206)', async ({ page, context }) => {
    await instrument(page);
    page.on('response', (r) => { if (r.url().endsWith('hola.wav')) console.log('   Antwort hola.wav:', r.status(), 'Range:', r.request().headers()['range'] ?? '-'); });
    await seed(page, { onboarded: true });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // jetzt kontrolliert der Service Worker die Seite
    await page.locator('.node.is-current').click();
    await expect(page.locator('.flashcard')).toBeVisible();
    await page.waitForTimeout(1500);
    const cached = await page.evaluate(async () => (await (await caches.open('habla-v3')).keys()).map((r) => new URL(r.url).pathname));
    console.log('   im Cache nach Abspielen:', JSON.stringify(cached.filter((p) => p.includes('audio'))));
    await context.setOffline(true);
    await page.getByLabel('Lektion verlassen').click();
    await page.getByRole('button', { name: 'Beenden' }).click();
    await page.reload();
    await page.locator('.node.is-current').click();
    await expect(page.locator('.flashcard')).toBeVisible();
    await page.waitForTimeout(1500);
    const l = (await log(page)).map((e) => `${e.kind}:${e.text.split('/').pop()}`);
    console.log('   offline gespielt:', JSON.stringify(l));
    expect(cached.some((p) => p.endsWith('hola.wav'))).toBe(false);
    expect(l).toContain('tts:hola.');
  });
});
