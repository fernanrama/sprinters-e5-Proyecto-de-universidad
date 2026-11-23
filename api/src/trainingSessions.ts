import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isTrainingSession, type TrainingSession } from "../../shared/trainingSessions.js";
import { runFileTransaction, writeJsonAtomically } from "./jsonStorage.js";
import { RoutineError } from "./routines.js";

export function createTrainingSessionStore(file: URL) {
  const path = fileURLToPath(file);

  async function read(): Promise<TrainingSession | null> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const session: unknown = JSON.parse(raw);
    if (!isTrainingSession(session)) throw new Error("Archivo de sesión de entrenamiento inválido.");
    return session;
  }

  function start(routineId: string, readRoutine: () => Promise<TrainingSession["routine"]>) {
    return runFileTransaction(path, async () => {
      const active = await read();
      if (active?.routine.id === routineId) {
        throw new RoutineError(409, "Esta rutina ya tiene una sesión en curso.");
      }

      const routine = await readRoutine();
      if (active) throw new RoutineError(409, "Ya hay otra sesión en curso.");

      const session = { id: randomUUID(), startedAt: new Date().toISOString(), routine };
      await mkdir(dirname(path), { recursive: true });
      await writeJsonAtomically(path, session);
      return session;
    });
  }

  return { read, start };
}
