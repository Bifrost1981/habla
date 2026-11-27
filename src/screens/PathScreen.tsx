// Startseite: Tagesziel, Serie, Wiederholung und der Lernpfad mit allen Lektionen.
import { useEffect, useRef } from 'react';
import { course, useApp } from '../context.tsx';
import { GoalRing } from '../components/GoalRing.tsx';
import { IconChart, IconCheck, IconFlame, IconGear, IconLock, IconRepeat, IconStar } from '../components/icons.tsx';
import { availability, ITEMS_PER_SKILL, SKILLS } from '../lib/assessment.ts';
import { isUnlocked, nextLessonId } from '../lib/course.ts';
import { storyFor, storyUnlocked } from '../lib/stories.ts';
import { roleplayFor, roleplayUnlocked } from '../lib/roleplays.ts';
import { CAN_DO_LEVEL, canDoFor } from '../lib/cando.ts';
import { currentStreak, dayKey, dueVocab } from '../lib/srs.ts';

export function PathScreen(props: {
  onStart: (lessonId: string) => void;
  onReview: () => void;
  onSettings: () => void;
  onTest: (unitId: string, kind: 'pre' | 'post') => void;
  onLearning: () => void;
  onStory: (unitId: string) => void;
  onRoleplay: (unitId: string) => void;
}) {
  const { progress } = useApp();
  const today = dayKey();
  const seconds = progress.activity[today] ?? 0;
  const minutes = Math.floor(seconds / 60);
  const goal = progress.settings.dailyGoalMin;
  const streak = currentStreak(progress.streak, today);
  const due = dueVocab(progress.srs, today);
  const nextId = nextLessonId(course, progress);
  const learned = Object.keys(progress.srs).length;
  let n = -1;
  const currentRef = useRef<HTMLButtonElement>(null);
  const totalLessons = course.units.reduce((a, u) => a + u.lessons.length, 0);
  const doneLessons = Object.keys(progress.lessons).length;

  // Beim Öffnen zur nächsten Lektion scrollen (bei 32 Lektionen sonst weit unten).
  useEffect(() => {
    if (doneLessons > 1) currentRef.current?.scrollIntoView({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen path">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ¡h!
          </span>
          <span className="brand-name">Habla</span>
        </div>
        <div className="topbar-stats">
          <span className={`streak${streak > 0 ? ' is-on' : ''}`} title="Tage in Folge gelernt">
            <IconFlame width={20} height={20} />
            <span>
              <strong>{streak}</strong>
              <span className="sr-only"> Tage in Folge</span>
            </span>
          </span>
          <GoalRing value={seconds / (goal * 60)} goalMin={goal} minutes={minutes} size={46} />
          <button type="button" className="icon-btn" onClick={props.onLearning} aria-label="Lernerfolg">
            <IconChart />
          </button>
          <button type="button" className="icon-btn" onClick={props.onSettings} aria-label="Einstellungen">
            <IconGear />
          </button>
        </div>
      </header>

      <section className="today">
        <div>
          <p className="today-kicker">Heute</p>
          <p className="today-line">
            {minutes >= goal
              ? '¡Objetivo cumplido! Tagesziel erreicht.'
              : `Noch ${Math.max(1, goal - minutes)} Min bis zu deinem Tagesziel.`}
          </p>
          <p className="today-sub">
            {learned} Wörter im Wortschatz · {doneLessons} von {totalLessons} Lektionen
          </p>
        </div>
        <button
          type="button"
          className={`review-btn${due.length ? '' : ' is-empty'}`}
          disabled={!due.length}
          onClick={props.onReview}
        >
          <IconRepeat width={22} height={22} />
          <span>
            <strong>Wiederholung</strong>
            <span>{due.length ? `${due.length} ${due.length === 1 ? 'Wort fällig' : 'Wörter fällig'}` : 'Nichts fällig'}</span>
          </span>
        </button>
      </section>

      {course.units.map((unit) => {
        const test = availability(course, progress, unit.id);
        const items = ITEMS_PER_SKILL * SKILLS.length;
        const story = storyFor(unit.id);
        const storyOpen = storyUnlocked(course, progress, unit.id);
        const storyRec = progress.stories[unit.id];
        const rp = roleplayFor(unit.id);
        const rpOpen = roleplayUnlocked(course, progress, unit.id);
        const rpRec = progress.roleplays[unit.id];
        const canDo = canDoFor(unit.id);
        return (
          <section key={unit.id} className="unit" aria-labelledby={`unit-${unit.id}`}>
            <header className="unit-head">
              <span className="unit-emoji" aria-hidden="true">
                {unit.emoji}
              </span>
              <div>
                <h2 id={`unit-${unit.id}`}>{unit.title}</h2>
                <p>{unit.subtitle}</p>
              </div>
            </header>
            {canDo.length > 0 && (
              <details className={`cando${storyOpen ? ' is-done' : ''}`}>
                <summary>
                  {storyOpen ? 'Das kannst du jetzt' : 'Das kannst du danach'} <span className="cando-level">GER {CAN_DO_LEVEL}</span>
                </summary>
                <ul>
                  {canDo.map((c) => (
                    <li key={c.text}>
                      <span className="cando-skill">{c.skill}</span> {c.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {test.pre === 'open' && (
              <button type="button" className="test-btn test-pre" onClick={() => props.onTest(unit.id, 'pre')}>
                <strong>Vortest: Was kannst du schon?</strong>
                <span>
                  {items} Aufgaben, ca. 4 Min · zeigt nach der Einheit, was du dazugelernt hast
                </span>
              </button>
            )}
            <ol className="trail">
              {unit.lessons.map((lesson) => {
                n += 1;
                const rec = progress.lessons[lesson.id];
                const open = isUnlocked(course, progress, lesson.id);
                const current = lesson.id === nextId;
                const state = rec ? 'is-done' : current ? 'is-current' : open ? 'is-open' : 'is-locked';
                const stars = rec ? (rec.accuracy >= 0.9 ? 3 : rec.accuracy >= 0.7 ? 2 : 1) : 0;
                return (
                  <li key={lesson.id} className={`trail-step ${n % 2 ? 'is-right' : 'is-left'}`}>
                    <button
                      ref={current ? currentRef : undefined}
                      type="button"
                      className={`node ${state}`}
                      disabled={!open}
                      onClick={() => props.onStart(lesson.id)}
                      aria-label={`${lesson.title}${rec ? ', abgeschlossen' : current ? ', als Nächstes' : open ? '' : ', gesperrt'}`}
                    >
                      {rec ? <IconCheck width={30} height={30} /> : open ? <span className="node-num">{n + 1}</span> : <IconLock />}
                    </button>
                    <span className="node-label">
                      <strong>{lesson.title}</strong>
                      <span>
                        {rec ? (
                          <span className="stars" aria-label={`${stars} von 3 Sternen`}>
                            {[0, 1, 2].map((i) => (
                              <IconStar key={i} width={14} height={14} className={i < stars ? 'star-on' : 'star-off'} />
                            ))}
                          </span>
                        ) : current ? (
                          `Los geht’s · ca. ${Math.max(3, Math.round((lesson.exercises.length * 25) / 60))} Min`
                        ) : (
                          `${lesson.exercises.length} Übungen`
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {story && (
              <button
                type="button"
                className={`story-btn${storyRec ? ' is-done' : ''}`}
                disabled={!storyOpen}
                onClick={() => props.onStory(unit.id)}
              >
                <strong>
                  Hörgeschichte: <span lang="es">{story.titleEs}</span>
                </strong>
                <span>
                  {!storyOpen
                    ? 'Nach der letzten Lektion dieser Einheit'
                    : storyRec
                      ? `${storyRec.correct} von ${storyRec.total} Fragen richtig · nochmal hören`
                      : `${story.lines.length} Sätze zum Hören · ${story.questions.length} Fragen zum Verstehen`}
                </span>
              </button>
            )}
            {rp && (
              <button
                type="button"
                className={`roleplay-btn${rpRec ? ' is-done' : ''}`}
                disabled={!rpOpen}
                onClick={() => props.onRoleplay(unit.id)}
              >
                <strong>Rollenspiel: {rp.title}</strong>
                <span>
                  {!rpOpen
                    ? 'Nach der letzten Lektion dieser Einheit'
                    : rpRec
                      ? `${rpRec.spoken} von ${rpRec.total} Antworten ohne Hilfe · nochmal spielen`
                      : `${rp.turns.length} Antworten sprechen · ${rp.goal}`}
                </span>
              </button>
            )}
            {test.post === 'open' && (
              <button
                type="button"
                className={`test-btn test-post${test.posts ? ' is-done' : ''}`}
                onClick={() => props.onTest(unit.id, 'post')}
              >
                <strong>{test.posts ? 'Nachtest wiederholen' : 'Nachtest: Was kannst du jetzt?'}</strong>
                <span>
                  {test.pre === 'done' ? 'Vergleich mit deinem Vortest' : 'Kein Vortest gemacht: misst deinen Stand'} · {items} Aufgaben, ca. 4 Min
                </span>
              </button>
            )}
          </section>
        );
      })}
      <p className="path-foot">Ende von Niveau A1. Mit diesen Einheiten kommst du im Alltag schon gut zurecht.</p>
    </div>
  );
}
