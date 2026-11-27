import { useCallback, useEffect, useState } from 'react';
import { AppProvider, course, type MicState } from './context.tsx';
import { allLessons, buildReview } from './lib/course.ts';
import { addRecord, buildAssessment } from './lib/assessment.ts';
import { appendLog, applyResults, bumpStreak, currentStreak, dayKey, dueVocab } from './lib/srs.ts';
import { clearProgress, DEFAULT_PROGRESS, loadProgress, saveProgress } from './lib/storage.ts';
import { sttSupported } from './lib/speech.ts';
import type { AssessmentRecord, Exercise, Progress, RoleplayRecord, StoryRecord } from './types.ts';
import { Onboarding } from './screens/Onboarding.tsx';
import { PathScreen } from './screens/PathScreen.tsx';
import { LessonScreen, type LessonSummary } from './screens/LessonScreen.tsx';
import { ResultScreen } from './screens/ResultScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { AssessmentScreen } from './screens/AssessmentScreen.tsx';
import { LearningScreen } from './screens/LearningScreen.tsx';
import { StoryScreen } from './screens/StoryScreen.tsx';
import { RoleplayScreen } from './screens/RoleplayScreen.tsx';
import { roleplayFor } from './lib/roleplays.ts';
import { storyFor } from './lib/stories.ts';

