import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "./app.js";

const port = 3001;
const root = new URL(import.meta.url.includes("/dist/") ? "../../../../" : "../../", import.meta.url);
const devDirectory = process.env.SPRINTERS_DEV_DATA_DIRECTORY;
const dataFile = (name: string) => devDirectory
  ? pathToFileURL(join(devDirectory, name))
  : new URL(`api/data/${name}`, root);

const app = createApp({
  webDirectory: fileURLToPath(new URL("web/dist/", root)),
  catalogFile: new URL("api/data/exercises.json", root),
  routinesFile: dataFile("routines.local.json"),
  routinesSeed: new URL("api/data/routines.seed.json", root),
  scheduleFile: dataFile("schedules.local.json"),
  trainingSessionFile: dataFile("training-session.local.json"),
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`API disponible en http://127.0.0.1:${port}`);
});
server.on("error", (error) => {
  console.error("No se pudo arrancar la API:", error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close());
}
