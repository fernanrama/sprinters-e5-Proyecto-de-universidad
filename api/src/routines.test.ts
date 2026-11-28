import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import { createApp } from "./app.js";
import { createRoutineStore } from "./routines.js";

const seed = new URL("../data/routines.seed.json", import.meta.url);
async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "sprinters-routines-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const routinesFile = pathToFileURL(join(directory, "routines.json"));
  await writeFile(routinesFile, await readFile(seed));
  async function serve() {
    const server = createApp({
      routinesFile,
      scheduleFile: pathToFileURL(join(directory, "schedules.json")),
      trainingSessionFile: pathToFileURL(join(directory, "training-session.json")),
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    async function stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    }
    t.after(() => server.listening ? stop() : undefined);
    const address = server.address(); assert(address && typeof address !== "string");
    return { origin: `http://127.0.0.1:${address.port}/api`, stop };
  }
  const app = await serve();
  const original = JSON.parse(await readFile(routinesFile, "utf8"));
  async function put(body: unknown, id = original[0].id) {
    return fetch(`${app.origin}/routines/${id}`, { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  return { ...app, serve, put, original, routinesFile };
}
test("lectura individual, listado y 404 de rutinas", async (t) => {
  const { origin, original } = await setup(t);
  assert.deepEqual(await (await fetch(`${origin}/routines`)).json(), original);
  assert.deepEqual(await (await fetch(`${origin}/routines/${original[0].id}`)).json(), original[0]);
  assert.equal((await fetch(`${origin}/routines/no-existe`)).status, 404);
});

test("el inicio de sesión rechaza rutinas vacías o inexistentes", async (t) => {
  const { origin, original } = await setup(t);
  const start = (body: unknown) => fetch(`${origin}/sessions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await start({})).status, 400);
  assert.equal((await start({ routineId: "no-existe" })).status, 404);
  const empty = await start({ routineId: original[1].id });
  assert.equal(empty.status, 422);
  assert.deepEqual(await empty.json(), { error: "Añade al menos un ejercicio para iniciar la sesión." });
  const active = await fetch(`${origin}/sessions/active`);
  assert.equal(active.status, 200);
  assert.equal(await active.json(), null);
});

test("la sesión bloquea otros inicios y conserva la rutina inicial tras editar y reiniciar", async (t) => {
  const { origin, original, put, stop, serve } = await setup(t);
  const routine = original[0];
  const options = (body: unknown) => ({
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const start = (routineId: string) => fetch(`${origin}/sessions`, options({ routineId }));
  const results = await Promise.all([start(routine.id), start(routine.id)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const created = results.find(result => result.status === 201);
  const duplicate = results.find(result => result.status === 409);
  assert.ok(created && duplicate);
  const session = await created.json();
  assert.deepEqual(await duplicate.json(), { error: "Esta rutina ya tiene una sesión en curso." });
  assert.ok(session.id && Number.isFinite(Date.parse(session.startedAt)));
  assert.equal(session.routine.id, routine.id);
  assert.equal(session.routine.name, routine.name);
  assert.equal(session.routine.version, routine.version);
  assert.equal(session.routine.items[0].exerciseName, "Sentadilla");
  assert.deepEqual(session.routine.items.map(({ exerciseName, ...item }: { exerciseName: string }) => item), routine.items);

  const other = await fetch(`${origin}/routines`, options({ name: "Otra rutina", items: routine.items }));
  assert.equal(other.status, 201);
  const conflict = await start((await other.json()).id);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "Ya hay otra sesión en curso." });
  assert.equal((await put({ ...routine, name: "Editada", items: [] })).status, 200);
  assert.equal((await start(routine.id)).status, 409);
  assert.deepEqual(await (await fetch(`${origin}/sessions`)).json(), []);

  await stop();
  const restarted = await serve();
  const active = await fetch(`${restarted.origin}/sessions/active`);
  assert.equal(active.headers.get("cache-control"), "no-store");
  assert.deepEqual(await active.json(), session);
});
test("guardar persiste tras recrear el servidor y no cambia otras rutinas", async (t) => {
  const { put, original, routinesFile, stop, serve } = await setup(t);
  const update = { ...original[0], name: "Mi rutina revisada" };
  const response = await put(update); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.version, 2);
  assert.deepEqual(saved.items, original[0].items);
  await stop(); const restarted = await serve();
  assert.deepEqual(await (await fetch(`${restarted.origin}/routines/${saved.id}`)).json(), saved);
  const disk = JSON.parse(await readFile(routinesFile, "utf8"));
  assert.deepEqual(disk[1], original[1]);
});
test("dos guardados simultáneos solo aceptan la misma versión una vez", async (t) => {
  const { put, original } = await setup(t);
  const results = await Promise.all([put(original[0]), put(original[0])]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("dos instancias del almacén comparten la cola para el mismo archivo", async (t) => {
  const { routinesFile, original } = await setup(t);
  const a = createRoutineStore(routinesFile), b = createRoutineStore(routinesFile);
  const results = await Promise.allSettled([a.update(original[0].id, original[0]), b.update(original[0].id, original[0])]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("datos inválidos o ejercicios inexistentes no modifican el JSON", async (t) => {
  const { put, original, routinesFile } = await setup(t);
  const before = await readFile(routinesFile, "utf8");
  const item = original[0].items[0];
  for (const update of [
    { ...original[0], name: " " }, { ...original[0], version: 0 },
    { ...original[0], items: [{ ...item, sets: -1 }] },
    { ...original[0], items: [{ ...item, repetitions: 1.5 }] },
    { ...original[0], items: [item, item] },
    { ...original[0], items: [{ ...item, exerciseId: "no-existe" }] },
    { ...original[0], items: [{ ...item, parameters: { nested: {} } }] },
  ]) assert.equal((await put(update)).status, 400);
  assert.equal((await put(original[0], "no-existe")).status, 404);
  assert.equal(await readFile(routinesFile, "utf8"), before);
});
test("JSON corrupto devuelve error y nunca reinicia datos", async (t) => {
  const { origin, put, original, routinesFile } = await setup(t);
  await writeFile(routinesFile, "{corrupto");
  assert.equal((await fetch(`${origin}/routines`)).status, 500);
  assert.equal((await put(original[0])).status, 500);
  assert.equal(await readFile(routinesFile, "utf8"), "{corrupto");
});
test("almacenamiento no utilizable devuelve 500 y permite reintentar tras repararlo", async (t) => {
  const { put, original, routinesFile } = await setup(t);
  // Un directorio en lugar de archivo simula almacenamiento no utilizable.
  const before = await readFile(routinesFile, "utf8");
  await rm(routinesFile); await mkdir(routinesFile);
  assert.equal((await put(original[0])).status, 500);
  await rm(routinesFile, { recursive: true }); await writeFile(routinesFile, before);
  assert.equal((await put(original[0])).status, 200);
});
test("inicialización desde semilla solo al faltar el archivo y admite lista vacía", async (t) => {
  const { routinesFile, original } = await setup(t);
  await rm(routinesFile);
  const store = createRoutineStore(routinesFile, seed);
  assert.deepEqual(await store.read(), original);
  await writeFile(routinesFile, "[]"); assert.deepEqual(await store.read(), []);
  await writeFile(routinesFile, "null"); await assert.rejects(() => store.read());
  assert.equal(await readFile(routinesFile, "utf8"), "null");
});
test("JSON de petición mal formado se rechaza con 400", async (t) => {
  const { origin } = await setup(t);
  const response = await fetch(`${origin}/routines/rutina-demo-fuerza`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: "{roto",
  });
  assert.equal(response.status, 400);
});

test("quitar un ejercicio persiste tras reiniciar y conserva parámetros, orden, catálogo y otras rutinas", async (t) => {
  const { put, original, routinesFile, origin, stop, serve } = await setup(t);
  const routine = { ...original[0], items: [
    { id: "primero", exerciseId: "sentadilla", sets: 4, repetitions: 8, parameters: { restSeconds: 90, rir: 0 } },
    { id: "quitar", exerciseId: "plancha", sets: 3, repetitions: 30 },
    { id: "ultimo", exerciseId: "remo-mancuerna", sets: 2, repetitions: 15, parameters: { restSeconds: 60 } },
  ] };
  await writeFile(routinesFile, JSON.stringify([routine, ...original.slice(1)]));
  const catalogBefore = await (await fetch(`${origin}/exercises`)).json();
  const items = [routine.items[0], routine.items[2]];
  const response = await put({ ...routine, items });
  assert.equal(response.status, 200);
  await stop(); const restarted = await serve();
  const reopened = await (await fetch(`${restarted.origin}/routines/${routine.id}`)).json();
  assert.deepEqual(reopened.items, items);
  assert.equal(reopened.version, routine.version + 1);
  assert.deepEqual(JSON.parse(await readFile(routinesFile, "utf8")).slice(1), original.slice(1));
  assert.deepEqual(await (await fetch(`${restarted.origin}/exercises`)).json(), catalogBefore);
});

test("preparar una eliminación sin PUT no cambia los datos persistidos", async (t) => {
  const { original, routinesFile, origin } = await setup(t);
  const before = await readFile(routinesFile, "utf8");
  const draft = structuredClone(original[0]);
  draft.items = draft.items.slice(1);
  assert.deepEqual(await (await fetch(`${origin}/routines/${draft.id}`)).json(), original[0]);
  assert.equal(await readFile(routinesFile, "utf8"), before);
});

test("quitar todos los ejercicios conserva la rutina vacía tras reiniciar", async (t) => {
  const { put, original, stop, serve } = await setup(t);
  assert.equal((await put({ ...original[0], items: [] })).status, 200);
  await stop(); const restarted = await serve();
  const reopened = await (await fetch(`${restarted.origin}/routines/${original[0].id}`)).json();
  assert.equal(reopened.id, original[0].id);
  assert.equal(reopened.name, original[0].name);
  assert.deepEqual(reopened.items, []);
});

test("un borrador antiguo no sobrescribe una eliminación ya guardada", async (t) => {
  const { put, original, origin } = await setup(t);
  const items = original[0].items.slice(1);
  assert.equal((await put({ ...original[0], items })).status, 200);
  assert.equal((await put(original[0])).status, 409);
  assert.deepEqual((await (await fetch(`${origin}/routines/${original[0].id}`)).json()).items, items);
});

test("POST rechaza entradas inválidas y duplicados igual que PUT, sin tocar el archivo", async t => {
  const { origin, original, routinesFile, put } = await setup(t);
  const before = await readFile(routinesFile, "utf8");
  const item = original[0].items[0];
  for (const items of [null, [null], [{ ...item, id: "" }], [{ ...item, sets: 0 }],
    [{ ...item, repetitions: 1.5 }], [{ ...item, parameters: { restSeconds: -1 } }],
    [{ ...item, parameters: { rir: null } }], [{ ...item, parameters: { unexpected: 1 } }],
    [{ ...item, parameters: [] }], [item, { ...item, id: "other" }],
    [item, { ...original[0].items[1], id: item.id }]]) {
    const response = await fetch(`${origin}/routines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "No guardar", items }) });
    assert.equal(response.status, 400);
    assert.equal((await put({ ...original[0], items })).status, 400);
    assert.equal(await readFile(routinesFile, "utf8"), before);
  }
});

