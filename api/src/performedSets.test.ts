import assert from "node:assert/strict";
import { test } from "node:test";
import { isPerformedSet, isPerformedSetInput, isValidSetValue } from "../../shared/performedSets.js";
import { isTrainingSession } from "../../shared/trainingSessions.js";

const input = { itemId: "item-1", repetitions: 8, weightKg: 62.5, rpe: 8.5 };

test("HU03: la serie acepta valores reales dentro de los límites", () => {
  assert.equal(isPerformedSetInput(input), true);
  assert.equal(isPerformedSetInput({ ...input, weightKg: 0 }), true, "0 kg = peso corporal");
  assert.equal(isPerformedSetInput({ ...input, repetitions: 1, rpe: 1 }), true);
  assert.equal(isPerformedSetInput({ ...input, repetitions: 100, weightKg: 500, rpe: 10 }), true);
});

test("HU03: la serie rechaza valores vacíos, negativos, fuera de rango o con paso incorrecto", () => {
  const invalid = [
    {}, null, [], { ...input, itemId: " " },
    { ...input, repetitions: 0 }, { ...input, repetitions: 101 }, { ...input, repetitions: 7.5 },
    { ...input, repetitions: "8" }, { ...input, weightKg: -2.5 }, { ...input, weightKg: 500.5 },
    { ...input, weightKg: 60.2 }, { ...input, weightKg: null }, { ...input, rpe: 0 }, { ...input, rpe: 10.5 },
    { ...input, rpe: 7.3 }, { ...input, rpe: Number.NaN }, { ...input, weightKg: Number.POSITIVE_INFINITY },
  ];
  for (const value of invalid) assert.equal(isPerformedSetInput(value), false, JSON.stringify(value));
  assert.equal(isValidSetValue("weightKg", 0.1 + 0.4), true, "tolera el redondeo de coma flotante");
});

test("HU03: una serie guardada exige id, número de serie y fecha", () => {
  const set = { ...input, id: "set-1", setNumber: 1, recordedAt: "2026-11-28T18:00:00.000Z" };
  assert.equal(isPerformedSet(set), true);
  assert.equal(isPerformedSet({ ...set, id: "" }), false);
  assert.equal(isPerformedSet({ ...set, setNumber: 0 }), false);
  assert.equal(isPerformedSet({ ...set, recordedAt: "ayer" }), false);
});

test("HU03: las sesiones guardadas antes de HU03 siguen siendo válidas", () => {
  const session = {
    id: "session-1",
    startedAt: "2026-11-28T17:00:00.000Z",
    routine: { id: "r-1", name: "Fuerza", version: 1,
      items: [{ id: "item-1", exerciseId: "sentadilla", sets: 3, repetitions: 10, exerciseName: "Sentadilla" }] },
  };
  const set = { ...input, id: "set-1", setNumber: 1, recordedAt: "2026-11-28T18:00:00.000Z" };
  assert.equal(isTrainingSession(session), true);
  assert.equal(isTrainingSession({ ...session, performedSets: [set] }), true);
  assert.equal(isTrainingSession({ ...session, performedSets: [{ ...set, itemId: "otro" }] }), false);
  assert.equal(isTrainingSession({ ...session, performedSets: [set, set] }), false, "ids duplicados");
  assert.equal(isTrainingSession({ ...session, performedSets: {} }), false);
});
