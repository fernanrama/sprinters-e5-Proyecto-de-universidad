import { isRoutine, type Routine, type RoutineItem } from "./routines.js";
import { isPerformedSet, type PerformedSet } from "./performedSets.js";

export type TrainingSession = {
  id: string;
  startedAt: string;
  routine: Omit<Routine, "items"> & { items: (RoutineItem & { exerciseName: string })[] };
  /** HU03: series realizadas. Opcional para seguir leyendo sesiones guardadas antes de HU03. */
  performedSets?: PerformedSet[];
};

export function isTrainingSession(value: unknown): value is TrainingSession {
  if (typeof value !== "object" || value === null) return false;
  const { id, startedAt, routine, performedSets } = value as Record<string, unknown>;
  return typeof id === "string" && id.length > 0 &&
    typeof startedAt === "string" && Number.isFinite(Date.parse(startedAt)) &&
    isRoutine(routine) && routine.items.length > 0 &&
    routine.items.every(item => "exerciseName" in item &&
      typeof item.exerciseName === "string" && item.exerciseName.trim().length > 0) &&
    (performedSets === undefined || validPerformedSets(performedSets, routine.items.map(item => item.id)));
}

function validPerformedSets(value: unknown, itemIds: string[]): value is PerformedSet[] {
  return Array.isArray(value) && value.every(set => isPerformedSet(set) && itemIds.includes(set.itemId)) &&
    new Set(value.map(set => set.id)).size === value.length;
}
