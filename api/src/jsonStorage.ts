import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const queues = new Map<string, Promise<unknown>>();

export function runFileTransaction<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  queues.set(path, task);
  void task.finally(() => { if (queues.get(path) === task) queues.delete(path); }).catch(() => undefined);
  return task;
}

export async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") await unlink(temporary).catch(() => undefined);
      throw error;
    });
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        if (attempt >= 3 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
        await delay(25 * 2 ** attempt);
      }
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}
