# FINANCE MODULE AUDIT

**Fecha:** 2026-03-12
**Alcance:** Módulo de Finanzas — WEB (Next.js)
**Objetivo:** Documentar la arquitectura actual y preparar la conversión a módulo opcional (`financeModuleEnabled`)

---

## 1. Cómo funciona actualmente el módulo de Finanzas

### Visión general

El módulo de Finanzas permite al usuario llevar un registro de:
- **Cuentas bancarias** con saldo actualizado en tiempo real.
- **Previsiones de ingresos/gastos** por línea y mes, con valores PREV (estimado) y REAL (calculado).
- **Movimientos financieros** (cobros y pagos puntuales o recurrentes).

El módulo tiene dos puntos de acceso:
1. **`/finanzas`** — Página dedicada con el dashboard completo.
2. **`/agenda`** — Las tareas de tipo `INGRESO` o `GASTO` interactúan con el módulo al completarse.

### Flujo principal en `/finanzas`

1. Al montar la página, se cargan en paralelo los tres conjuntos de datos:
   - `bank_accounts` → `bankAccounts[]`
   - `income_forecast_lines` → `forecastLines[]`
   - `finance_movements` → `movements[]`
2. Si el `SyncContext` ya tiene datos cacheados, se usan directamente (cero queries extras en re-navegación).
3. El usuario puede navegar entre meses (`selectedMonthId`) para ver el estado de ese mes.
4. Para cada línea de previsión se calcula:
   - **PREV** (`getMonthExpected`): valor estimado almacenado en `months[monthId][type].expected`.
   - **REAL** (`computeMonthReal`): `base + Σ movimientos vinculados` (cuando `variable=true`), o solo `base` (cuando `variable=false`).
   - **DIF**: REAL − PREV.
5. Las ediciones inline (PREV, REAL, balance) se persisten inmediatamente en Supabase via las funciones de `financeApi.ts`.

### Flujo del toggle financiero en `/agenda`

Cuando el usuario marca como completada una tarea de tipo `INGRESO` o `GASTO`:

1. Se llama a `handleFinancialToggle(task, newIsCompleted)`.
2. Si la tarea es **PUNTUAL** y se completa:
   - Se crea un `FinanceMovement` con `upsertMovement()`.
   - Se aplica el delta al saldo de la cuenta vinculada via RPC atómica (`apply_account_balance_delta`).
   - Se guarda el `movementId` en `task.data.movementId`.
3. Si se **desmarca** una tarea PUNTUAL ya completada:
   - Se hace soft-delete del movimiento (`softDeleteMovement`).
   - Se revierte el delta de balance.
   - Se borra `task.data.movementId`.
4. Para tareas **SEMANAL/MENSUAL**: misma lógica pero usando `completedDates[]` y `movementIdsByDate{}` en `task.data.extra`.

### Valor REAL: cómo se edita manualmente

La fórmula de display es: `REAL_mostrado = base + Σ_movimientos_vinculados`

Cuando el usuario edita el valor REAL manualmente (en `/finanzas`), lo que se guarda es un `adjustedBase`:
```
adjustedBase = valorIntroducido − Σ_movimientos_vinculados
```
Así, cuando se recalcula: `adjustedBase + Σ_movimientos = valorIntroducido`. Esto evita el doble conteo que ocurriría si se guardara el valor directamente como `base`.

---

## 2. Arquitectura del sistema financiero

### Estructura de archivos

```
src/lib/finance/
  financeData.ts      — Tipos (BankAccountFull, ForecastLineFull, FinanceMovement),
                        helpers de fecha, formatters ES, computeMonthReal()
  financeApi.ts       — CRUD Supabase: fetchBankAccountsFull, upsertMovement,
                        applyAccountBalanceDelta (RPC), etc.
  normalize.ts        — Normalización para escritura en DB:
                        normalizeBankAccountForDbWeb, normalizeForecastSourceForDbWeb
  movementUtils.ts    — Parsers de frecuencia, buildConceptAndLabel,
                        applyMovementToAccounts, FinanceUIState (localStorage)

src/components/finance/
  MovementModal.tsx         — Crear/editar movimiento manual
  BankAccountModal.tsx      — Crear/editar cuenta bancaria
  ForecastEditorModal.tsx   — Editor de previsión anual completa
  SourceModal.tsx           — Crear/editar línea de previsión
  EditForecastAnualModal.tsx — Modal para edición masiva anual
  InlineEdit.tsx            — Edición inline de celdas numéricas

app/finanzas/page.tsx       — Página dashboard (92 KB, ~2.000 líneas)

src/sync/SyncContext.tsx     — Cache compartido: bankAccounts, financeMovements,
                              incomeForecastLines entre páginas
src/sync/types.ts            — ENTITY_CONFIGS para las 3 entidades financieras
```

