// Ende-zu-Ende-Test: Habla im echten Browser bedienen (nur Maus/Touch, keine Tastatur).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clipKey } from '../../src/lib/audioKey.ts';
import { buildAssessment, type AssessmentItem } from '../../src/lib/assessment.ts';
import { expandCourse, type MoreContent } from '../../src/lib/generate.ts';
import { STORIES } from '../../src/content/stories.ts';
import { ROLEPLAYS } from '../../src/content/roleplays.ts';
import { CAN_DO } from '../../src/content/cando.ts';

const STORAGE_KEY = 'habla.progress.v1';

/* ───── Testdaten aus den Kursdateien ───── */

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const course = read('../../src/content/course.json') as { vocab: { es: string; de: string }[] };
const more = read('../../src/content/more.json') as { units: { lessons: { words: string[][] }[] }[] };
const esToDe = new Map<string, string>(course.vocab.map((v) => [v.es, v.de]));
for (const u of more.units) for (const l of u.lessons) for (const w of l.words) esToDe.set(w[1], w[2]);

/** Lektionen einer Einheit, aus den Kursdateien (nicht von Hand: Einheiten können Lektionen dazubekommen). */
const lessonIds = (unitId: string) => expandCourse(course as never, more as unknown as MoreContent).units.find((u) => u.id === unitId)!.lessons.map((l) => l.id);
const DONE_THROUGH_UNIT_2 = [...lessonIds('u1'), ...lessonIds('u2')];

/* ───── Hilfen ───── */

/** Sammelt Fehler der Seite. Ausgenommen: Webfonts und fehlende Aufnahmen (beides optional). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location().url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com|\/audio\//.test(url) || /fonts\.(googleapis|gstatic)/.test(m.text())) return;
    errors.push(`console: ${m.text()} ${url}`);
  });
  return errors;
}

async function seedProgress(page: Page, done: string[], extra: Record<string, unknown> = {}) {
  await page.goto('/');
  await page.evaluate(
    ([key, done, extra]) => {
      const lessons = Object.fromEntries(done.map((id) => [id, { accuracy: 0.9, completedAt: new Date().toISOString() }]));
      localStorage.setItem(key, JSON.stringify({ onboarded: true, lessons, ...extra }));
    },
    [STORAGE_KEY, done, extra] as const,
  );
  await page.reload();
}

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, 'kein seitliches Scrollen').toBeLessThanOrEqual(client);
}

/**
 * Spielt die geöffnete Lektion bis zum Ergebnis durch und gibt zurück, welche Übungstypen vorkamen.
 * Jede Übung wird nur mit Klicks, Ziehen oder dem Mikrofon-Knopf bedient.
 */
type Solver = (page: Page, seen: Set<string>) => Promise<boolean>;

/**
 * `solve` darf Übungen selbst lösen (gibt dann true zurück); sonst greift die einfache Bedienung unten.
 * Lektionen haben seit WP-05 bis zu 20 Übungen, daher mehr Schritte als früher.
 */
async function playLesson(page: Page, maxSteps = 200, solve?: Solver): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let step = 0; step < maxSteps; step++) {
    await page.waitForTimeout(120);
    if (await page.locator('.result').count()) return seen;
    if (solve && (await solve(page, seen))) continue;
    if (await page.locator('.sheet').count()) {
      await page.getByRole('button', { name: 'Weiter' }).click();
      continue;
    }
    if (await page.locator('.flashcard').count()) {
      seen.add('card');
      await page.locator('.flashcard').click({ position: { x: 170, y: 300 } });
      await expect(page.locator('.flashcard.is-flipped')).toHaveCount(1);
      await page.getByRole('button', { name: 'Kann ich →' }).click();
      await page.waitForTimeout(450);
      continue;
    }
    if (await page.locator('.pick-grid').count()) {
      seen.add('pick');
      await page.locator('.pick-card').nth(step % 4).click();
      await page.getByRole('button', { name: 'Prüfen' }).click();
      continue;
    }
    if (await page.locator('.match-grid').count()) {
      seen.add('match');
      const left = page.locator('.match-col').nth(0).locator('button:not([disabled])');
      const n = await left.count();
      for (let i = 0; i < n; i++) {
        const btn = page.locator('.match-col').nth(0).locator('button:not([disabled])').first();
        const es = (await btn.innerText()).trim();
        const de = esToDe.get(es);
        expect(de, `Übersetzung für „${es}“`).toBeTruthy();
        await btn.click();
        await page.locator('.match-col').nth(1).getByText(de!, { exact: true }).click();
        await page.waitForTimeout(120);
      }
      continue;
    }
    if (await page.locator('.gap-sentence').count()) {
      seen.add('gap');
      const tile = await page.locator('.tile-bank .tile').first().boundingBox();
      const slot = await page.locator('.gap-slot').boundingBox();
      // Ziehen & Ablegen mit der Maus (Pointer Events)
      await page.mouse.move(tile!.x + tile!.width / 2, tile!.y + tile!.height / 2);
      await page.mouse.down();
      await page.mouse.move(tile!.x + 40, tile!.y - 40, { steps: 4 });
      await page.mouse.move(slot!.x + slot!.width / 2, slot!.y + slot!.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(page.locator('.gap-slot.is-filled')).toHaveCount(1);
      await page.getByRole('button', { name: 'Prüfen' }).click();
      continue;
    }
    if (await page.locator('.speak-card').count()) {
      seen.add((await page.locator('.say-card').count()) ? 'say' : 'speak');
      const mic = await page.locator('.mic-btn').boundingBox();
      await page.mouse.move(mic!.x + mic!.width / 2, mic!.y + mic!.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(600);
      if (await page.locator('.speak-card').count()) await page.getByText('Gerade nicht sprechen').click();
      continue;
    }
    if (await page.locator('.build-line').count()) {
      seen.add((await page.locator('.dictation').count()) ? 'dictation' : 'build');
      const bank = page.locator('.tile-bank .tile:not(.is-used)');
      const k = Math.min(3, await bank.count());
      for (let i = 0; i < k; i++) await page.locator('.tile-bank .tile:not(.is-used)').first().click();
      await page.getByRole('button', { name: 'Prüfen' }).click();
      continue;
    }
    throw new Error(`Unbekannter Bildschirm in Schritt ${step}`);
  }
  throw new Error(`Lektion nach ${maxSteps} Schritten nicht abgeschlossen`);
}

/* ───── Tests ───── */

test('Onboarding und erste Lektion bis zum Ergebnis', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('radio', { name: /Spanien/ }).first().click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Normal/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('.ob-actions .btn').click();
  // Letzter Schritt (WP-18): Vortest anbieten; hier überspringen
  await expect(page.locator('.ob-pretest h1')).toHaveText('Erst ein kurzer Vortest?');
  await page.getByRole('button', { name: 'Überspringen – zur ersten Lektion' }).click();

  const seen = await playLesson(page);
  await expect(page.locator('.result-title')).toBeVisible();
  // Schritt- und Wiederholungsdaten gespeichert
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(Object.keys(stored.lessons ?? {})).toContain('u1l1');
  expect(Object.keys(stored.srs ?? {}).length).toBeGreaterThan(5);
  expect(stored.streak?.count).toBe(1);
  expect(stored.settings?.dialect).toBe('es-ES');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.locator('.node.is-done')).toHaveCount(1);
  for (const t of ['card', 'pick', 'match', 'gap', 'build', 'dictation']) expect(seen, `Übungstyp ${t}`).toContain(t);
  // Nachsprechen erscheint als Sprechübung oder (ohne Spracherkennung im Testbrowser) als „Satz bauen“
  expect(seen.has('speak') || seen.has('build')).toBe(true);
  expect(errors).toEqual([]);
});

