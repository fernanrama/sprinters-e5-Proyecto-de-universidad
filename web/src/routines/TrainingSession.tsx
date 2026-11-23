import { useEffect, useRef, useState } from "react";
import type { TrainingSession as Session } from "../../../shared/trainingSessions";
import { loadActiveSession } from "./api";
import "./routine-workspace.css";

export const trainingSessionRoute = "#/rutinas/sesion";

type State = { status: "loading" | "error" } | { status: "ready"; session: Session | null };

export function TrainingSession() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadActiveSession(controller.signal).then(session => {
      if (!controller.signal.aborted) setState({ status: "ready", session });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt]);

  return <main id="page-content" className="page-content routines-workspace" tabIndex={-1}>
    <header className="routine-page-heading routine-list-heading">
      <h1 ref={heading} tabIndex={-1}>Sesión de entrenamiento</h1>
      <a className="routine-action-link routine-secondary" href="#/rutinas" tabIndex={0}>Volver a Mis rutinas</a>
    </header>
    {state.status === "loading" && <p role="status">Cargando sesión…</p>}
    {state.status === "error" && <div className="routine-state">
      <p role="alert">No hemos podido recuperar la sesión.</p>
      <button type="button" className="routine-primary" onClick={() => {
        heading.current?.focus();
        setState({ status: "loading" });
        setAttempt(value => value + 1);
      }}>Volver a intentar</button>
    </div>}
    {state.status === "ready" && (state.session ? <section aria-labelledby="training-routine">
      <h2 id="training-routine">{state.session.routine.name}</h2>
      <ol className="training-exercises">
        {state.session.routine.items.map(item => <li className="routine-saved-row" key={item.id}>
          <div>
            <h3>{item.exerciseName}</h3>
            <p>{item.sets} series · {item.repetitions} repeticiones</p>
            {item.parameters?.restSeconds !== undefined && <p>Descanso: {item.parameters.restSeconds} s</p>}
            {item.parameters?.rir !== undefined && <p>RIR: {item.parameters.rir}</p>}
          </div>
        </li>)}
      </ol>
    </section> : <p className="routine-state">No hay ninguna sesión en curso.</p>)}
  </main>;
}