### Tablas Supabase

| Tabla | Clave primaria | Estructura | Notas |
|---|---|---|---|
| `bank_accounts` | `id` (UUID) | `{ id, user_id, data JSONB, client_updated_at, deleted_at }` | `data.balance` es el saldo actual |
| `income_forecast_lines` | `id` (UUID) | `{ id, user_id, data JSONB, client_updated_at, deleted_at }` | `data.months` es un Record<YYYY-MM, ForecastMonthState> |
| `finance_movements` | `id` (UUID) | `{ id, user_id, data JSONB, client_updated_at, deleted_at }` | Soft-delete via `deleted_at` |

### RPC Supabase

- **`apply_account_balance_delta(p_account_id, p_user_id, p_delta)`**: Actualiza atómicamente `data.balance` en `bank_accounts`. Evita race conditions de read-modify-write. Devuelve el JSONB `data` actualizado.

### Tipos de dominio principales

```typescript
// src/lib/types.ts
type TaskType = "ACTIVIDAD" | "INGRESO" | "GASTO" | "MULTI" | "NOTA";

interface TaskData {
  accountId?: string | null;   // FK a bank_accounts
  forecastId?: string | null;  // FK a income_forecast_lines
  movementId?: string | null;  // FK a finance_movements (PUNTUAL)
  extra?: {
    amountEUR?: number;
    frequency?: "PUNTUAL" | "SEMANAL" | "MENSUAL";
    completedDates?: string[];           // Para SEMANAL/MENSUAL
    movementIdsByDate?: Record<string, string>; // Para SEMANAL/MENSUAL
  };
}

// src/lib/finance/financeData.ts
interface ForecastLineFull {
  id: string;
  name: string;
  type: "INGRESO" | "GASTO";
  parentId?: string | null;    // Jerarquía padre-hijo
  months?: Record<string, ForecastMonthState>;
  enabledTypes?: { INGRESO?: boolean; GASTO?: boolean };
  order?: number;
}

interface ForecastTypeState {
  base?: number;
  expected?: number;
  variable?: boolean;          // true = incluir movimientos en REAL
  cutoffISO?: string | null;   // Ignorar movimientos anteriores a esta fecha
}

interface FinanceMovement {
  id: string;
  date: string;                // YYYY-MM-DD
  amount: number;              // Siempre positivo
  type: "INGRESO" | "GASTO";
  accountId?: string | null;
  linkedPredictionId?: string | null;  // FK a income_forecast_lines
  frequency?: "PUNTUAL" | "SEMANAL" | "MENSUAL";
}
```

### SyncContext: datos compartidos entre páginas

El `SyncContext` mantiene en memoria los tres conjuntos de datos financieros y los comparte entre `/finanzas` y `/agenda` sin queries duplicadas:

```typescript
// Acciones disponibles en SyncContext
notifyBankAccountUpdated(acc)      // set dirty + push (modifica saldo)
notifyForecastLineUpdated(line)    // set dirty + push
notifyFinanceMovementUpdated(mv)   // silent notify (no marca dirty — el upsert ya lo hizo)
notifyFinanceMovementDeleted(id)   // elimina del caché local
notifyBankAccountUpdated(acc)      // actualiza saldo en caché
```

---

## 3. Dependencias con otros módulos

### Dependencias directas

| Módulo | Tipo | Descripción |
|---|---|---|
| **Agenda (`/agenda`)** | **Bidireccional fuerte** | Las tareas INGRESO/GASTO crean movimientos al completarse. Los movimientos y saldos se actualizan en tiempo real desde Agenda. |
| **SyncContext** | Proveedor compartido | Los tres arrays de datos financieros viven en SyncContext y son consumidos tanto por `/finanzas` como por `/agenda`. |
| **TaskEditorContent** | UI de edición | El editor de tareas muestra controles de `accountId` y `forecastId` cuando `type === "INGRESO" || "GASTO"`. |
| **TaskEditPanel** | Wrapper del editor | Recibe `bankAccounts` y `forecastLines` como props y los pasa a `TaskEditorContent`. |
| **SiteShell** | Navegación | El tab "Finanzas" en la barra lateral enlaza a `/finanzas`. |

### Dependencias indirectas