test('Erzeugte Lektion (Einheit 3) im Dunkelmodus', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await seedProgress(page, DONE_THROUGH_UNIT_2);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg, 'dunkler Hintergrund').toBe('rgb(27, 19, 14)');
  await expect(page.locator('.node.is-current')).toHaveCount(1);
  await page.locator('.node.is-current').click();
  const seen = await playLesson(page);
  for (const t of ['card', 'pick', 'match', 'gap', 'dictation']) expect(seen, `Übungstyp ${t}`).toContain(t);
  await page.getByRole('button', { name: 'Weiter' }).click();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(Object.keys(stored.lessons)).toContain('u3l1');
  expect(errors).toEqual([]);
});

test('Einstellungen: Tempo wird gespeichert', async ({ page }) => {
  const errors = watchErrors(page);
  await seedProgress(page, []);
  await page.getByLabel('Einstellungen').click();
  await page.getByRole('radio', { name: 'Langsam' }).click();
  await expect(page.getByRole('radio', { name: 'Langsam' })).toHaveAttribute('aria-checked', 'true');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(stored.settings.rate).toBe('slow');
  await page.getByLabel('Zurück').click();
  await expect(page.locator('.path')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Schmale Breite 360 px ohne seitliches Scrollen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedProgress(page, DONE_THROUGH_UNIT_2);
  await noHorizontalScroll(page);
  await page.locator('.node.is-current').click();
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await page.getByLabel('Lektion verlassen').click();
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.getByLabel('Einstellungen').click();
  await noHorizontalScroll(page);
});

/** Kurze stumme WAV-Datei (0,4 s), damit der Abspielweg ohne echte Aufnahmen geprüft werden kann. */
function silentWav(seconds = 0.4, rate = 8000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}

test('Vorab vertonte Aufnahme wird statt der Gerätestimme abgespielt', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __played: string[]; __tts: number };
    w.__played = [];
    w.__tts = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      w.__played.push(this.src);
      return play.call(this);
    };
    if ('speechSynthesis' in window) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (u) => {
        w.__tts++;
        speak(u);
      };
    }
  });
  const manifest = {
    dialect: 'es-ES',
    provider: 'test',
    voice: 'test',
    voiceLabel: 'Teststimme',
    createdAt: '2026-11-14T00:00:00Z',
    clips: { [clipKey('hola')]: 'hola-test.wav' },
  };
  await page.route('**/audio/es-ES/manifest.json', (r) => r.fulfill({ json: manifest }));
  await page.route('**/audio/es-ES/hola-test.wav', (r) => r.fulfill({ body: silentWav(), contentType: 'audio/wav' }));

  await seedProgress(page, []);
  await page.locator('.node.is-current').click();
  // Erste Übung ist die Karteikarte „hola“, sie wird automatisch vorgelesen.
  await expect(page.locator('.flashcard')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __played: string[] }).__played.join(' '))).toContain('/audio/es-ES/hola-test.wav');
  expect(await page.evaluate(() => (window as unknown as { __tts: number }).__tts), 'keine Gerätestimme für „hola“').toBe(0);
  // In den Einstellungen erscheint die Aufnahmen-Stimme
  await page.getByLabel('Lektion verlassen').click();
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.getByLabel('Einstellungen').click();
  await expect(page.locator('.voice-rec')).toContainText('Teststimme');
  expect(errors).toEqual([]);
});

/* ───── Robustheit (WP-17, Befunde B1–B4 der Fehlersuche) ───── */

/** Protokolliert jedes Vorlesen (Aufnahme und Gerätestimme) mit Zeitstempel. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __log: { t: number; kind: string; text: string }[] };
    w.__log = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      w.__log.push({ t: performance.now(), kind: 'play', text: this.src });
      return play.call(this);
    };
    if ('speechSynthesis' in window) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (u) => {
        w.__log.push({ t: performance.now(), kind: 'tts', text: u.text });
        speak(u);
      };
    }
  });
}
const speechLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __log: { t: number; kind: string; text: string }[] }).__log);

/** Erste Lektion öffnen und die Karteikarte „hola“ überspringen; danach ist eine Bild-Auswahl offen. */
async function openFirstPick(page: Page) {
  await page.locator('.node.is-current').click();
  await page.getByRole('button', { name: 'Kann ich →' }).click();
  await expect(page.locator('.pick-grid')).toBeVisible();
}

test('B1 Beschädigter Speicherstand: App startet trotzdem', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ onboarded: true, lessons: null, srs: [1, 2], streak: 'x', settings: { dialect: 'es-AR', rate: 7 } }));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('.node.is-current')).toBeVisible();
  expect(errors).toEqual([]);
});

test('B2 Fehlende Aufnahmedatei: Gerätestimme springt genau einmal ein', async ({ page }) => {
  await recordSpeech(page);
  const manifest = { dialect: 'es-ES', provider: 'test', voice: 'test', voiceLabel: 'Teststimme', createdAt: '2026-11-15T00:00:00Z', clips: { [clipKey('hola')]: 'fehlt.wav' } };
  await page.route('**/audio/es-ES/manifest.json', (r) => r.fulfill({ json: manifest }));
  await page.route('**/audio/es-ES/fehlt.wav', (r) => r.fulfill({ status: 404, body: 'fehlt' }));
  await seedProgress(page, []);
  await page.locator('.node.is-current').click();
  await expect(page.locator('.flashcard')).toBeVisible();
  await expect.poll(async () => (await speechLog(page)).filter((e) => e.kind === 'tts').length).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  const tts = (await speechLog(page)).filter((e) => e.kind === 'tts').map((e) => e.text);
  expect(tts, 'Gerätestimme nur einmal').toEqual(['hola.']);
});

