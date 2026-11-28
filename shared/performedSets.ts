// HU03 · SCRUM-56 — Serie realizada durante una sesión de entrenamiento.
// Guarda lo que la persona hizo realmente, aunque difiera de lo planificado en la rutina.

export type PerformedSet = {
  id: string;
  /** Identificador del ejercicio de la rutina copiada en la sesión (RoutineItem.id). */
  itemId: string;
  /** Número de la serie dentro del ejercicio, empezando en 1. Lo asigna el servidor. */
  setNumber: number;
  repetitions: number;
  weightKg: number;
  rpe: number;
  recordedAt: string;
};

/** Datos que envía el cliente para registrar una serie. */
export type PerformedSetInput = Pick<PerformedSet, "itemId" | "repetitions" | "weightKg" | "rpe">;

/**
 * Límites lógicos compartidos por la API y el formulario.
 * El peso admite 0 kg para ejercicios con el propio peso corporal.
 */
export const PERFORMED_SET_LIMITS = {
  repetitions: { min: 1, max: 100, step: 1 },
  weightKg: { min: 0, max: 500, step: 0.5 },
  rpe: { min: 1, max: 10, step: 0.5 },
} as const;