type Screen =
  | { name: 'onboarding' }
  | { name: 'path' }
  | { name: 'settings' }
  | { name: 'learning'; focus?: string }
  | { name: 'story'; unitId: string; run: number }
  | { name: 'roleplay'; unitId: string; run: number }
  | { name: 'assessment'; unitId: string; kind: 'pre' | 'post'; run: number; /** danach diese Lektion starten (Vortest aus dem Onboarding) */ then?: string }
  | { name: 'lesson'; lessonId: string | null; title: string; exercises: Exercise[]; run: number }
  | { name: 'result'; title: string; summary: LessonSummary; streak: number };

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [mic, setMic] = useState<MicState>(sttSupported ? 'unknown' : 'unavailable');
  const [screen, setScreen] = useState<Screen>(() => (progress.onboarded ? { name: 'path' } : { name: 'onboarding' }));

  const update = useCallback((fn: (p: Progress) => Progress) => setProgress((p) => fn(p)), []);

  useEffect(() => saveProgress(progress), [progress]);
  // Neue Ansicht oben beginnen; der Lernpfad scrollt selbst zur nächsten Lektion.
  useEffect(() => {
    if (screen.name !== 'path') window.scrollTo({ top: 0 });
  }, [screen.name]);

  const startLesson = (lessonId: string) => {
    const found = allLessons(course).find((l) => l.lesson.id === lessonId);
    if (!found) return;
    setScreen({ name: 'lesson', lessonId, title: found.lesson.title, exercises: found.lesson.exercises, run: Date.now() });
  };

  const startReview = () => {
    const due = dueVocab(progress.srs, dayKey());
    if (!due.length) return;
    setScreen({ name: 'lesson', lessonId: null, title: 'Wiederholung', exercises: buildReview(course, due), run: Date.now() });
  };

  const addActivity = (p: Progress, seconds: number): Progress['activity'] => {
    const today = dayKey();
    return { ...p.activity, [today]: (p.activity[today] ?? 0) + seconds };
  };

  const startTest = (unitId: string, kind: 'pre' | 'post') => setScreen({ name: 'assessment', unitId, kind, run: Date.now() });

  /** Testergebnis speichern (ohne Einfluss auf die Wiederholungsplanung) und den Vergleich zeigen. */
  const finishTest = (rec: AssessmentRecord, seconds: number, then?: string) => {
    update((p) => ({ ...p, assessments: addRecord(p.assessments, rec), activity: addActivity(p, seconds) }));
    if (then) startLesson(then);
    else setScreen({ name: 'learning', focus: rec.unit });
  };

  const startStory = (unitId: string) => setScreen({ name: 'story', unitId, run: Date.now() });

  /** Ergebnis einer Hörgeschichte: das bessere bleibt (ohne Einfluss auf die Wiederholungsplanung). */
  const finishStory = (unitId: string, rec: StoryRecord, seconds: number) => {
    update((p) => {
      const prev = p.stories[unitId];
      const best = prev && prev.correct / prev.total > rec.correct / rec.total ? { ...prev, at: rec.at } : rec;
      return { ...p, stories: { ...p.stories, [unitId]: best }, activity: addActivity(p, seconds) };
    });
    setScreen({ name: 'path' });
  };

  const startRoleplay = (unitId: string) => setScreen({ name: 'roleplay', unitId, run: Date.now() });

  /** Ergebnis eines Rollenspiels: das bessere bleibt (ohne Einfluss auf die Wiederholungsplanung). */
  const finishRoleplay = (unitId: string, rec: RoleplayRecord, seconds: number) => {
    update((p) => {
      const prev = p.roleplays[unitId];
      const best = prev && prev.spoken / prev.total > rec.spoken / rec.total ? { ...prev, at: rec.at } : rec;
      return { ...p, roleplays: { ...p.roleplays, [unitId]: best }, activity: addActivity(p, seconds) };
    });
    setScreen({ name: 'path' });
  };

  /** Ende des Onboardings: auf Wunsch erst der Vortest von Einheit 1, dann die erste Lektion. */
  const afterOnboarding = (next: 'test' | 'lesson') => {
    const first = course.units[0];
    if (next === 'test') setScreen({ name: 'assessment', unitId: first.id, kind: 'pre', run: Date.now(), then: first.lessons[0].id });
    else startLesson(first.lessons[0].id);
  };

  const finish = (lessonId: string | null, title: string, summary: LessonSummary) => {
    const today = dayKey();
    const streak = bumpStreak(progress.streak, today);
    update((p) => {
      const prev = lessonId ? p.lessons[lessonId] : undefined;
      const reviewed = applyResults(p.srs, summary.right, summary.wrong, today);
      return {
        ...p,
        srs: reviewed.srs,
        reviewLog: appendLog(p.reviewLog, reviewed.log),
        lessons: lessonId
          ? {
              ...p.lessons,
              [lessonId]: { accuracy: Math.max(prev?.accuracy ?? 0, summary.accuracy), completedAt: new Date().toISOString() },
            }
          : p.lessons,
        streak,
        activity: addActivity(p, summary.seconds),
      };
    });
    setScreen({ name: 'result', title, summary, streak: currentStreak(streak, today) });
  };

  return (
    <AppProvider progress={progress} update={update} mic={mic} setMic={setMic}>
      <div className="app">
        {screen.name === 'onboarding' && <Onboarding onDone={afterOnboarding} />}
        {screen.name === 'path' && (
          <PathScreen
            onStart={startLesson}
            onReview={startReview}
            onSettings={() => setScreen({ name: 'settings' })}
            onTest={startTest}
            onLearning={() => setScreen({ name: 'learning' })}
            onStory={startStory}
            onRoleplay={startRoleplay}
          />
        )}
        {screen.name === 'roleplay' && roleplayFor(screen.unitId) && (
          <RoleplayScreen
            key={screen.run}
            rp={roleplayFor(screen.unitId)!}
            unitTitle={course.units.find((u) => u.id === screen.unitId)?.title ?? ''}
            onExit={(seconds) => {
              update((p) => ({ ...p, activity: addActivity(p, seconds) }));
              setScreen({ name: 'path' });
            }}
            onFinish={(rec, seconds) => finishRoleplay(screen.unitId, rec, seconds)}
          />
        )}
        {screen.name === 'story' && storyFor(screen.unitId) && (
          <StoryScreen
            key={screen.run}
            story={storyFor(screen.unitId)!}
            unitTitle={course.units.find((u) => u.id === screen.unitId)?.title ?? ''}
            onExit={(seconds) => {
              update((p) => ({ ...p, activity: addActivity(p, seconds) }));
              setScreen({ name: 'path' });
            }}
            onFinish={(rec, seconds) => finishStory(screen.unitId, rec, seconds)}
          />
        )}
        {screen.name === 'learning' && <LearningScreen focus={screen.focus} onBack={() => setScreen({ name: 'path' })} />}
        {screen.name === 'assessment' && (
          <AssessmentScreen
            key={screen.run}
            unitId={screen.unitId}
            unitTitle={course.units.find((u) => u.id === screen.unitId)?.title ?? ''}
            kind={screen.kind}
            items={buildAssessment(course, screen.unitId)}
            onExit={(seconds) => {
              update((p) => ({ ...p, activity: addActivity(p, seconds) }));
              setScreen({ name: 'path' });
            }}
            onFinish={(rec, seconds) => finishTest(rec, seconds, screen.then)}
          />
        )}
        {screen.name === 'settings' && (
          <SettingsScreen
            onBack={() => setScreen({ name: 'path' })}
            onReset={() => {
              clearProgress();
              setProgress(structuredClone(DEFAULT_PROGRESS));
              setScreen({ name: 'onboarding' });
            }}
          />
        )}
        {screen.name === 'lesson' && (
          <LessonScreen
            key={screen.run}
            title={screen.title}
            exercises={screen.exercises}
            onExit={(seconds) => {
              update((p) => ({ ...p, activity: addActivity(p, seconds) }));
              setScreen({ name: 'path' });
            }}
            onFinish={(s) => finish(screen.lessonId, screen.title, s)}
          />
        )}
        {screen.name === 'result' && (
          <ResultScreen title={screen.title} summary={screen.summary} streak={screen.streak} onContinue={() => setScreen({ name: 'path' })} />
        )}
      </div>
    </AppProvider>
  );
}