test('B3 Schnelles „Weiter“: Lösung der alten Übung wird nicht mehr vorgelesen', async ({ page }) => {
  await recordSpeech(page);
  await seedProgress(page, [], { settings: { speechExercises: false } });
  await openFirstPick(page);
  await page.waitForTimeout(600);
  await page.locator('.pick-card').first().click();
  // „Prüfen“ und gleich danach „Weiter“ in der Seite selbst klicken: Playwright würde vor dem Klick warten, bis die
  // Feedback-Leiste fertig eingeblendet ist, und auf langsamen Rechnern käme der Klick erst nach der Lösung (350 ms).
  // Gemessen wird der Zeitpunkt des echten Klicks auf „Weiter“.
  const { solution, tCheck, tClick } = await page.evaluate(async () => {
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
    const tCheck = performance.now();
    button('Prüfen')!.click();
    let weiter = button('Weiter');
    while (!weiter && performance.now() - tCheck < 2000) {
      await new Promise((r) => setTimeout(r, 5));
      weiter = button('Weiter');
    }
    const text = document.querySelector<HTMLElement>('.sheet-solution')?.innerText ?? '';
    const tClick = performance.now();
    weiter!.click();
    return { solution: text.split('\n')[0].trim().toLowerCase(), tCheck, tClick };
  });
  expect(tClick - tCheck, '„Weiter“ kommt vor dem Vorlesen der Lösung').toBeLessThan(300);
  await page.waitForTimeout(1200);
  const after = (await speechLog(page)).filter((e) => e.t > tClick).map((e) => e.text.toLowerCase());
  expect(solution.length).toBeGreaterThan(0);
  expect(after.filter((x) => x.includes(solution.replace(/[.!¡¿?]/g, ''))), `„${solution}“ nach dem Weiterschalten`).toEqual([]);
});

test('B4 Dialog „Lektion beenden?“ sperrt Tasten der Übung dahinter', async ({ page }) => {
  await seedProgress(page, [], { settings: { speechExercises: false } });
  await openFirstPick(page);
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await page.getByLabel('Lektion verlassen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('.sheet'), 'Feedback-Leiste bleibt').toBeVisible();
  // Enter löst den fokussierten Knopf „Weiterlernen“ aus und schließt nur den Dialog.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Karteikarte: Pfeiltasten wirken nicht, solange der Dialog offen ist
  await page.getByLabel('Lektion verlassen').click();
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.locator('.node.is-current').click();
  await expect(page.locator('.flashcard')).toBeVisible();
  await page.getByLabel('Lektion verlassen').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Weiterlernen' }).click();
  await expect(page.locator('.flashcard'), 'Karte nicht bewertet').toBeVisible();
});

/* ───── Wiederholung mit FSRS (WP-04) ───── */

test('Fortschritt aus Version 0.3 (Leitner) wird übernommen und mit FSRS weitergeplant', async ({ page }) => {
  const errors = watchErrors(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const legacy = {
    hola: { box: 3, due: today, lapses: 0, seen: 3 },
    gracias: { box: 1, due: today, lapses: 2, seen: 4 },
    adios: { box: 5, due: '2099-01-01', lapses: 0, seen: 6 },
  };
  await seedProgress(page, ['u1l1'], { srs: legacy, settings: { speechExercises: false } });
  // Fällig sind genau die zwei Wörter mit heutigem Termin
  await expect(page.locator('.review-btn')).toContainText('2 Wörter fällig');
  await page.locator('.review-btn').click();
  await playLesson(page);
  await expect(page.locator('.result')).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), STORAGE_KEY);
  for (const id of ['hola', 'gracias']) {
    const e = saved.srs[id];
    expect(e.box, `${id}: kein Leitner-Fach mehr`).toBeUndefined();
    expect(e.stability, `${id}: Stabilität`).toBeGreaterThan(0);
    expect(e.last, `${id}: heute wiederholt`).toBe(today);
    expect(e.due > today, `${id}: neuer Termin in der Zukunft`).toBe(true);
  }
  // Nicht wiederholtes Wort: übernommen, Termin unverändert
  expect(saved.srs.adios.due).toBe('2099-01-01');
  expect(saved.srs.adios.stability).toBe(30);
  expect(saved.reviewLog.map((l: { id: string }) => l.id).sort()).toEqual(expect.arrayContaining(['gracias', 'hola']));
  await page.locator('.result').getByRole('button').last().click();
  await expect(page.locator('.review-btn')).toContainText('Nichts fällig');
  expect(errors).toEqual([]);
});

/* ───── Mehr Abruf (WP-05): Hör-Diktat und Übersetzen-Sprechen ───── */

/** Ersetzt die Spracherkennung: Beim Loslassen des Mikrofons wird `window.__sttNext` als Gehörtes geliefert. */
async function fakeRecognition(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sttNext: string; __sttStarts: number; SpeechRecognition: unknown };
    w.__sttNext = '';
    w.__sttStarts = 0;
    type Handler = ((e: unknown) => void) | null;
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: Handler = null;
      start() {
        w.__sttStarts += 1;
      }
      stop() {
        const text = w.__sttNext;
        setTimeout(() => {
          if (text) this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.9 } } } });
          this.onend?.(null);
        }, 20);
      }
      abort() {}
    }
    w.SpeechRecognition = FakeRecognition;
  });
}

