# E2E

## `compare-scroll.spec.ts` — scroll de la comparación (VERIFICADO)

Cubre el fallo "al comparar dos operaciones solo se ve la primera; no se puede bajar a la
segunda". Comprueba en navegador real, a 6 viewports (desktop/laptop/tablet/móvil), que el
scroll VERTICAL llega al último campo de la ÚLTIMA operación (tabla lado a lado en ≥md;
tarjetas apiladas en <md), con un único propietario del scroll vertical y sin overlays.

Corre contra el **fixture aislado** `/dev-compare-harness` (solo dev/test, 404 en producción):
renderiza el `<CompareModal>` REAL con operaciones simuladas y SIN auth/Supabase, así que no
toca datos de producción. Ejecución bajo demanda (Playwright no es dependencia por defecto):

```bash
npm i -D @playwright/test && npx playwright install chromium
npx next dev --webpack -p 3311          # en otra terminal
DIAG_BASE=http://localhost:3311 npx playwright test e2e/compare-scroll.spec.ts
```

Verificado en verde el 2026-07-22 (2 ops en los 6 viewports + 3 ops en móvil).

---

# E2E — flujo crítico (PREPARADO, no ejecutado)

`critical-flow.spec.ts` cubre el flujo que este bloque de hardening protege:

> login → crear operación → añadir gasto → **refrescar** → el dato **persiste**.

## Por qué NO se ejecutó en la sesión de hardening

Bloqueo real y documentado (sin éxito falso):

1. **Solo existe Supabase de PRODUCCIÓN.** No hay entorno de test. Ejecutar el flujo
   escribiría operaciones y gastos reales en la base de datos de producción.
2. **Sin credenciales de prueba.** El login exige una cuenta real (email/contraseña o
   Google OAuth).
3. **Sin dependencia instalada.** `@playwright/test` no está en el proyecto y no se
   añadió: sería una dependencia nueva no justificada para un test que no puede correr
   de forma segura ahora.

La cobertura de la lógica de persistencia/merge queda garantizada por los **23 tests
unitarios** de `src/sync/merge.test.ts` (incluidos los 14 de merge por colección) más
`tsc`/`build` verdes. Este E2E complementa esa cobertura a nivel de UI cuando exista un
entorno seguro.

## Cómo ejecutarlo de forma segura (cuando haya entorno de test)

```bash
npm i -D @playwright/test
npx playwright install chromium

# Apunta a un proyecto Supabase de TEST (nunca producción):
export E2E_SUPABASE_URL="https://<tu-proyecto-de-test>.supabase.co"
export E2E_BASE_URL="http://localhost:3000"
export E2E_EMAIL="cuenta-de-test@ejemplo.com"
export E2E_PASSWORD="********"

npx playwright test e2e/critical-flow.spec.ts
```

## Salvaguardas del test

- **Guard anti-producción**: `beforeAll` aborta si `E2E_SUPABASE_URL` coincide con la
  URL de producción auditada.
- **Self-revert**: `afterEach` borra la operación temporal creada (deja el entorno limpio).

## Pendiente antes del primer uso

Los selectores del **login están confirmados** (`#email`, `#password`, botón «Entrar»,
redirección a `/finanzas`). Los pasos del **asistente de creación** (multipaso) y el
**borrado self-revert** están marcados con `// ...` y deben completarse/confirmarse
contra la app en marcha. No se dejan como aserciones activas para no fingir un flujo
que no se ha podido verificar.

> Excluido de `tsc`, `eslint` y del build de la app (ver `tsconfig.json` y
> `eslint.config.mjs`): no afecta a la compilación de producción.
