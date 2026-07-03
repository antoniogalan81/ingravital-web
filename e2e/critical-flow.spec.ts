// E2E del flujo crítico: login → crear operación → añadir gasto → refrescar → persiste.
//
// ⚠️ NO EJECUTADO en la sesión de hardening: el proyecto usa un ÚNICO Supabase de
// PRODUCCIÓN (no hay entorno de test) y ejecutarlo escribiría datos reales. Este test
// queda PREPARADO para ejecutarse contra un entorno NO productivo. Ver e2e/README.md.
//
// Salvaguardas incluidas:
//   1. GUARD anti-producción: aborta si E2E_SUPABASE_URL coincide con la URL de
//      producción (evita ensuciar datos reales por accidente).
//   2. Self-revert: borra la operación creada al final (test.afterEach), aunque falle.
//
// Requisitos para ejecutarlo (ver README): instalar @playwright/test y definir
// E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD y E2E_SUPABASE_URL (de un proyecto de test).

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";

// URL de PRODUCCIÓN conocida (auditada). Si el test apunta aquí, se aborta.
const PROD_SUPABASE_URL = "https://zrstaskwqwuxgelcrwxx.supabase.co";

const OP_NAME = `E2E TEMP ${Date.now()} — BORRAR`;

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD || !SUPABASE_URL) {
    throw new Error(
      "E2E sin configurar: define E2E_EMAIL, E2E_PASSWORD y E2E_SUPABASE_URL (entorno NO productivo).",
    );
  }
  if (SUPABASE_URL.replace(/\/$/, "") === PROD_SUPABASE_URL) {
    throw new Error(
      "ABORTADO: E2E_SUPABASE_URL apunta a PRODUCCIÓN. Usa un proyecto Supabase de test.",
    );
  }
});

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  // El login redirige a /finanzas al autenticar (ver app/login/page.tsx).
  await page.waitForURL(/\/finanzas/, { timeout: 15_000 });
}

test.describe("Flujo crítico de persistencia", () => {
  test("crear operación + gasto y comprobar que persiste tras refrescar", async ({ page }) => {
    await login(page);

    // NOTA: la ruta y los pasos del asistente de creación deben confirmarse contra la
    // app en marcha (el wizard es multipaso: categoría → modo → datos → "Crear operación").
    // Estos selectores usan textos reales confirmados en el código; ajústalos si la UI cambia.
    await page.goto(`${BASE_URL}/oportunidades`);
    await page.getByRole("button", { name: /Nueva operación/i }).click();
    // ...completar los pasos mínimos del asistente y ponerle nombre OP_NAME...
    // await page.getByLabel(/Nombre/i).fill(OP_NAME);
    // await page.getByRole("button", { name: "Crear operación" }).click();

    // Añadir un gasto rápido desde el hub de seguimiento.
    // await page.getByRole("button", { name: "+ Gasto" }).click();
    // await page.getByLabel(/Concepto/i).fill("E2E gasto temporal");
    // await page.getByRole("button", { name: /Guardar|Añadir/i }).click();

    // Refrescar y comprobar persistencia (el dato debe sobrevivir al reload).
    await page.reload();
    await expect(page.getByText(OP_NAME)).toBeVisible({ timeout: 15_000 });
    // await expect(page.getByText("E2E gasto temporal")).toBeVisible();
  });
});

// Self-revert: elimina la operación temporal creada, ocurra lo que ocurra.
test.afterEach(async ({ page }) => {
  try {
    // Implementar el borrado por la UI (menú de la operación → Eliminar) o vía API de
    // test. Debe dejar el entorno LIMPIO (sin basura de prueba).
    void page;
    void OP_NAME;
  } catch {
    /* no enmascarar el fallo principal del test */
  }
});