- **`src/lib/types.ts`**: Define `TaskType` incluyendo `INGRESO` y `GASTO`. El sistema de tipos entero las incluye.
- **`app/api/tasks/route.ts`**: La API de tareas guarda `accountId`, `forecastId`, `movementId` en el campo `data` JSONB de las tareas.
- **Colores de fondo de tareas** (`src/lib/types.ts` línea ~221): `INGRESO` y `GASTO` tienen colores de fondo diferenciados en la lista de Agenda.

---

## 4. Qué partes afectan a Agenda

### 4.1. Función `handleFinancialToggle` (crítica)

Ubicación: `app/agenda/page.tsx` líneas 385–507.

Esta función se llama en dos lugares dentro de `/agenda`:
- **Vista árbol (Metas)**: línea ~1007, cuando se completa una tarea en el TaskDiagramTree.
- **Vista lista (Agenda)**: línea ~1531, cuando se completa una tarea en la lista plana.

Si el módulo de Finanzas está deshabilitado, esta función debe devolver simplemente `{ isCompleted: newIsCompleted }` sin hacer ninguna operación financiera.

### 4.2. Props financieras en el editor de tareas

`TaskEditPanel` y `TaskEditorContent` reciben:
```typescript
bankAccounts: BankAccount[]
forecastLines: ForecastLine[] (via useSync)
```

Cuando `type === "INGRESO" || "GASTO"`, el editor muestra:
- Selector de cuenta bancaria (`accountId`)
- Selector de línea de previsión (`forecastId`)
- Campo de importe (`extra.amountEUR`)

Si el módulo está deshabilitado, estos controles deben ocultarse y los tipos `INGRESO`/`GASTO` deben eliminarse del selector de tipo de tarea.

### 4.3. Estado local en Agenda

`app/agenda/page.tsx` mantiene:
```typescript
const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
```
Este estado se carga desde SyncContext y se usa en `handleFinancialToggle`. Si el módulo está deshabilitado, no debe cargarse.

### 4.4. Imports financieros en Agenda

```typescript
import { upsertMovement, softDeleteMovement, applyAccountBalanceDelta } from "@/src/lib/finance/financeApi";
import type { FinanceMovement } from "@/src/lib/finance/financeData";
```
Estos imports deben eliminarse o ponerse bajo condición si el módulo se desactiva (aunque en TypeScript los imports de tipo no tienen coste en runtime).

---

## 5. Qué habría que ocultar para convertirlo en módulo opcional

### 5.1. Navegación (SiteShell)

- **Ocultar** el tab "Finanzas" en la barra lateral y menú móvil cuando `financeModuleEnabled === false`.
- Archivo: `components/SiteShell.tsx` líneas ~61–68 y ~117–124.

### 5.2. Página `/finanzas`

- **Redirigir** a `/agenda` o mostrar pantalla "módulo no disponible" cuando `financeModuleEnabled === false`.
- Archivo: `app/finanzas/page.tsx` (inicio del componente).

### 5.3. SyncContext — entidades financieras

- **No sincronizar** `bankAccounts`, `financeMovements`, `incomeForecastLines` cuando el módulo está deshabilitado.
- Tres entidades en `ENTITY_CONFIGS` de `src/sync/types.ts`: `bankAccounts`, `financeMovements`, `incomeForecastLines`.
- El SyncContext no debe exponer ni las callbacks `notifyBankAccountUpdated`, `notifyForecastLineUpdated`, `notifyFinanceMovementUpdated/Deleted` si el módulo está off.

### 5.4. Editor de tareas (TaskEditorContent + TaskEditPanel)

- **Ocultar** los controles de `accountId`, `forecastId`, `amountEUR` cuando el módulo está off.
- **Eliminar** `INGRESO` y `GASTO` del selector de tipo al **crear** nuevas tareas (no se pueden crear nuevas tareas financieras con el módulo off). El tipo existente en tareas ya guardadas no se toca.
- Archivos: `src/components/TaskEditorContent.tsx` (~líneas 212–668), `src/lib/types.ts`.

### 5.5. Colores de fondo de tareas (Agenda)

- Las constantes de color para `INGRESO`/`GASTO` en `src/lib/types.ts` (~líneas 221–222) pueden dejarse en código (no son visibles si los tipos no existen).

### 5.6. `handleFinancialToggle` en Agenda

- Si `financeModuleEnabled === false`, la función debe hacer early return: `return { isCompleted: newIsCompleted }`.
- La lógica de `upsertMovement`, `softDeleteMovement`, `applyAccountBalanceDelta` no debe ejecutarse.

### 5.7. Carga de bankAccounts en Agenda

- El bloque que carga y sincroniza `bankAccounts` desde SyncContext debe omitirse cuando el módulo está deshabilitado.