test("POST, PUT y DELETE simultáneos conservan todas las transacciones", async t => {
  const { origin, original, put, routinesFile } = await setup(t);
  const creates = Array.from({ length: 8 }, (_, index) => fetch(`${origin}/routines`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Concurrente ${index}`, items: original[0].items }),
  }));
  const results = await Promise.all([...creates,
    put({ ...original[0], name: "Actualizada simultáneamente" }),
    fetch(`${origin}/routines/${original[1].id}`, { method: "DELETE" }),
  ]);
  assert.deepEqual(results.map(response => response.status), [...Array(8).fill(201), 200, 204]);
  const disk = JSON.parse(await readFile(routinesFile, "utf8"));
  assert.equal(disk.length, 9);
  assert.equal(new Set(disk.map((routine: { id: string }) => routine.id)).size, 9);
  assert.equal(disk.find((routine: { id: string }) => routine.id === original[0].id).name, "Actualizada simultáneamente");
  assert.equal(disk.find((routine: { id: string }) => routine.id === original[0].id).version, 2);
  assert.ok(!disk.some((routine: { id: string }) => routine.id === original[1].id));
});

test("dos almacenes coordinan altas, bajas y actualizaciones sobre el mismo archivo", async t => {
  const { routinesFile, original } = await setup(t);
  const a = createRoutineStore(routinesFile), b = createRoutineStore(routinesFile);
  const [created] = await Promise.all([
    a.create({ name: "Nueva", items: [] }), b.update(original[0].id, { ...original[0], name: "Editada" }), a.remove(original[1].id),
  ]);
  const disk = await b.read();
  assert.deepEqual(new Set(disk.map(routine => routine.id)), new Set([created.id, original[0].id]));
  assert.equal(disk.find(routine => routine.id === original[0].id)?.name, "Editada");
  await assert.rejects(() => b.remove("no-existe"), { status: 404 });
});

test("una rutina antigua con ejercicios repetidos se puede leer y reparar", async t => {
  const { routinesFile, original, origin, put } = await setup(t);
  const legacy = { ...original[0], items: [original[0].items[0], { ...original[0].items[0], id: "legacy-copy" }] };
  await writeFile(routinesFile, JSON.stringify([legacy]));
  assert.equal((await fetch(`${origin}/routines/${legacy.id}`)).status, 200);
  assert.equal((await put(legacy)).status, 400);
  assert.equal((await put({ ...legacy, items: legacy.items.slice(1) })).status, 200);
  const saved = await (await fetch(`${origin}/routines/${legacy.id}`)).json();
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].id, "legacy-copy");
});

test("POST y DELETE no reemplazan un JSON corrupto", async t => {
  const { routinesFile, origin, original } = await setup(t);
  await writeFile(routinesFile, "{corrupto");
  const response = await fetch(`${origin}/routines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nueva", items: [] }) });
  assert.equal(response.status, 500);
  assert.equal((await fetch(`${origin}/routines/${original[0].id}`, { method: "DELETE" })).status, 500);
  assert.equal(await readFile(routinesFile, "utf8"), "{corrupto");
});

// HU03 · SCRUM-123: registrar series realizadas en la sesión activa.
async function setupSession(t: TestContext) {
  const context = await setup(t);
  const json = (body: unknown) => ({
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const recordSet = (body: unknown, origin = context.origin) => fetch(`${origin}/sessions/active/sets`, json(body));
  const startSession = () => fetch(`${context.origin}/sessions`, json({ routineId: context.original[0].id }));
  return { ...context, recordSet, startSession };
}

test("HU03: una serie guardada conserva sus valores reales aunque difieran de los planificados", async (t) => {
  const { origin, original, recordSet, startSession, stop, serve } = await setupSession(t);
  assert.equal((await startSession()).status, 201);
  const item = original[0].items[0];
  const real = { itemId: item.id, repetitions: item.repetitions - 2, weightKg: 62.5, rpe: 9 };

  const response = await recordSet(real);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const set = await response.json();
  assert.deepEqual({ itemId: set.itemId, repetitions: set.repetitions, weightKg: set.weightKg, rpe: set.rpe }, real);
  assert.equal(set.setNumber, 1);
  assert.ok(set.id && Number.isFinite(Date.parse(set.recordedAt)));

  const second = await (await recordSet({ ...real, repetitions: item.repetitions, weightKg: 0 })).json();
  assert.equal(second.setNumber, 2, "numera las series de cada ejercicio");
  const other = await (await recordSet({ ...real, itemId: original[0].items[1].id })).json();
  assert.equal(other.setNumber, 1, "cada ejercicio tiene su propia numeración");

  const active = await (await fetch(`${origin}/sessions/active`)).json();
  assert.deepEqual(active.performedSets, [set, second, other]);
  assert.equal(active.routine.items[0].repetitions, item.repetitions, "la rutina planificada no cambia");

  await stop();
  const restarted = await serve();
  assert.deepEqual((await (await fetch(`${restarted.origin}/sessions/active`)).json()).performedSets, [set, second, other]);
});

test("HU03: el registro de series rechaza datos no válidos sin modificar la sesión", async (t) => {
  const { origin, original, recordSet, startSession } = await setupSession(t);
  const itemId = original[0].items[0].id;
  const noSession = await recordSet({ itemId, repetitions: 8, weightKg: 60, rpe: 8 });
  assert.equal(noSession.status, 404);
  assert.deepEqual(await noSession.json(), { error: "No hay ninguna sesión en curso." });

  assert.equal((await startSession()).status, 201);
  const before = await (await fetch(`${origin}/sessions/active`)).json();
  for (const body of [{}, { itemId, repetitions: 0, weightKg: 60, rpe: 8 }, { itemId, repetitions: 8, weightKg: -5, rpe: 8 },
    { itemId, repetitions: 8, weightKg: 60, rpe: 11 }, { itemId, repetitions: 8, weightKg: "60", rpe: 8 }]) {
    const response = await recordSet(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match((await response.json()).error, /repeticiones de 1 a 100/);
  }
  const unknown = await recordSet({ itemId: "no-existe", repetitions: 8, weightKg: 60, rpe: 8 });
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { error: "El ejercicio no pertenece a la sesión en curso." });
  const malformed = await fetch(`${origin}/sessions/active/sets`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await (await fetch(`${origin}/sessions/active`)).json(), before);
});

test("HU03: dos series enviadas a la vez se guardan ambas con números distintos", async (t) => {
  const { origin, original, recordSet, startSession } = await setupSession(t);
  assert.equal((await startSession()).status, 201);
  const itemId = original[0].items[0].id;
  const responses = await Promise.all([8, 7].map(repetitions => recordSet({ itemId, repetitions, weightKg: 60, rpe: 8 })));
  assert.deepEqual(responses.map(response => response.status), [201, 201]);
  const { performedSets } = await (await fetch(`${origin}/sessions/active`)).json();
  assert.equal(performedSets.length, 2);
  assert.deepEqual(performedSets.map((set: { setNumber: number }) => set.setNumber).sort(), [1, 2]);
});