/** Mikrofon-Knopf mit der Maus halten und loslassen; `heard` ist, was die Spracherkennung „versteht“. */
async function holdMic(page: Page, heard: string) {
  await page.evaluate((t) => ((window as unknown as { __sttNext: string }).__sttNext = t), heard);
  const mic = await page.locator('.mic-btn').boundingBox();
  await page.mouse.move(mic!.x + mic!.width / 2, mic!.y + mic!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/** Satz aus Kacheln legen (nur Klicks). */
async function tapTiles(page: Page, sentence: string) {
  for (const word of sentence.replace(/[¿?¡!.,;:]/g, ' ').split(/\s+/).filter(Boolean)) {
    await page.locator('.tile-bank .tile:not(.is-used)').getByText(word, { exact: true }).first().click();
  }
}

test('Hör-Diktat und Übersetzen-Sprechen: Abruf ohne Vorlage, nur mit Klicks und Mikrofon', async ({ page }) => {
  const errors = watchErrors(page);
  await recordSpeech(page);
  await fakeRecognition(page);
  await seedProgress(page, DONE_THROUGH_UNIT_2);

  // Deutsch → Spanisch für die Lektion u3l1 (Sätze und Beispielsätze der Wörter)
  const spec = (more.units as unknown as { lessons: { id: string; words: string[][]; sentences: string[][] }[] }[])
    .flatMap((u) => u.lessons)
    .find((l) => l.id === 'u3l1')!;
  const deToEs = new Map<string, string>();
  for (const s of spec.sentences) deToEs.set(s[1], s[0]);
  for (const w of spec.words) if (!deToEs.has(w[5])) deToEs.set(w[5], w[4]);
  const esOf = async () => {
    const de = (await page.locator('.ex-prompt-de').innerText()).trim();
    const es = deToEs.get(de);
    expect(es, `Spanisch für „${de}“`).toBeTruthy();
    return es!;
  };

  const count = { dictation: 0, say: 0, speak: 0, build: 0, sayFailed: 0 };
  let mark = 0; // Länge des Vorlese-Protokolls vor der aktuellen Übung
  let failedOnce = false;

  const solve: Solver = async (page, seen) => {
    if (await page.locator('.sheet').count()) return false;
    if (await page.locator('.dictation').count()) {
      seen.add('dictation');
      // Weder Text noch Übersetzung sichtbar; Prüfen ist gesperrt, solange nichts gelegt ist.
      await expect(page.locator('.dictation .spoken')).toHaveCount(0);
      await expect(page.locator('.dictation .ex-prompt-de')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Prüfen' })).toBeDisabled();
      await noHorizontalScroll(page);
      // Der Satz wird von selbst vorgelesen: Das Gehörte ist die einzige Quelle für die Lösung.
      await expect.poll(async () => (await speechLog(page)).slice(mark).filter((e) => e.kind === 'tts').length, { message: 'Diktat wird vorgelesen' }).toBeGreaterThan(0);
      const heard = (await speechLog(page)).slice(mark).filter((e) => e.kind === 'tts')[0].text;
      await tapTiles(page, heard);
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await expect(page.locator('.sheet-good'), `Diktat „${heard}“ richtig gelegt`).toHaveCount(1);
      await expect(page.locator('.sheet-de')).not.toBeEmpty();
      count.dictation += 1;
      return true;
    }
    if (await page.locator('.say-card').count()) {
      seen.add('say');
      const es = await esOf();
      // Vor dem Sprechen: kein spanischer Text, kein Vorlese-Knopf, nichts vorgelesen.
      await expect(page.locator('.say-card .spoken')).toHaveCount(0);
      await expect(page.locator('.say-card .speak-btns')).toHaveCount(0);
      await page.waitForTimeout(400);
      expect((await speechLog(page)).slice(mark), 'Übersetzen-Sprechen liest nichts vor').toEqual([]);
      await noHorizontalScroll(page);
      if (!failedOnce) {
        failedOnce = true;
        // Erster Fehlversuch: Hörhilfe (Knopf + einmal vorgelesen), der Text bleibt verborgen.
        await holdMic(page, 'no sé');
        await expect(page.locator('.say-card .speak-btns')).toHaveCount(1);
        await expect(page.locator('.say-card .spoken')).toHaveCount(0);
        await expect.poll(async () => (await speechLog(page)).slice(mark).filter((e) => e.kind === 'tts').length).toBeGreaterThan(0);
        // Zweiter Fehlversuch: falsch, Lösung sichtbar, Übung kommt am Ende noch einmal.
        await holdMic(page, 'no sé');
        await expect(page.locator('.sheet-bad')).toHaveCount(1);
        await expect(page.locator('.say-card .spoken')).toHaveCount(1);
        await expect(page.locator('.sheet-note')).toContainText('noch einmal');
        count.sayFailed += 1;
        return true;
      }
      await holdMic(page, es);
      await expect(page.locator('.sheet-good'), `„${es}“ gesprochen`).toHaveCount(1);
      count.say += 1;
      return true;
    }
    if (await page.locator('.speak-card').count()) {
      seen.add('speak');
      await holdMic(page, (await page.locator('.speak-sentence').innerText()).trim());
      await expect(page.locator('.sheet-good')).toHaveCount(1);
      count.speak += 1;
      return true;
    }
    if (await page.locator('.build-line').count()) {
      seen.add('build');
      await tapTiles(page, await esOf());
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await expect(page.locator('.sheet-good')).toHaveCount(1);
      count.build += 1;
      return true;
    }
    mark = (await speechLog(page)).length;
    return false;
  };
  // Zwischen den Übungen (Feedback-Leiste, andere Übungstypen) wandert die Marke mit.
  const solveAndMark: Solver = async (page, seen) => {
    if (await page.locator('.sheet').count()) {
      await page.getByRole('button', { name: 'Weiter' }).click();
      mark = (await speechLog(page)).length;
      return true;
    }
    return solve(page, seen);
  };

  await page.locator('.node.is-current').click();
  const seen = await playLesson(page, 200, solveAndMark);
  await expect(page.locator('.result')).toBeVisible();
  for (const t of ['dictation', 'say', 'speak', 'build']) expect(seen, `Übungstyp ${t}`).toContain(t);
  expect(count.dictation, 'mehrere Diktate').toBeGreaterThanOrEqual(3);
  // Die einmal falsch gesprochene Übung kam am Ende wieder und wurde dann richtig gelöst.
  expect(count.sayFailed).toBe(1);
  expect(count.say, 'mehrere Übersetzen-Sprechen-Übungen').toBeGreaterThanOrEqual(3);
  expect(count.speak).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => (window as unknown as { __sttStarts: number }).__sttStarts)).toBe(count.say + count.speak + 2);
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(Object.keys(stored.lessons)).toContain('u3l1');
  expect(errors).toEqual([]);
});

/* ───── Explizites Feedback (WP-06): Fehlertyp, Markierung und Regel in einem Satz ───── */

test('Regelhinweis bei falscher Antwort: Wortstellung, ser/estar, fehlendes Wort, Wort zu viel', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeRecognition(page);
  const day = (offset: number) =>
    page.evaluate((o) => {
      const d = new Date(Date.now() + o * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, offset);
  await page.goto('/');
  // Wiederholung mit zwei fälligen Wörtern: Diktat „¡Hola, Ana!“, dann Übersetzen-Sprechen „Estoy bien.“
  const srs = { hola: { box: 1, due: await day(-2), lapses: 0, seen: 1 }, bien: { box: 1, due: await day(0), lapses: 0, seen: 1 } };
  await seedProgress(page, ['u1l1', 'u1l2'], { srs });
  await page.locator('.review-btn').click();
  const rule = page.locator('.sheet-rule');
  const check = () => page.getByRole('button', { name: 'Prüfen' }).click();
  const next = () => page.getByRole('button', { name: 'Weiter' }).click();

  // 1) Diktat in falscher Reihenfolge → Wortstellung
  await expect(page.locator('.dictation')).toBeVisible();
  await tapTiles(page, 'Ana Hola');
  await check();
  await expect(page.locator('.sheet-bad')).toHaveCount(1);
  await expect(rule).toHaveAttribute('data-kind', 'order');
  await expect(rule.locator('.sheet-rule-kind')).toHaveText('Wortstellung');
  await expect(rule).toContainText('Reihenfolge');
  expect(await page.locator('.sheet-solution .w-key').count(), 'betroffene Wörter der Lösung markiert').toBeGreaterThan(0);
  await noHorizontalScroll(page);
  await next();

  // 2) „soy bien“ statt „Estoy bien.“ (zwei Versuche) → ser oder estar, „Estoy“ markiert
  await expect(page.locator('.say-card')).toBeVisible();
  await holdMic(page, 'soy bien');
  await expect(page.locator('.say-card .speak-btns')).toHaveCount(1);
  await holdMic(page, 'soy bien');
  await expect(page.locator('.sheet-bad')).toHaveCount(1);
  await expect(rule).toHaveAttribute('data-kind', 'serestar');
  await expect(rule.locator('.sheet-rule-kind')).toHaveText('ser oder estar');
  await expect(rule).toContainText('„estar“ (hier „Estoy“) steht für Befinden');
  await expect(page.locator('.sheet-solution .w-key')).toHaveText(['Estoy']);
  await next();

  // 3) Diktat kommt wieder; ein Wort fehlt → Fehlendes Wort, „Ana“ markiert
  await expect(page.locator('.dictation')).toBeVisible();
  await tapTiles(page, 'Hola');
  await check();
  await expect(rule).toHaveAttribute('data-kind', 'missing');
  await expect(rule).toContainText('Es fehlt das Wort „Ana“');
  await expect(page.locator('.sheet-solution .w-key')).toHaveText(['Ana!']);
  await next();

  // 4) Sprechübung kommt wieder; richtig → Lob, kein Regelhinweis
  await expect(page.locator('.say-card')).toBeVisible();
  await holdMic(page, 'estoy bien');
  await expect(page.locator('.sheet-good')).toHaveCount(1);
  await expect(rule).toHaveCount(0);
  await expect(page.locator('.sheet-solution .w-key')).toHaveCount(0);
  await next();

  // 5) Diktat zum dritten Mal; ein Wort zu viel → Wort zu viel
  await expect(page.locator('.dictation')).toBeVisible();
  await tapTiles(page, 'Hola Ana');
  await page.locator('.tile-bank .tile:not(.is-used)').first().click();
  await check();
  await expect(rule).toHaveAttribute('data-kind', 'extra');
  await expect(rule).toContainText('gehört nicht in diesen Satz');
  await next();

  await expect(page.locator('.result')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ───── Lernerfolg messen (WP-10): Vor- und Nachtest mit bekannten Antworten ───── */

test('Lernerfolg: Vortest und Nachtest einer Einheit, Auswertung je Fertigkeit', async ({ page }) => {
  const errors = watchErrors(page);
  await recordSpeech(page);
  await fakeRecognition(page);
  const full = expandCourse(course as never, more as unknown as MoreContent);
  const items: AssessmentItem[] = buildAssessment(full, 'u2');
  expect(items).toHaveLength(12);
  const u1 = lessonIds('u1');
  await seedProgress(page, u1);
  const unit = (id: string) => page.locator(`.unit:has(#unit-${id})`);

  // Einheit 1 begonnen ohne Vortest: nur Nachtest. Einheit 2: Vortest offen. Einheit 3: noch nichts.
  await expect(unit('u1').locator('.test-pre')).toHaveCount(0);
  await expect(unit('u1').locator('.test-post')).toHaveCount(1);
  await expect(unit('u2').locator('.test-pre')).toHaveCount(1);
  await expect(unit('u2').locator('.test-post')).toHaveCount(0);
  await expect(unit('u3').locator('.test-btn')).toHaveCount(0);
  const srsBefore = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').srs, STORAGE_KEY);

  /** Einen Test durchspielen. `plan[i]`: 'right' | 'wrong' | 'dontknow' | 'skip' (nur Sprechen). */
  type Move = 'right' | 'wrong' | 'dontknow' | 'skip';
  const take = async (plan: Move[]) => {
    await page.getByRole('button', { name: 'Test starten' }).click();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const move = plan[i];
      const main = page.locator('main.ex');
      await expect(main).toHaveAttribute('data-skill', it.skill);
      // Während des Tests: keine Lösung, keine Bewertung.
      await expect(page.locator('.sheet, .w-good, .w-bad, .sheet-rule')).toHaveCount(0);
      // Erst prüfen, wenn das Hereingleiten der Aufgabe (260 ms) vorbei ist.
      await page.waitForFunction(() => !document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'slide-in' && a.playState === 'running'));
      await noHorizontalScroll(page);
      if (it.skill === 'listen') {
        // Nur hören: kein spanischer Text; der vorgelesene Satz ist der der Aufgabe.
        await expect(main.locator('.spoken')).toHaveCount(0);
        await expect.poll(async () => (await speechLog(page)).filter((e) => e.kind === 'tts').map((e) => e.text)).toContain(it.es);
        await expect(main.getByRole('radio')).toHaveCount(3);
        if (move === 'dontknow') await page.getByRole('button', { name: 'Weiß ich nicht' }).click();
        else {
          await main.getByRole('radio', { name: move === 'right' ? it.de : it.options.find((o) => o !== it.de)!, exact: true }).click();
          await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        }
      } else if (it.skill === 'recall') {
        await expect(main.locator('.ex-prompt-de')).toHaveText(it.de);
        if (move === 'dontknow') await page.getByRole('button', { name: 'Weiß ich nicht' }).click();
        else {
          const words = it.es.replace(/[¿?¡!.,;:]/g, ' ').split(/\s+/).filter(Boolean);
          await tapTiles(page, (move === 'right' ? words : [...words.slice(1), words[0], it.extra[0]]).join(' '));
          await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        }
      } else {
        await expect(main.locator('.ex-prompt-de')).toHaveText(it.de);
        await expect(main.locator('.spoken')).toHaveCount(0);
        if (move === 'dontknow') await page.getByRole('button', { name: 'Weiß ich nicht' }).click();
        else if (move === 'skip') await page.getByRole('button', { name: 'Gerade nicht sprechen' }).click();
        else {
          await holdMic(page, move === 'right' ? it.es : 'no sé');
          await expect(main.locator('.heard')).toContainText('Gehört');
          await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        }
      }
    }
  };
  const row = (u: string, skill: string) => page.locator(`.assess-unit[data-unit="${u}"] tr[data-skill="${skill}"]`);

  // Vortest: Hören 1 von 4, Abruf 0 von 4 (einmal falsch gelegt), Sprechen 0 von 3 (einmal übersprungen = nicht gemessen).
  await unit('u2').locator('.test-pre').click();
  await expect(page.locator('.assess-intro')).toContainText('Vortest');
  await take(['right', 'dontknow', 'wrong', 'dontknow', 'wrong', 'dontknow', 'dontknow', 'dontknow', 'wrong', 'skip', 'dontknow', 'dontknow']);
  await expect(page.locator('.learning h1')).toHaveText('Lernerfolg');
  await expect(page.locator('.assess-unit.is-focus')).toHaveAttribute('data-unit', 'u2');
  await expect(row('u2', 'listen').locator('.assess-pre')).toHaveText('25 %');
  await expect(row('u2', 'recall').locator('.assess-pre')).toHaveText('0 %');
  await expect(row('u2', 'speak').locator('.assess-pre')).toHaveText('0 %');
  await expect(row('u2', 'listen').locator('.assess-post')).toHaveText('–');
  await expect(row('u2', 'listen').locator('.assess-change')).toHaveText('–');
  await expect(page.locator('.assess-overall')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(unit('u2').locator('.test-pre')).toHaveCount(0);

  // Einheit 2 durchgearbeitet (Lektionen als abgeschlossen eintragen), Tests bleiben erhalten.
  await page.evaluate(
    ([k, ids]) => {
      const p = JSON.parse(localStorage.getItem(k) ?? '{}');
      for (const id of ids) p.lessons[id] = { accuracy: 0.9, completedAt: new Date().toISOString() };
      localStorage.setItem(k, JSON.stringify(p));
    },
    [STORAGE_KEY, lessonIds('u2')] as const,
  );
  await page.reload();
  await expect(unit('u2').locator('.test-post')).toContainText('Vergleich mit deinem Vortest');

  // Nachtest: alles richtig (dieselben Aufgaben in derselben Reihenfolge).
  await unit('u2').locator('.test-post').click();
  await expect(page.locator('.assess-intro')).toContainText('Nachtest');
  await take(Array(12).fill('right'));
  for (const [skill, pre, change] of [
    ['listen', '25 %', '+75'],
    ['recall', '0 %', '+100'],
    ['speak', '0 %', '+100'],
  ]) {
    await expect(row('u2', skill).locator('.assess-pre')).toHaveText(pre);
    await expect(row('u2', skill).locator('.assess-post')).toHaveText('100 %');
    await expect(row('u2', skill).locator('.assess-change')).toHaveText(`${change} Prozentpunkte`);
    await expect(row('u2', skill).locator('.assess-change')).toHaveClass(/is-up/);
  }
  await expect(page.locator('.assess-overall')).toContainText('Im Schnitt über 1 Einheit');
  await expect(page.locator('.assess-overall [data-skill="listen"] dd')).toHaveText('+75 Punkte');
  await expect(page.locator('.assess-history li')).toHaveCount(2);
  await expect(page.locator('.assess-history li').first()).toContainText('Nachtest · Im Café bestellen');
  await noHorizontalScroll(page);

  // Gespeichert: zwei Tests mit je 12 Antworten; die Wiederholungsplanung bleibt unberührt.
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(stored.assessments.map((r: { unit: string; kind: string; answers: unknown[] }) => `${r.unit}-${r.kind}-${r.answers.length}`)).toEqual(['u2-pre-12', 'u2-post-12']);
  expect(stored.srs).toEqual(srsBefore);
  // Nach dem Nachtest bleibt er wiederholbar; der Lernerfolg ist über die Kopfzeile erreichbar.
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(unit('u2').locator('.test-post')).toContainText('Nachtest wiederholen');
  await page.getByRole('button', { name: 'Lernerfolg' }).click();
  await expect(page.locator('.assess-unit')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/* ───── Vortest im Onboarding (WP-18) ───── */

test('Onboarding bietet den Vortest von Einheit 1 an; danach startet die erste Lektion', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeRecognition(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter ohne Mikrofon-Test' }).click();
  await expect(page.locator('.ob-pretest h1')).toHaveText('Erst ein kurzer Vortest?');
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Vortest machen' }).click();
  await expect(page.locator('.assess-intro')).toContainText('Vortest');
  await page.getByRole('button', { name: 'Test starten' }).click();
  // Als echter Anfänger: alles „Weiß ich nicht“
  const full = expandCourse(course as never, more as unknown as MoreContent);
  for (let i = 0; i < buildAssessment(full, 'u1').length; i++) {
    await page.waitForFunction(() => !document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'slide-in' && a.playState === 'running'));
    await page.getByRole('button', { name: 'Weiß ich nicht' }).click();
  }
  // Direkt weiter in die erste Lektion
  await expect(page.locator('.flashcard')).toBeVisible();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(stored.onboarded).toBe(true);
  expect(stored.assessments.map((r: { unit: string; kind: string }) => `${r.unit}:${r.kind}`)).toEqual(['u1:pre']);
  expect(stored.assessments[0].answers.every((a: { score: number | null }) => a.score === 0)).toBe(true);
  await playLesson(page);
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Einheit 1: Vortest erledigt, kein zweiter Vortest angeboten
  await expect(page.locator('.unit:has(#unit-u1) .test-pre')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vortest im Onboarding übersprungen: Lernpfad bietet ihn an, bis Einheit 1 begonnen ist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('.ob-actions .btn').click();
  await page.getByRole('button', { name: 'Überspringen – zur ersten Lektion' }).click();
  await expect(page.locator('.flashcard')).toBeVisible();
  // Lektion ohne Abschluss verlassen: Einheit 1 gilt noch nicht als begonnen
  await page.getByLabel('Lektion verlassen').click();
  await page.getByRole('button', { name: 'Beenden' }).click();
  await expect(page.locator('.unit:has(#unit-u1) .test-pre')).toHaveCount(1);
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), STORAGE_KEY);
  expect(stored.onboarded).toBe(true);
  expect(stored.assessments ?? []).toEqual([]);
});

/* ───── Hörgeschichten (WP-08) ───── */

/** Gerätestimme, die jeden Satz protokolliert und nach 40 ms als beendet meldet (headless gibt es keine Stimmen). */
async function quickSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    speechSynthesis.speak = (u) => {
      w.__spoken.push(u.text);
      setTimeout(() => u.onstart?.(new Event('start') as SpeechSynthesisEvent), 5);
      setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 40);
    };
    speechSynthesis.cancel = () => {};
  });
}

test('Hörgeschichte: nach der Einheit offen, ganz anhören, mitlesen, Fragen beantworten, bestes Ergebnis bleibt', async ({ page }) => {
  const errors = watchErrors(page);
  await quickSpeech(page);
  const story = STORIES[0];
  const u1 = lessonIds('u1');
  const unit = (id: string) => page.locator(`.unit:has(#unit-${id})`);

  // Vor der letzten Lektion gesperrt, danach offen; Einheit 2 bleibt gesperrt.
  await seedProgress(page, u1.slice(0, 3));
  await expect(unit('u1').locator('.story-btn')).toBeDisabled();
  await seedProgress(page, u1);
  await expect(unit('u1').locator('.story-btn')).toBeEnabled();
  await expect(unit('u1').locator('.story-btn')).toContainText(story.titleEs);
  await expect(unit('u2').locator('.story-btn')).toBeDisabled();
  await expect(page.locator('.story-btn')).toHaveCount(STORIES.length);

  const play = async (plan: boolean[]) => {
    await unit('u1').locator('.story-btn').click();
    await expect(page.locator('h1')).toHaveText(story.titleEs);
    await noHorizontalScroll(page);
    // Erst nur hören: kein spanischer Text sichtbar.
    await expect(page.locator('.story-lines .spoken')).toHaveCount(0);
    await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken = []));
    await page.getByRole('button', { name: 'Ganze Geschichte anhören' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken), { timeout: 15000 }).toEqual(
      story.lines.map((l) => l.es),
    );
    await expect(page.getByRole('button', { name: 'Ganze Geschichte anhören' })).toBeVisible();
    await expect(page.locator('.story-line.is-playing')).toHaveCount(0);
    // Mitlesen und übersetzen; neue Wörter stehen im Glossar und sind im Text markiert.
    await page.getByLabel('Text mitlesen').check();
    await page.getByLabel('Übersetzung').check();
    await expect(page.locator('.story-lines .spoken')).toHaveCount(story.lines.length);
    await expect(page.locator('.story-de').first()).toHaveText(story.lines[0].de);
    for (const [es, de] of Object.entries(story.glossary)) await expect(page.locator('.story-gloss')).toContainText(`${es}${de}`);
    await expect(page.locator('.story-lines .w-key')).toHaveCount(Object.keys(story.glossary).length);
    await noHorizontalScroll(page);

    await page.getByRole('button', { name: 'Weiter zu den Fragen' }).click();
    for (let i = 0; i < story.questions.length; i++) {
      const q = story.questions[i];
      await expect(page.locator('.ex-prompt-de')).toHaveText(q.q);
      await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
      const pick = plan[i] ? q.options[q.answer] : q.options.find((_, j) => j !== q.answer)!;
      await page.getByRole('radio', { name: pick, exact: true }).click();
      await expect(page.locator('.story-option.is-right')).toHaveText(q.options[q.answer]);
      await expect(page.locator('.story-verdict')).toHaveText(plan[i] ? /Richtig/ : new RegExp(`Richtig ist: ${q.options[q.answer]}`));
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    const right = plan.filter(Boolean).length;
    await expect(page.locator('.story-score')).toHaveText(`${right} von ${plan.length} Fragen richtig`);
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(unit('u1').locator('.story-btn')).toBeVisible();
  };
  const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').stories, STORAGE_KEY);

  await play([false, true, true]);
  await expect(unit('u1').locator('.story-btn')).toContainText('2 von 3 Fragen richtig');
  expect((await stored()).u1).toMatchObject({ correct: 2, total: 3 });
  await play([true, true, true]);
  expect((await stored()).u1).toMatchObject({ correct: 3, total: 3 });
  // Schlechterer Durchgang: das beste Ergebnis bleibt.
  await play([false, false, false]);
  expect((await stored()).u1).toMatchObject({ correct: 3, total: 3 });
  await expect(unit('u1').locator('.story-btn')).toContainText('3 von 3 Fragen richtig');

  // Verlassen mitten im Anhören (in der Pause nach dem ersten Satz): keine weitere Ausgabe danach.
  await unit('u1').locator('.story-btn').click();
  await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken = []));
  await page.getByRole('button', { name: 'Ganze Geschichte anhören' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(1);
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Geschichte verlassen' }).click();
  const n = (await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).length;
  await page.waitForTimeout(1500);
  expect((await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).length).toBe(n);
  expect(errors).toEqual([]);
});