### 5.8. Props en TaskEditPanel y TaskDiagramTree

- `bankAccounts` y `forecastLines` se pasan como props desde `/agenda`. Si el módulo está off, pasar arrays vacíos (`[]`) es suficiente para que los controles queden ocultos (si se implementa la condición en el punto 5.4).

---

## 6. Estrategia recomendada para implementarlo

### Fase 1: Leer el flag desde Supabase (persistente por usuario)

Añadir `financeModuleEnabled: boolean` al perfil del usuario. La decisión final es que este flag sea **persistente por usuario en Supabase**, no hardcoded ni a nivel de build. Las opciones de almacenamiento son:
- Un campo en la tabla `profiles` (si ya existe para datos de usuario).
- O en una tabla `app_settings` / `user_settings` dedicada a preferencias de usuario.

La elección concreta depende de la arquitectura existente en el proyecto, pero en cualquier caso debe estar en Supabase y ser por usuario (no global).

Exponer el flag via `AuthContext`:
```typescript
// src/contexts/AuthContext.tsx
const { financeModuleEnabled } = useAuth();
```

### Fase 2: Ocultar navegación

En `SiteShell.tsx`, envolver los tabs de Finanzas:
```tsx
{financeModuleEnabled && (
  <Link href="/finanzas">Finanzas</Link>
)}
```

### Fase 3: Proteger la página `/finanzas`

Al inicio del componente de `app/finanzas/page.tsx`:
```typescript
if (!financeModuleEnabled) {
  redirect("/agenda");
}
```

### Fase 4: Condicionar la sincronización

En `SyncContext`, no incluir las entidades financieras en `ENTITY_CONFIGS` cuando el flag está off. La forma más limpia es filtrar dinámicamente:
```typescript
const activeConfigs = financeModuleEnabled
  ? ENTITY_CONFIGS
  : Object.fromEntries(
      Object.entries(ENTITY_CONFIGS).filter(([k]) =>
        !["bankAccounts", "financeMovements", "incomeForecastLines"].includes(k)
      )
    );
```

### Fase 5: Agenda — handleFinancialToggle y estado

```typescript
const handleFinancialToggle = useCallback(async (task, newIsCompleted, occurrenceISO) => {
  if (!financeModuleEnabled) return { isCompleted: newIsCompleted };
  // ... resto de la lógica actual
}, [..., financeModuleEnabled]);
```

```typescript
// Solo cargar bankAccounts si el módulo está activo
useEffect(() => {
  if (!financeModuleEnabled) return;
  // carga de bankAccounts desde SyncContext
}, [financeModuleEnabled, syncBankAccounts]);
```

### Fase 6: Editor de tareas

En `TaskEditorContent.tsx`, ocultar controles financieros:
```tsx
{financeModuleEnabled && isFinance && (
  // controles de accountId, forecastId, amountEUR
)}
```

En el selector de tipo de tarea, filtrar `INGRESO` y `GASTO`:
```typescript
const availableTypes = financeModuleEnabled
  ? TASK_TYPES
  : TASK_TYPES.filter(t => t !== "INGRESO" && t !== "GASTO");
```

### Orden sugerido de implementación

1. Crear el campo `financeModuleEnabled` en Supabase (`profiles` o `app_settings`) y leerlo en `AuthContext`.
2. Ocultar navegación (SiteShell) — cambio mínimo, seguro.
3. Proteger página `/finanzas` con redirect.
4. Condicionar SyncContext para no sincronizar entidades financieras.
5. Condicionar `handleFinancialToggle` en Agenda.
6. Ocultar controles en editor de tareas + filtrar tipos INGRESO/GASTO del selector de nuevo tipo.

---

## 7. Riesgos y edge cases

### 7.1. Tareas existentes con `type: "INGRESO"` o `"GASTO"`

**Decisión final: ocultar, no reinterpretar.**

Si el módulo se desactiva con tareas financieras ya existentes:
- Esas tareas permanecen en la base de datos con `type: "INGRESO"` o `"GASTO"`. **No se migran, no se convierten en ACTIVIDAD, no se borran.**
- En la vista de Agenda **no se exponen**: las tareas de tipo INGRESO/GASTO deben filtrarse de la lista cuando el módulo está off, de forma que el usuario no las vea ni pueda interactuar con ellas.
- Si el módulo se reactiva, las tareas vuelven a aparecer con todos sus datos intactos.
- **Al marcarlas como completadas** (si por alguna razón llegaran a ser visibles), `handleFinancialToggle` haría early return `{ isCompleted: true }` sin crear movimientos. Esto es correcto como salvaguarda.
- **No migrar tipos**: el tipo INGRESO/GASTO no debe reescribirse a ACTIVIDAD bajo ninguna circunstancia. Solo se oculta.

