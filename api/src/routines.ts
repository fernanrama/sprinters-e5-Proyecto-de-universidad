import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runFileTransaction, writeJsonAtomically } from "./jsonStorage.js";
import { 
  isRoutine, isRoutineCreate, isRoutineUpdate, isRoutineSchedule, 
  type Routine, type RoutineCreate, type RoutineUpdate, type RoutineSchedule 
} from "../../shared/routines.js";

export { isRoutine, isRoutineCreate, isRoutineUpdate, isRoutineSchedule } from "../../shared/routines.js";
export type { Routine, RoutineItem, RoutineCreate, RoutineUpdate, RoutineSchedule } from "../../shared/routines.js";

export class RoutineError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createRoutineStore(file: string | URL, seed?: URL) {
  const path = resolve(typeof file === "string" ? file : fileURLToPath(file));
  
  async function read(): Promise<Routine[]> {
    let raw: string;
    try { raw = await readFile(path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !seed) throw error;
      await mkdir(dirname(path), { recursive: true });
      try { await copyFile(seed, path, constants.COPYFILE_EXCL); }
      catch (copyError) { if ((copyError as NodeJS.ErrnoException).code !== "EEXIST") throw copyError; }
      raw = await readFile(path, "utf8");
    }
    const routines: unknown = JSON.parse(raw);
    if (!Array.isArray(routines) || !routines.every(isRoutine) || new Set(routines.map(routine => routine.id)).size !== routines.length) {
      throw new Error("Archivo de rutinas inválido");
    }
    return routines;
  }

  return {
    read,
    create(input: RoutineCreate): Promise<Routine> {
      if (!isRoutineCreate(input)) return Promise.reject(new RoutineError(400, "Datos de rutina inválidos."));
      return runFileTransaction(path, async () => {
        const routines = await read();
        const routine: Routine = { id: `rutina-${randomUUID()}`, name: input.name.trim(), version: 1, items: input.items };
        await writeJsonAtomically(path, [...routines, routine]);
        return routine;
      });
    },
    update(id: string, input: RoutineUpdate): Promise<Routine> {
      if (!isRoutineUpdate(input)) return Promise.reject(new RoutineError(400, "Datos de rutina inválidos."));
      return runFileTransaction(path, async () => {
        const routines = await read();
        const index = routines.findIndex(routine => routine.id === id);
        if (index < 0) throw new RoutineError(404, "Rutina no encontrada.");
        if (routines[index].version !== input.version) throw new RoutineError(409, "La rutina ha cambiado. Recarga antes de volver a guardar.");
        const updated: Routine = { id, name: input.name.trim(), version: input.version + 1, items: input.items };
        routines[index] = updated;
        await writeJsonAtomically(path, routines);
        return updated;
      });
    },
    remove(id: string): Promise<void> {
      return runFileTransaction(path, async () => {
        const routines = await read();
        const remaining = routines.filter(routine => routine.id !== id);
        if (remaining.length === routines.length) throw new RoutineError(404, "Rutina no encontrada.");
        await writeJsonAtomically(path, remaining);
      });
    },
  };
}

// Almacén para las programaciones (HU05 y HU06)
export function createScheduleStore(file: string | URL) {
  const path = resolve(typeof file === "string" ? file : fileURLToPath(file));

  async function read(): Promise<RoutineSchedule[]> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const schedules: unknown = JSON.parse(raw);
    if (!Array.isArray(schedules) || !schedules.every(isRoutineSchedule)) {
      throw new Error("Archivo de programaciones inválido");
    }
    return schedules;
  }

  async function persist(schedules: RoutineSchedule[]) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(schedules, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }

  return {
    read,
    async create(routineId: string, date: string): Promise<RoutineSchedule> {
      const schedules = await read();
      const newSchedule: RoutineSchedule = { id: `sched-${randomUUID()}`, routineId, date };
      await persist([...schedules, newSchedule]);
      return newSchedule;
    },
    async update(id: string, newDate: string): Promise<RoutineSchedule> {
      const schedules = await read();
      const index = schedules.findIndex(s => s.id === id);
      if (index < 0) throw new RoutineError(404, "Programación no encontrada.");
      
      const updated = { ...schedules[index], date: newDate };
      schedules[index] = updated;
      await persist(schedules);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const schedules = await read();
      const filtered = schedules.filter(s => s.id !== id);
      if (schedules.length === filtered.length) throw new RoutineError(404, "Programación no encontrada.");
      await persist(filtered);
    }
  };
}
