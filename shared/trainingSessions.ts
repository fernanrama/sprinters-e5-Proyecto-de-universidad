import { isRoutine, type Routine, type RoutineItem } from "./routines.js";

export type TrainingSession = {
  id: string;
  startedAt: string;
  routine: Omit<Routine, "items"> & { items: (RoutineItem & { exerciseName: string })[] };
};

export function isTrainingSession(value: unknown): value is TrainingSession {
  if (typeof value !== "object" || value === null) return false;
  const { id, startedAt, routine } = value as Record<string, unknown>;
  return typeof id === "string" && id.length > 0 &&
    typeof startedAt === "string" && Number.isFinite(Date.parse(startedAt)) &&
    isRoutine(routine) && routine.items.length > 0 &&
    routine.items.every(item => "exerciseName" in item &&
      typeof item.exerciseName === "string" && item.exerciseName.trim().length > 0);
}
