import { useCallback, useEffect, useRef, useState } from "react";
import "./rest-timer.css";

export interface RestTimerProps {
  exerciseName: string;
  configuredSeconds?: number;
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Silently handle if audio context is unavailable or blocked
  }
}

export function RestTimer({ exerciseName, configuredSeconds }: RestTimerProps) {
  const hasConfigured = configuredSeconds !== undefined && configuredSeconds > 0;
  const initialValue = hasConfigured ? configuredSeconds : 60;

  const [initialSeconds, setInitialSeconds] = useState(initialValue);
  const [remainingSeconds, setRemainingSeconds] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "finished">("idle");

  const endTimeRef = useRef<number | null>(null);
  const timerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const updated = (configuredSeconds !== undefined && configuredSeconds > 0) ? configuredSeconds : 60;
    setInitialSeconds(updated);
    if (status === "idle") {
      setRemainingSeconds(updated);
    }
  }, [configuredSeconds, status]);

  const clearTimer = useCallback(() => {
    if (timerIdRef.current !== null) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const handleStart = useCallback(() => {
    clearTimer();
    const isRestart = status === "finished" || remainingSeconds <= 0;
    const secondsToRun = isRestart ? initialSeconds : remainingSeconds;
    if (isRestart) {
      setRemainingSeconds(initialSeconds);
    }
    const target = Date.now() + secondsToRun * 1000;
    endTimeRef.current = target;
    setStatus("running");

    timerIdRef.current = window.setInterval(() => {
      if (endTimeRef.current === null) return;
      const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        clearTimer();
        setStatus("finished");
        endTimeRef.current = null;
        playBeep();
      }
    }, 250);
  }, [clearTimer, initialSeconds, remainingSeconds, status]);

  const handlePause = useCallback(() => {
    if (status !== "running") return;
    clearTimer();
    if (endTimeRef.current !== null) {
      const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemainingSeconds(left);
      endTimeRef.current = null;
    }
    setStatus("paused");
  }, [clearTimer, status]);

  const handleStop = useCallback(() => {
    clearTimer();
    endTimeRef.current = null;
    setStatus("idle");
    setRemainingSeconds(initialSeconds);
  }, [clearTimer, initialSeconds]);

  const handleReset = useCallback(() => {
    clearTimer();
    endTimeRef.current = null;
    setStatus("idle");
    setRemainingSeconds(initialSeconds);
  }, [clearTimer, initialSeconds]);

  const handleAdjust = useCallback((delta: number) => {
    setRemainingSeconds(prev => {
      const next = Math.max(5, prev + delta);
      if (status === "running") {
        endTimeRef.current = Date.now() + next * 1000;
      }
      return next;
    });
  }, [status]);

  const statusLabel = {
    idle: "Listo para iniciar",
    running: "En curso",
    paused: "En pausa",
    finished: "¡Finalizado!",
  }[status];

  return (
    <div
      className="rest-timer"
      aria-label={`Temporizador de descanso para ${exerciseName}`}
    >
      <div className="rest-timer-header">
        <h4 className="rest-timer-heading">Temporizador de descanso</h4>
        <span
          className={`rest-timer-badge rest-timer-badge--${status}`}
          role="status"
          aria-label={`Estado del temporizador: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="rest-timer-display">
        <div
          className="rest-timer-clock"
          role="timer"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Tiempo restante: ${remainingSeconds} segundos`}
        >
          <span className="rest-timer-time">{formatTime(remainingSeconds)}</span>
          <span className="rest-timer-unit">({remainingSeconds} s)</span>
        </div>
        <div className="rest-timer-origin">
          {hasConfigured ? (
            <span>Descanso configurado: {configuredSeconds} s</span>
          ) : (
            <span>Descanso estándar: 60 s</span>
          )}
        </div>
      </div>

      <div className="rest-timer-controls">
        {status === "idle" && (
          <button
            type="button"
            className="routine-primary rest-timer-btn"
            onClick={handleStart}
            aria-label={`Iniciar descanso para ${exerciseName}`}
          >
            Iniciar descanso
          </button>
        )}

        {status === "running" && (
          <>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handlePause}
              aria-label={`Pausar descanso para ${exerciseName}`}
            >
              Pausar
            </button>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handleStop}
              aria-label={`Detener descanso para ${exerciseName}`}
            >
              Detener
            </button>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handleReset}
              aria-label={`Reiniciar descanso para ${exerciseName}`}
            >
              Reiniciar
            </button>
          </>
        )}

        {status === "paused" && (
          <>
            <button
              type="button"
              className="routine-primary rest-timer-btn"
              onClick={handleStart}
              aria-label={`Reanudar descanso para ${exerciseName}`}
            >
              Reanudar
            </button>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handleStop}
              aria-label={`Detener descanso para ${exerciseName}`}
            >
              Detener
            </button>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handleReset}
              aria-label={`Reiniciar descanso para ${exerciseName}`}
            >
              Reiniciar
            </button>
          </>
        )}

        {status === "finished" && (
          <>
            <button
              type="button"
              className="routine-primary rest-timer-btn"
              onClick={handleStart}
              aria-label={`Iniciar de nuevo descanso para ${exerciseName}`}
            >
              Iniciar de nuevo
            </button>
            <button
              type="button"
              className="routine-secondary rest-timer-btn"
              onClick={handleReset}
              aria-label={`Reiniciar descanso para ${exerciseName}`}
            >
              Reiniciar
            </button>
          </>
        )}
      </div>

      <div className="rest-timer-quick-adjust" aria-label="Ajuste rápido de tiempo">
        <span className="rest-timer-adjust-label">Ajustar:</span>
        <button
          type="button"
          className="routine-secondary rest-timer-adjust-btn"
          onClick={() => handleAdjust(-15)}
          aria-label={`Restar 15 segundos al descanso de ${exerciseName}`}
        >
          -15 s
        </button>
        <button
          type="button"
          className="routine-secondary rest-timer-adjust-btn"
          onClick={() => handleAdjust(15)}
          aria-label={`Sumar 15 segundos al descanso de ${exerciseName}`}
        >
          +15 s
        </button>
        <button
          type="button"
          className="routine-secondary rest-timer-adjust-btn"
          onClick={() => handleAdjust(30)}
          aria-label={`Sumar 30 segundos al descanso de ${exerciseName}`}
        >
          +30 s
        </button>
      </div>

      {status === "finished" && (
        <div
          role="status"
          aria-live="polite"
          className="rest-timer-finished-banner"
        >
          ¡Descanso completado! Preparado para la siguiente serie.
        </div>
      )}
    </div>
  );
}
