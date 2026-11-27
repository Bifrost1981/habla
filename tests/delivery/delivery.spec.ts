// Auslieferungstest (WP-19, Defekte B5, B6, B7, P1): fertiger Build unter /habla/ mit Service Worker.
import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'habla.progress.v1';

/** Seite unter Kontrolle des Service Workers bringen und warten, bis die App-Dateien vorab gespeichert sind. */
async function controlled(page: Page) {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function seed(page: Page, value: object) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, value] as const);
}

/** Protokolliert Wiedergaben (Aufnahme oder Gerätestimme). */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __log: string[] };
    w.__log = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const el = this as HTMLMediaElement;
      const r = play.call(el);
      r.then(
        () => w.__log.push('ok ' + el.src.split('/').pop()),
        (e: Error) => w.__log.push('fail ' + e.name),
      );
      return r;
    };
    speechSynthesis.speak = (u) => {
      w.__log.push('tts ' + u.text);
    };
  });
}
const playLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: string[] }).__log);

test('Unterpfad: App lädt unter /habla/ ohne Fehler und ohne fremde Server; Schriften aus der App', async ({ page }) => {
  const bad: string[] = [];
  const foreign: string[] = [];
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${new URL(r.url()).pathname}`));
  page.on('request', (r) => new URL(r.url()).hostname !== 'localhost' && foreign.push(r.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('#root h1').first()).toBeVisible();
  // Beide Schriften lassen sich laden – aus der App selbst (fremde Anfragen werden unten geprüft).
  const loaded = await page.evaluate(async () => [
    (await document.fonts.load('600 16px "Bricolage Grotesque"')).length,
    (await document.fonts.load('400 16px Figtree')).length,
    (await document.fonts.load('700 16px Figtree')).length,
  ]);
  expect(loaded.every((n) => n > 0)).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/habla/');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')!.getAttribute('href')!;
    const res = await fetch(href);
    return { status: res.status, json: await res.json() };
  });
  expect(manifest.status).toBe(200);
  expect(manifest.json.start_url).toBe('./');
  expect(bad).toEqual([]);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('Offline nach dem ersten Besuch: App startet und der Lernpfad ist bedienbar', async ({ page, context }) => {
  await controlled(page);
  await seed(page, { onboarded: true });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const app = keys.find((k) => k.startsWith('habla-app-'))!;
    return (await (await caches.open(app)).keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain('/habla/index.html');
  expect(cached.some((p) => /\/habla\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(cached.some((p) => p.endsWith('.woff2'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.node.is-current')).toBeVisible();
  await page.locator('.node.is-current').click();
  await expect(page.locator('.flashcard')).toBeVisible();
  await context.setOffline(false);
});

test('Aufnahmen: einmal gehört, spielen sie offline; Teilanfragen (Range) kommen aus dem Speicher', async ({ page, context }) => {
  await instrument(page);
  await controlled(page);
  await seed(page, { onboarded: true });
  await page.reload();
  await page.locator('.node.is-current').click();
  await expect(page.locator('.flashcard')).toBeVisible();
  await expect.poll(() => playLog(page)).toContainEqual(expect.stringMatching(/^ok .*\.wav$/));
  const first = (await playLog(page)).find((l) => l.startsWith('ok '))!.slice(3);

  await context.setOffline(true);
  await page.getByLabel('Lektion verlassen').click();
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.reload();
  await page.evaluate(() => ((window as unknown as { __log: string[] }).__log = []));
  await page.locator('.node.is-current').click();
  await expect(page.locator('.flashcard')).toBeVisible();
  await expect.poll(() => playLog(page)).toContain(`ok ${first}`);
  expect((await playLog(page)).filter((l) => l.startsWith('tts') || l.startsWith('fail'))).toEqual([]);
  const part = await page.evaluate(async (f) => {
    const res = await fetch(`audio/es-ES/${f}`, { headers: { Range: 'bytes=0-9' } });
    return { status: res.status, len: (await res.arrayBuffer()).byteLength, range: res.headers.get('Content-Range') };
  }, first);
  expect(part).toMatchObject({ status: 206, len: 10 });
  expect(part.range).toMatch(/^bytes 0-9\/\d+$/);
  await context.setOffline(false);
});

test('Einstellungen: alle Aufnahmen offline speichern; Datenschutz-Hinweis zur Spracherkennung', async ({ page, context }) => {
  await controlled(page);
  await seed(page, { onboarded: true });
  await page.reload();
  await page.getByLabel('Einstellungen').click();
  await expect(page.locator('.privacy-note')).toContainText('Chrome und Edge schicken die Aufnahme dafür an Google bzw. Microsoft');
  const row = page.locator('.row', { hasText: 'Aufnahmen offline speichern' });
  await row.getByRole('button', { name: 'Offline speichern' }).click();
  await expect(row).toContainText(/Fertig: (\d+) von \1 Aufnahmen gespeichert/, { timeout: 60_000 });
  const files = await page.evaluate(async () => [...new Set(Object.values((await (await fetch('audio/es-ES/manifest.json')).json()).clips as Record<string, string>))]);
  expect(files.length).toBeGreaterThan(1000);
  await context.setOffline(true);
  // Eine Aufnahme, die nie abgespielt wurde (die letzte im Verzeichnis), ist offline da.
  const last = files[files.length - 1];
  const res = await page.evaluate(async (f) => {
    const r = await fetch(`audio/es-ES/${f}`);
    return { status: r.status, len: (await r.arrayBuffer()).byteLength };
  }, last);
  expect(res.status).toBe(200);
  expect(res.len).toBeGreaterThan(1000);
  await context.setOffline(false);
});
