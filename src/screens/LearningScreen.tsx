// Lernerfolg (WP-10): Vor- und Nachtest je Einheit, Veränderung je Fertigkeit und Verlauf aller Tests.
import { course, useApp } from '../context.tsx';
import { IconBack } from '../components/icons.tsx';
import { overallChange, SKILL_LABEL, SKILLS, skillScores, unitResult, type UnitResult } from '../lib/assessment.ts';
import type { AssessmentRecord, Skill } from '../types.ts';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);
const signed = (x: number | null) => (x === null ? '–' : x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : '±0');
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function Bar(props: { value: number | null; kind: 'pre' | 'post' }) {
  return (
    <span className={`assess-bar assess-bar-${props.kind}`} aria-hidden="true">
      <span style={{ width: `${props.value ? Math.max(props.value * 100, 2) : 0}%` }} />
    </span>
  );
}

function UnitCard(props: { r: UnitResult; focus: boolean }) {
  const { r } = props;
  const last = r.posts[r.posts.length - 1] ?? null;
  const pre = r.pre ? skillScores(r.pre.answers) : null;
  const post = last ? skillScores(last.answers) : null;
  return (
    <section className={`assess-unit${props.focus ? ' is-focus' : ''}`} aria-labelledby={`lu-${r.unit.id}`} data-unit={r.unit.id}>
      <h2 id={`lu-${r.unit.id}`}>
        <span aria-hidden="true">{r.unit.emoji}</span> {r.unit.title}
      </h2>
      <table className="assess-table">
        <thead>
          <tr>
            <th scope="col">Fertigkeit</th>
            <th scope="col">Vorher</th>
            <th scope="col">Nachher</th>
            <th scope="col">Veränderung</th>
          </tr>
        </thead>
        <tbody>
          {SKILLS.map((s: Skill) => (
            <tr key={s} data-skill={s}>
              <th scope="row">{SKILL_LABEL[s]}</th>
              <td className="assess-pre">
                {pct(pre?.[s] ?? null)}
                <Bar value={pre?.[s] ?? null} kind="pre" />
              </td>
              <td className="assess-post">
                {pct(post?.[s] ?? null)}
                <Bar value={post?.[s] ?? null} kind="post" />
              </td>
              <td className={`assess-change${(r.change[s] ?? 0) > 0 ? ' is-up' : (r.change[s] ?? 0) < 0 ? ' is-down' : ''}`}>
                {signed(r.change[s])}
                {r.change[s] !== null && <span className="sr-only"> Prozentpunkte</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="assess-foot">
        {!r.pre && 'Kein Vortest: Die Einheit wurde vor dem Test begonnen. '}
        {r.pre && !last && 'Den Nachtest gibt es, wenn alle Lektionen der Einheit abgeschlossen sind. '}
        {last && r.posts.length > 1 && `Nachher = letzter von ${r.posts.length} Nachtests. `}
      </p>
    </section>
  );
}

export function LearningScreen(props: { onBack: () => void; focus?: string }) {
  const { progress } = useApp();
  const records = progress.assessments;
  const results = course.units
    .map((u) => unitResult(course, records, u.id))
    .filter((r): r is UnitResult => !!r && (r.pre !== null || r.posts.length > 0));
  const overall = overallChange(results);
  const history = [...records].sort((a, b) => b.at.localeCompare(a.at));
  const title = (r: AssessmentRecord) => course.units.find((u) => u.id === r.unit)?.title ?? r.unit;

  return (
    <div className="screen learning">
      <header className="subbar">
        <button type="button" className="icon-btn" onClick={props.onBack} aria-label="Zurück" autoFocus>
          <IconBack />
        </button>
        <h1>Lernerfolg</h1>
      </header>

      {results.length === 0 ? (
        <p className="assess-empty">
          Noch keine Tests. Den Vortest findest du am Anfang jeder Einheit, den Nachtest nach ihrer letzten Lektion. So siehst du, was du
          in Hören, Abruf und Sprechen dazulernst.
        </p>
      ) : (
        <>
          {overall.units > 0 && (
            <section className="assess-overall" aria-label="Veränderung über alle Einheiten">
              <p className="today-kicker">
                Im Schnitt über {overall.units} {overall.units === 1 ? 'Einheit' : 'Einheiten'}
              </p>
              <dl className="stats">
                {SKILLS.map((s) => (
                  <div className="stat" key={s} data-skill={s}>
                    <dt>{SKILL_LABEL[s]}</dt>
                    <dd>
                      {signed(overall.change[s])}
                      {overall.change[s] !== null && <small> Punkte</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {results.map((r) => (
            <UnitCard key={r.unit.id} r={r} focus={r.unit.id === props.focus} />
          ))}
          <section className="group assess-history" aria-labelledby="verlauf">
            <h2 id="verlauf" className="today-kicker">
              Verlauf
            </h2>
            <ol>
              {history.map((r) => {
                const s = skillScores(r.answers);
                return (
                  <li key={`${r.unit}-${r.at}`} className="row">
                    <span className="row-text">
                      <strong>
                        {r.kind === 'pre' ? 'Vortest' : 'Nachtest'} · {title(r)}
                      </strong>
                      <span>{dateOf(r.at)}</span>
                    </span>
                    <span className="assess-scores">
                      {SKILLS.map((k) => (
                        <span key={k}>
                          {SKILL_LABEL[k]} {pct(s[k])}
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
      <p className="path-foot">Die Tests bleiben nur auf diesem Gerät gespeichert. Gemessen wird ohne Hilfen; „Weiß ich nicht“ zählt als falsch.</p>
    </div>
  );
}