### 7.2. `movementId` huérfano en tareas

Si se desactiva el módulo sin limpiar los `movementId` guardados en tareas:
- La tarea tiene `movementId: "some-uuid"` pero el movimiento tiene `deleted_at`.
- Si el módulo se reactiva, podría intentar hacer soft-delete de un movimiento ya eliminado.
- **Mitigación actual**: El soft-delete en Supabase es idempotente (solo actualiza `deleted_at`). No hay error crítico.

### 7.3. RPC `apply_account_balance_delta` — cuenta inexistente

- Si la tarea tiene `accountId` pero la cuenta fue eliminada, la RPC devuelve `null` sin error.
- El saldo simplemente no se actualiza (fallo silencioso).
- Esto ya ocurre actualmente; no empeora con el flag.

### 7.4. Race condition en balance (ya mitigada)

- La RPC `apply_account_balance_delta` resuelve el race condition de concurrencia múltiple.
- Sin la RPC, dos dispositivos actualizando el saldo simultáneamente podrían sobreescribirse. Con la RPC, el delta se aplica atómicamente en el servidor.

### 7.5. Límite de 200 movimientos en `fetchMovements`

- `financeApi.ts` carga solo los últimos 200 movimientos ordenados por `client_updated_at`.
- Si hay más de 200 movimientos, los más antiguos no se incluyen en el cálculo de `computeMonthReal` para meses pasados.
- **Riesgo real**: Meses con muchos movimientos puntuales podrían mostrar REAL incorrecto.
- **Recomendación futura**: Paginar o filtrar por mes en la query de movimientos.

### 7.6. Backward compatibility en `FinanceMovement`

El fetch de movimientos maneja múltiples nombres de campo heredados:
- `amount` / `amountEUR` / `extra.amountEUR`
- `forecastId` / `linkedPredictionId` / `predictionId`
- `date` / `day` / `createdAt`
- `concept` / `title`
- `description` / `note`

Si se refactoriza el esquema, hay que mantener estas compatibilidades o hacer una migración de datos en Supabase.

### 7.7. `normalizeForecastSourceForDbWeb` elimina el campo `type`

En `normalize.ts`, la función `normalizeForecastSourceForDbWeb` **siempre borra** el campo `type` del objeto antes de guardarlo en la DB. El `type` de una línea de previsión (`INGRESO`/`GASTO`) se reconstruye en el fetch (línea ~203 de `financeApi.ts`): si no está en `data`, el default es `"INGRESO"`.

Esto significa que una línea de tipo `GASTO` cuyo `data.type` no esté explícitamente guardado será tratada como `INGRESO` al leer. Aunque en la práctica funciona porque el `type` sí se guarda (viene del campo de nivel superior que la normalización excluye), es un edge case frágil.

### 7.8. SyncContext: actualizaciones de balance no marcan dirty

`notifyBankAccountUpdated` tiene dos variantes en SyncContext: una que marca dirty (push) y otra que solo notifica (silent). Actualmente el código en `handleFinancialToggle` usa la versión que **sí** marca dirty para que el balance actualizado por RPC se propague al sync. Si por error se usara la versión silent, el balance en otros dispositivos no se actualizaría hasta la próxima pull.

### 7.9. Desactivar el módulo en mid-session

Si el flag se cambia en tiempo real (sin recargar la página):
- El SyncContext ya habría suscrito las entidades financieras y tendría datos en memoria.
- La función `handleFinancialToggle` evaluaría el flag en el momento del click (correcto si es reactivo).
- **Recomendación**: Requerir recarga de página al cambiar el flag para evitar estado inconsistente.

---

## Resumen ejecutivo

El módulo de Finanzas es **profundamente integrado** con Agenda a través de `handleFinancialToggle` y el `SyncContext`. Las tres tablas de Supabase (`bank_accounts`, `income_forecast_lines`, `finance_movements`) están sincronizadas continuamente en segundo plano.

Para convertirlo en módulo opcional:
- **6 puntos de cambio** bien localizados (SiteShell, finanzas/page, SyncContext, handleFinancialToggle, TaskEditorContent, tipos de tarea).
- **Ningún cambio de esquema** de base de datos es necesario.
- **Riesgo bajo** si se implementa con el orden sugerido (UI → sync → lógica → editor).
- El mayor riesgo operativo es el límite de 200 movimientos en el fetch, que es independiente del flag pero debería abordarse si el módulo se expande.
