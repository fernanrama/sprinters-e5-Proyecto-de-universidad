import { test, expect } from "@playwright/test";

test.describe("HU06 · Temporizador de descansos", () => {
  test.beforeEach(async ({ page, request }) => {
    // Asegurar que existe una sesión activa para "Fuerza · cuerpo completo"
    const activeRes = await request.get("/api/sessions/active");
    const active = await activeRes.json();
    if (!active) {
      const routinesRes = await request.get("/api/routines");
      const routines = await routinesRes.json();
      const routine = routines.find((r: { name: string }) => r.name === "Fuerza · cuerpo completo");
      if (routine) {
        await request.post("/api/sessions", { data: { routineId: routine.id } });
      }
    }
    await page.goto("/#/rutinas/sesion");
    await expect(page.getByRole("heading", { name: "Sesión de entrenamiento" })).toBeVisible();
  });

  test("toma como valor inicial el descanso configurado para cada ejercicio", async ({ page }) => {
    const listItems = page.getByRole("listitem");
    await expect(listItems).toHaveCount(2);

    // Ejercicio 1: Sentadilla tiene configurado 90s de descanso
    const sentadilla = listItems.nth(0);
    await expect(sentadilla).toContainText("Sentadilla");
    await expect(sentadilla).toContainText("Descanso: 90 s");
    const timerSentadilla = sentadilla.getByLabel("Temporizador de descanso para Sentadilla");
    await expect(timerSentadilla).toBeVisible();
    await expect(timerSentadilla.getByRole("timer")).toContainText("01:30");
    await expect(timerSentadilla.getByRole("timer")).toContainText("90 s");
    await expect(timerSentadilla).toContainText("Descanso configurado: 90 s");
    await expect(timerSentadilla.locator(".rest-timer-badge")).toHaveText("Listo para iniciar");

    // Ejercicio 2: Remo tiene configurado 60s de descanso
    const remo = listItems.nth(1);
    await expect(remo).toContainText("Remo");
    await expect(remo).toContainText("Descanso: 60 s");
    const timerRemo = remo.getByLabel("Temporizador de descanso para Remo");
    await expect(timerRemo).toBeVisible();
    await expect(timerRemo.getByRole("timer")).toContainText("01:00");
    await expect(timerRemo.getByRole("timer")).toContainText("60 s");
    await expect(timerRemo).toContainText("Descanso configurado: 60 s");
    await expect(timerRemo.locator(".rest-timer-badge")).toHaveText("Listo para iniciar");
  });

  test("permite iniciar, pausar, reanudar, detener y reiniciar el descanso viendo el tiempo restante", async ({ page }) => {
    const sentadilla = page.getByRole("listitem").nth(0);
    const timer = sentadilla.getByLabel("Temporizador de descanso para Sentadilla");

    // Asegurarse de que esté en estado inicial
    const initialReset = timer.getByRole("button", { name: "Reiniciar descanso para Sentadilla" });
    if (await initialReset.isVisible()) {
      await initialReset.click();
    }

    // 1. Iniciar descanso
    const startBtn = timer.getByRole("button", { name: "Iniciar descanso para Sentadilla" });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Estado cambia a "En curso" y aparecen controles de pausa, detener y reiniciar
    await expect(timer.locator(".rest-timer-badge")).toHaveText("En curso");
    const pauseBtn = timer.getByRole("button", { name: "Pausar descanso para Sentadilla" });
    const stopBtn = timer.getByRole("button", { name: "Detener descanso para Sentadilla" });
    const resetBtn = timer.getByRole("button", { name: "Reiniciar descanso para Sentadilla" });

    await expect(pauseBtn).toBeVisible();
    await expect(stopBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();

    // Esperar a que el contador baje de 90 segundos
    await expect(timer.getByRole("timer")).not.toContainText("90 s", { timeout: 3000 });

    // 2. Pausar descanso
    await pauseBtn.click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("En pausa");
    const resumeBtn = timer.getByRole("button", { name: "Reanudar descanso para Sentadilla" });
    await expect(resumeBtn).toBeVisible();

    // Obtener el tiempo congelado en pausa
    const pausedTimeText = await timer.getByRole("timer").innerText();

    // Esperar 1.5s y comprobar que no cambia mientras está en pausa
    await page.waitForTimeout(1500);
    expect(await timer.getByRole("timer").innerText()).toBe(pausedTimeText);

    // 3. Reanudar descanso
    await resumeBtn.click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("En curso");
    await expect(timer.getByRole("button", { name: "Pausar descanso para Sentadilla" })).toBeVisible();

    // 4. Reiniciar descanso
    await resetBtn.click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("Listo para iniciar");
    await expect(timer.getByRole("timer")).toContainText("01:30");
    await expect(timer.getByRole("timer")).toContainText("90 s");
    await expect(timer.getByRole("button", { name: "Iniciar descanso para Sentadilla" })).toBeVisible();

    // 5. Iniciar y Detener descanso
    await timer.getByRole("button", { name: "Iniciar descanso para Sentadilla" }).click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("En curso");
    await timer.getByRole("button", { name: "Detener descanso para Sentadilla" }).click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("Listo para iniciar");
    await expect(timer.getByRole("timer")).toContainText("01:30");
    await expect(timer.getByRole("timer")).toContainText("90 s");
  });

  test("permite ajuste rápido de tiempo (+15s, -15s, +30s)", async ({ page }) => {
    const sentadilla = page.getByRole("listitem").nth(0);
    const timer = sentadilla.getByLabel("Temporizador de descanso para Sentadilla");

    // Asegurar reinicio inicial
    const initialReset = timer.getByRole("button", { name: "Reiniciar descanso para Sentadilla" });
    if (await initialReset.isVisible()) {
      await initialReset.click();
    }

    // Inicialmente 90 s
    await expect(timer.getByRole("timer")).toContainText("90 s");

    // Sumar 30 s -> 120 s (02:00)
    await timer.getByRole("button", { name: "Sumar 30 segundos al descanso de Sentadilla" }).click();
    await expect(timer.getByRole("timer")).toContainText("02:00");
    await expect(timer.getByRole("timer")).toContainText("120 s");

    // Restar 15 s -> 105 s (01:45)
    await timer.getByRole("button", { name: "Restar 15 segundos al descanso de Sentadilla" }).click();
    await expect(timer.getByRole("timer")).toContainText("01:45");
    await expect(timer.getByRole("timer")).toContainText("105 s");

    // Sumar 15 s -> 120 s (02:00)
    await timer.getByRole("button", { name: "Sumar 15 segundos al descanso de Sentadilla" }).click();
    await expect(timer.getByRole("timer")).toContainText("02:00");
    await expect(timer.getByRole("timer")).toContainText("120 s");

    // Reiniciar vuelve a los 90s configurados
    await timer.getByRole("button", { name: "Iniciar descanso para Sentadilla" }).click();
    await timer.getByRole("button", { name: "Reiniciar descanso para Sentadilla" }).click();
    await expect(timer.getByRole("timer")).toContainText("01:30");
    await expect(timer.getByRole("timer")).toContainText("90 s");
  });

  test("muestra aviso accesible al finalizar la cuenta atrás", async ({ page }) => {
    const remo = page.getByRole("listitem").nth(1);
    const timer = remo.getByLabel("Temporizador de descanso para Remo");

    // Asegurar reinicio
    const initialReset = timer.getByRole("button", { name: "Reiniciar descanso para Remo" });
    if (await initialReset.isVisible()) {
      await initialReset.click();
    }

    // Reducir con -15s hasta el mínimo (5s) para probar la finalización rápida
    await timer.getByRole("button", { name: "Restar 15 segundos al descanso de Remo" }).click(); // 45s
    await timer.getByRole("button", { name: "Restar 15 segundos al descanso de Remo" }).click(); // 30s
    await timer.getByRole("button", { name: "Restar 15 segundos al descanso de Remo" }).click(); // 15s
    await timer.getByRole("button", { name: "Restar 15 segundos al descanso de Remo" }).click(); // 5s (mínimo)

    await expect(timer.getByRole("timer")).toContainText("00:05");
    await expect(timer.getByRole("timer")).toContainText("5 s");

    // Iniciar los 5 segundos
    await timer.getByRole("button", { name: "Iniciar descanso para Remo" }).click();
    await expect(timer.locator(".rest-timer-badge")).toHaveText("En curso");

    // Esperar a que finalice (máximo 8s)
    await expect(timer.locator(".rest-timer-badge")).toHaveText("¡Finalizado!", { timeout: 8000 });
    await expect(timer.getByRole("timer")).toContainText("00:00");
    await expect(timer.getByRole("timer")).toContainText("0 s");

    // Verificar el aviso para el usuario
    const finishedBanner = timer.getByText("¡Descanso completado! Preparado para la siguiente serie.");
    await expect(finishedBanner).toBeVisible();

    // Botón para reiniciar disponible
    const restartBtn = timer.getByRole("button", { name: "Reiniciar descanso para Remo" });
    await expect(restartBtn).toBeVisible();
    await restartBtn.click();
    await expect(timer.getByRole("timer")).toContainText("01:00");
  });

  test("accesibilidad táctil, teclado y sin desbordamiento horizontal en móvil (320px y 390px)", async ({ page }) => {
    const sentadilla = page.getByRole("listitem").nth(0);
    const timer = sentadilla.getByLabel("Temporizador de descanso para Sentadilla");

    // Asegurar reinicio
    const initialReset = timer.getByRole("button", { name: "Reiniciar descanso para Sentadilla" });
    if (await initialReset.isVisible()) {
      await initialReset.click();
    }

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(overflow).toBe(true);

      const buttons = timer.getByRole("button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          // Altura mínima táctil de 44px según WCAG 2.1 AA
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }

    // Navegación por teclado
    const startBtn = timer.getByRole("button", { name: "Iniciar descanso para Sentadilla" });
    await startBtn.focus();
    await expect(startBtn).toBeFocused();
    await page.keyboard.press("Enter");

    const pauseBtn = timer.getByRole("button", { name: "Pausar descanso para Sentadilla" });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();
  });
});