/* ───── Rollenspiele (WP-09) ───── */

test('Rollenspiel: Gespräch per Mikrofon mit Hörhilfe und Musterantwort, ohne Mikrofon per Auswahl, bestes Ergebnis bleibt', async ({ page }) => {
  const errors = watchErrors(page);
  await quickSpeech(page);
  await fakeRecognition(page);
  const rp = ROLEPLAYS[1];
  const unit = (id: string) => page.locator(`.unit:has(#unit-${id})`);
  const spokenLog = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').roleplays, STORAGE_KEY);

  await seedProgress(page, DONE_THROUGH_UNIT_2.slice(0, -1));
  await expect(unit('u2').locator('.roleplay-btn')).toBeDisabled();
  await seedProgress(page, DONE_THROUGH_UNIT_2);
  await expect(unit('u1').locator('.roleplay-btn')).toBeEnabled();
  await expect(unit('u2').locator('.roleplay-btn')).toBeEnabled();
  await expect(unit('u3').locator('.roleplay-btn')).toBeDisabled();
  await expect(page.locator('.roleplay-btn')).toHaveCount(ROLEPLAYS.length);

  // 1. Mit Mikrofon: richtig, Hörhilfe nach Fehlversuch, Musterantwort nach zwei Fehlversuchen.
  await unit('u2').locator('.roleplay-btn').click();
  await expect(page.locator('h1')).toHaveText(rp.title);
  await expect(page.locator('main')).toContainText(rp.goal);
  for (const [es, de] of Object.entries(rp.glossary)) await expect(page.locator('.story-gloss')).toContainText(`${es}${de}`);
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  const partner = page.locator('.rp-partner');
  const me = page.locator('.rp-me');
  await expect(partner).toHaveCount(1);
  await expect(partner.first()).toContainText(rp.turns[0].partner!.es);
  await expect.poll(spokenLog).toContain(rp.turns[0].partner!.es);
  await expect(page.locator('.rp-task')).toContainText(rp.turns[0].task);

  // Zug 1: auf Anhieb richtig (klein, ohne Akzent) → passende Formulierung erscheint, weiter von selbst.
  await holdMic(page, 'un cafe con leche por favor');
  await expect(me.first()).toContainText('Un café con leche, por favor.');
  await expect(me.first()).not.toHaveClass(/is-helped/);
  await expect(partner).toHaveCount(2);
  await expect(partner.nth(1)).toContainText(rp.turns[1].partner!.es);

  // Zug 2: erst falsch (Tee statt ohne Zucker) → Hörhilfe, dann richtig → „mit Hilfe“, Weiter.
  await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken = []));
  await holdMic(page, 'con azucar');
  await expect(page.locator('.rp-task .note')).toContainText('Noch nicht ganz');
  await expect.poll(spokenLog).toContain(rp.turns[1].answers[0]);
  await expect(me).toHaveCount(1);
  await holdMic(page, 'sin azucar gracias');
  await expect(me.nth(1)).toContainText('Sin azúcar, gracias.');
  await expect(me.nth(1)).toHaveClass(/is-helped/);
  await expect(me.nth(1)).toContainText('mit Hilfe');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();

  // Zug 3: zweimal falsch → Musterantwort im Verlauf.
  await expect(partner).toHaveCount(3);
  await holdMic(page, 'un pastel por favor');
  await expect(page.locator('.rp-task .note')).toContainText('Noch nicht ganz');
  await holdMic(page, 'un pastel por favor');
  await expect(page.locator('.rp-task .note')).toContainText('So kannst du es sagen');
  await expect(me.nth(2)).toContainText(rp.turns[2].answers[0]);
  await expect(me.nth(2)).toHaveClass(/is-helped/);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();

  // Zug 4: richtig → Schlusssatz und Ergebnis.
  await holdMic(page, 'la cuenta por favor');
  await expect(partner.last()).toContainText(rp.end.es);
  await expect(page.locator('.story-score')).toHaveText(`2 von ${rp.turns.length} Antworten ohne Hilfe`);
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(unit('u2').locator('.roleplay-btn')).toContainText(`2 von ${rp.turns.length} Antworten ohne Hilfe`);
  expect((await stored()).u2).toMatchObject({ spoken: 2, total: rp.turns.length });

  // 2. Ohne Mikrofon: Auswahl, ein Fehler → richtige Antwort markiert, Weiter; Rest richtig.
  await unit('u2').locator('.roleplay-btn').click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('button', { name: 'Ohne Mikrofon antworten' }).click();
  for (let i = 0; i < rp.turns.length; i++) {
    const t = rp.turns[i];
    await expect(page.locator('.rp-task .ex-prompt-de')).toHaveText(t.task);
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.locator('.mic-btn')).toHaveCount(0);
    if (i === 0) {
      const wrong = (await page.getByRole('radio').allTextContents()).find((o) => o !== t.answers[0])!;
      await page.getByRole('radio', { name: wrong, exact: true }).click();
      await expect(page.locator('.story-option.is-right')).toHaveText(t.answers[0]);
      await expect(page.locator('.story-option.is-wrong')).toHaveText(wrong);
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    } else {
      await page.getByRole('radio', { name: t.answers[0], exact: true }).click();
    }
  }
  await expect(page.locator('.story-score')).toHaveText(`3 von ${rp.turns.length} Antworten ohne Hilfe`);
  await page.getByRole('button', { name: 'Fertig' }).click();
  expect((await stored()).u2).toMatchObject({ spoken: 3, total: rp.turns.length });

  // 3. Schlechterer Durchgang (alles falsch gewählt) überschreibt nicht; Verlassen mitten im Gespräch speichert nichts.
  await unit('u2').locator('.roleplay-btn').click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('button', { name: 'Ohne Mikrofon antworten' }).click();
  for (const t of rp.turns) {
    const wrong = (await page.getByRole('radio').allTextContents()).find((o) => o !== t.answers[0])!;
    await page.getByRole('radio', { name: wrong, exact: true }).click();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await expect(page.locator('.story-score')).toHaveText(`0 von ${rp.turns.length} Antworten ohne Hilfe`);
  await page.getByRole('button', { name: 'Fertig' }).click();
  expect((await stored()).u2).toMatchObject({ spoken: 3, total: rp.turns.length });
  await unit('u2').locator('.roleplay-btn').click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await holdMic(page, 'un cafe con leche');
  await expect(page.locator('.rp-me')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rollenspiel verlassen' }).click();
  await expect(unit('u2').locator('.roleplay-btn')).toContainText(`3 von ${rp.turns.length}`);
  expect((await stored()).u2).toMatchObject({ spoken: 3, total: rp.turns.length });
  expect(errors).toEqual([]);
});

/* ───── Kann-Beschreibungen und Lektion „Kleine Wörter“ (WP-11) ───── */

test('Kann-Beschreibungen je Einheit im Lernpfad; nach der Einheit „Das kannst du jetzt“', async ({ page }) => {
  const errors = watchErrors(page);
  await seedProgress(page, lessonIds('u1'));
  const unit = (id: string) => page.locator(`.unit:has(#unit-${id})`);
  await expect(page.locator('details.cando')).toHaveCount(CAN_DO.length);
  const u1 = unit('u1').locator('details.cando');
  await expect(u1.locator('summary')).toContainText('Das kannst du jetzt');
  await expect(u1).toHaveClass(/is-done/);
  await u1.locator('summary').click();
  for (const c of CAN_DO[0].items) await expect(u1).toContainText(c.text);
  const u2 = unit('u2').locator('details.cando');
  await expect(u2.locator('summary')).toContainText('Das kannst du danach');
  await expect(u2).not.toHaveClass(/is-done/);
  await expect(u2.locator('summary')).toContainText('GER A1');
  // Die Lektion „Kleine Wörter“ steht als letzte in jeder Einheit.
  await expect(unit('u2').locator('.trail li').last()).toContainText('Kleine Wörter');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
