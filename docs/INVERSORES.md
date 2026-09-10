# Módulo de INVERSORES — documento maestro

> **Este es el documento oficial de referencia del módulo de inversores de Invergravital.**
> Cualquier sesión futura debe leer ESTE fichero antes de tocar nada relacionado con
> inversores, oportunidades, contactos, invitaciones o compartición.
>
> Documentos **obsoletos** que NO deben usarse como referencia para inversores:
> - `APP/docs/INGRAVITAL_ARCHITECTURE.md` — describe el producto anterior (tareas/metas/agenda). No menciona inversores.
> - `docs/real-estate-module.md` (raíz, sin control de versiones) — anterior al módulo de inversores.
> - Comentarios de cabecera en `src/lib/investors.ts`, `src/lib/opportunities.ts` y
>   `APP/components/operaciones/tracking/SharePanel.tsx` — describen un estado anterior
>   a que existiera el backend real. Ver §9.

**Última actualización:** 2026-09-10
**Estado:** las **dos** migraciones (`20260910_investor_platform.sql` y
`20260910b_investor_platform_owner_guard.sql`) están **APLICADAS en producción**. El flujo
completo —promotor → oportunidad → invitación → identificación → visualización → interés →
inversión real → seguimiento → histórico— está **verificado contra el proyecto real** (§7),
igual que el aislamiento entre cuentas (§7.1c).

> ⚠️ **Las TRES migraciones van juntas, y en orden.** `20260910b` cierra un IDOR y redefine cinco funciones de
> la primera; `20260910c` endurece y redefine otras dos. Aplicar la primera sin la segunda
> deja el agujero abierto. **Reaplicar una migración obliga a volver a aplicar las
> posteriores**, porque cada una sobreescribe funciones de la anterior.

---

## 0. Cómo verificar el estado real (no te fíes de este documento sin comprobar)

```bash
# Qué tablas existen DE VERDAD en producción (no en las migraciones locales).
# 401/42501 = la tabla existe y anon no tiene acceso (correcto).
# 404/PGRST205 = la tabla NO existe.
cd WEB
URL=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
KEY=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" "$URL/rest/v1/<tabla>?select=id&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Una tabla presente en `supabase/migrations/` **no implica** que exista en producción.
Las migraciones de este proyecto se aplican **a mano** (ver §10).

---

## 1. ESTADO REAL VERIFICADO (2026-09-10)

### 1.1 Producción — proyecto Supabase `zrstaskwqwuxgelcrwxx`

Tablas que **existen realmente** (verificado por sonda REST):

| Tabla | Acceso `anon` | Notas |
|---|---|---|
| `profiles` | SELECT concedido, **RLS lo filtra** (devuelve `[]`) | Grant redundante: conviene revocarlo. INSERT anónimo → 401 |
| `app_settings` | sin acceso (401) | |
| `operaciones_inmobiliarias` | sin acceso (401) | Operación completa en columna JSON `data`. Compartida WEB↔APP |
| `balance_items` | sin acceso (401) | Módulo Balance, compartido WEB↔APP |
| `investment_shares` | sin acceso (401) | **Existe en producción.** Base de la compartición real |

Tablas que **NO existen** en este proyecto: `profile_settings`, `contacts`, `investors`,
`investments`, `opportunities`, `invitations`, `user_roles`, `memberships`, `organizations`,
y también `metas`, `tasks`, `bank_accounts`, `finance_movements`, `income_forecast_lines`,
`ai_meta_drafts` (estas últimas son entidades heredadas del producto anterior que la APP
todavía referencia en su motor de sync — ver §9.3).

### 1.2 Lo que funciona de verdad hoy (WEB)

- **`investment_shares`** + RLS por `owner_id` y por inversor (`investor_user_id` o
  `lower(investor_email) = lower(auth.jwt()->>'email')`), con filtro de `status='active'` y `expires_at`.
- **Storage privado**: buckets `investment-media` e `investment-documents`, rutas
  `ownerId/operationId/media/…` y `ownerId/operationId/expenses/expenseId/…`, servidos con URL firmada.
  *(La existencia de los buckets en producción no es verificable con la clave pública: NO CONFIRMADO.)*
- **`src/lib/shares.ts`** — CRUD real + `buildInvestorSnapshot()`, que publica un snapshot
  **ya filtrado y con KPIs computados**. El inversor nunca recibe el JSON de la operación.
- **`src/lib/storage.ts`** — subida, URL firmada y borrado reales.
- **`/inversor`** — vista del inversor autenticado, solo lectura.
- **`SharePanel`** — crear / listar / revocar / reactivar / eliminar / republicar accesos.
- **`realEstateTrackingCalc.ts`** — cálculos puros; devuelve `null` cuando no hay datos (nunca 0 inventado).

### 1.3 Defectos confirmados en lo existente

| # | Defecto | Evidencia |
|---|---|---|
| D1 | `/inversor` **no está enlazado desde ninguna parte** de la UI | grep en `app/`, `components/`, `src/` |
| D2 | Toggle `resumen` **inerte**: `buildInvestorSnapshot` nunca lo lee; nombre y dirección se envían siempre | `shares.ts` |
| D3 | En la APP, además, el toggle `media` es inerte: su `InvestorView` no renderiza media | `APP/…/InvestorView.tsx` |
| D4 | `token` se genera, se guarda y tiene índice único, pero **nunca se lee**. No hay ruta que lo acepte | `shares.ts:196` |
| D5 | `permissions` (jsonb) nunca se escribe ni se lee | `shares.ts:153` |
| D6 | `expires_at` soportado por BD y por `createShare`, pero **`SharePanel` nunca lo pasa** → caducidad inalcanzable | `SharePanel.tsx` |
| D7 | Se puede crear un acceso **sin email** → fila huérfana que nadie podrá leer jamás | `SharePanel.tsx` + RLS |
| D8 | Restringir visibilidad **no surte efecto** hasta pulsar "Republicar"; las policies de Storage leen `investment_shares.visibility`, así que el inversor conserva acceso a los archivos | `SharePanel.tsx`, `20260702_investment_storage.sql` |
| D9 | `share.recipients` es un **sistema paralelo**: la APP lo escribe, la WEB lo ignora. Un promotor que añade destinatarios en la APP cree haber compartido y no ha compartido nada | `APP/…/SharePanel.tsx`, `merge.ts` |
| D10 | Modelo de media **divergente**: la WEB añade `storagePath`/`bucket`/`mime`/`size` y deja `uri` vacío; la APP solo tiene `uri` → media subida en WEB se ve rota en la APP | `WEB/…/realEstateTracking.ts` vs `APP/models/realEstateTracking.ts` |
| D11 | `buildInvestorSnapshot` mete `{url: m.uri}` **sin comprobar que sea http** (los gastos sí lo comprueban). Fragilidad latente | `shares.ts` |
| D12 | **No existe rol de inversor.** Un inversor autenticado ve el shell completo de promotor | `AppGate.tsx` |
| D13 | **No hay envío de invitación**: cero infraestructura de email/OTP. El inversor debe registrarse solo y recibir la URL por fuera | grep sin resultados |
| D14 | `/inversores` y `/oportunidades` son **maquetas** con datos inventados, en WEB y APP | `PREVIEW_*` |
| D15 | **Cero tests** sobre `buildInvestorSnapshot`, `shares.ts` y `storage.ts` — justo la frontera de privacidad | `find *.test.ts` |
| D16 | La APP **no tiene Supabase Storage ni pickers**: media y facturas solo por URL escrita a mano | grep: 1 coincidencia, y es un comentario |
| D17 | Comentarios `// PREMIUM GATE` en la APP sobre código sin ningún gate | `APP/app/Profile/SettingsScreen.tsx` |
| D18 | `investorDefaults.currency` / `numberFormat` se guardan y no se ha localizado consumidor | NO CONFIRMADO |

---

## 2. DECISIONES ARQUITECTÓNICAS

| ID | Decisión | Razón |
|---|---|---|
| A1 | **Una cuenta, varios roles.** Tabla `user_roles(user_id, role)` con `role ∈ {promotor, inversor}` | Una persona puede ser promotor en sus operaciones e inversor en las de terceros sin duplicar cuenta. Un `text[]` en `profiles` no permite indexar ni escribir policies limpias |
| A2 | **`has_role()` como `SECURITY DEFINER`** | Evita recursión de RLS al consultar roles dentro de una policy |
| A3 | **Contacto ≠ Usuario ≠ Invitación ≠ Inversión.** Cuatro entidades separadas | Un contacto del CRM puede no tener cuenta jamás; recibir una oportunidad no es haber invertido (§ requisito 25) |
| A4 | **El vínculo contacto↔usuario es un UUID estable** (`investor_contacts.linked_user_id`) | No depender permanentemente de comparar strings de email |
| A5 | **La invitación sustituye a `investment_shares`**, que se conserva y se migra | `investment_shares` ya tiene datos en producción; no se destruye nada |
| A6 | **El snapshot se recalcula en el servidor al cambiar la visibilidad**, no al pulsar un botón | Elimina D8. La privacidad no puede depender de recordar republicar |
| A7 | **Auth del inversor: magic link (email) y OTP de teléfono**, ambos de Supabase | Nada casero, sin tokens permanentes. El token de invitación identifica la *oportunidad*, nunca autentica |
| A8 | **Modelo de media canónico único** compartido WEB/APP: `{ bucket, path }` para archivo subido, `{ url }` solo para enlace http | Elimina D10 y D11 |
| A9 | **No se construye plataforma financiera regulada**: sin custodia, wallet, pagos ni contratación automática | Fuera de alcance declarado (§ requisito 46) |

---

## 3. MODELO DE ENTIDADES OBJETIVO

```
auth.users ──1:1── profiles
     │
     └──1:N── user_roles            (promotor | inversor)
     │
     ├──1:N── operaciones_inmobiliarias      [YA EXISTE]  análisis interno del promotor
     │              │
     │              └──1:1── investment_opportunities     la oferta estructurada
     │                              │
     │                              ├──1:N── opportunity_invitations  ── contacto + canal + token + trazabilidad
     │                              │
     │                              └──1:N── investments              capital real aportado
     │
     └──1:N── investor_contacts     (CRM del promotor)
                     │
                     └── linked_user_id ──> auth.users   (cuando el contacto se registra)
```

**Regla de oro:** una operación NO es una oportunidad. Una oportunidad NO es una inversión.
Recibir una invitación NO otorga participación económica.

---

## 4. ROLES Y ÁREAS

| Rol | Área | Rutas |
|---|---|---|
| `promotor` | Área Promotor | `/panel`, `/finanzas`, `/balance`, `/informes`, `/oportunidades`, `/inversores` |
| `inversor` | Área Inversor | `/i` (oportunidades recibidas, mis inversiones, histórico, perfil) |
| ambos | Selector de área | Conmutador explícito; **nunca** se mezclan las dos interfaces |

El registro directo permite elegir perfil. El registro **desde invitación** salta el onboarding
de promotor y crea directamente el perfil de inversor (§ requisito 5).

---

## 5. ESTADOS

**Oportunidad:** `borrador` → `publicada` → `en_captacion` → `cubierta` → `cerrada` → `liquidada`
**Invitación:** `pendiente` → `enviada` → `vista` → `interesado` | `descartada` | `revocada`
`caducada` se **calcula** a partir de `expires_at` en cada lectura; nunca se persiste
en la columna `status`. Así no hace falta ningún proceso que vaya marcando caducidades.
**Inversión:** `comprometida` → `desembolsada` → `activa` → `liquidada`

Ver la máquina de estados exacta en el código: `src/lib/investorPlatform/states.ts`.

---

## 6. SEGURIDAD

- RLS en **todas** las tablas nuevas. El control nunca es solo de frontend.
- El inversor accede a la oportunidad **solo** a través de `opportunity_invitations` /
  `investments` que le pertenecen; nunca a `operaciones_inmobiliarias`.
- Storage privado + URL firmada temporal. Sin buckets públicos, sin URL permanentes.
- El token de invitación **no autentica**: identifica la oportunidad. Tras abrirlo hay que
  identificarse por magic link u OTP.
- Un inversor A nunca ve datos del inversor B. Un promotor A nunca gestiona contactos del promotor B.

---

## 7. ESTADO DE IMPLEMENTACIÓN

**Refleja lo comprobado, no lo intencionado.** Actualizado el 2026-09-10.

### 7.1 Base de datos

| Bloque | Código | Aplicado en producción | Comprobado por |
|---|---|---|---|
| Esquema, RLS, RPC, Storage, backfill | ✅ `20260910_investor_platform.sql` | ✅ **SÍ** | `verify-investor-schema.mjs` → 10 tablas + 11 funciones, todo presente y protegido |
| Cierre del IDOR en tres capas | ✅ `20260910b_investor_platform_owner_guard.sql` | ✅ **SÍ** | `adversarial-idor-probe.mjs` → 16 ataques, los 16 bloqueados |

Comprobado además que `anon` recibe 401 en las 6 tablas nuevas y que la firma insegura
`has_role(uuid, text)` **ya no existe** (PostgREST responde `PGRST202`).

### 7.1b Recorrido completo verificado contra producción

`node scripts/e2e-investor-flow.mjs --yes-production` — **63 comprobaciones, todas correctas**. Cada paso usa el JWT del usuario que corresponde, así que lo que se
verifica es la RLS real del servidor:

- operación → oportunidad → contacto → invitación → reclamar → snapshot → vista → interés
  → inversión real → «Mis inversiones» → captación → revocación → caducidad.
- Normalización de email y teléfono hecha por la base de datos.
- Aislamiento entre promotores y entre inversores.
- El snapshot no contiene `internal_notes` ni la rentabilidad del promotor.
- El inversor obtiene **0 filas** de `investment_opportunities`, `operaciones_inmobiliarias`,
  `investor_contacts` e `investments`; sus datos llegan solo por RPC.
- Storage: el propietario firma su archivo; el inversor solo con la visibilidad activada,
  y la pierde **en el mismo instante** en que se desactiva.
- Escalada de privilegios bloqueada (roles ajenos y modificación de la oportunidad).
- **Seguimiento, liquidación e histórico**: el inversor sigue el proyecto que financia; al
  liquidar, la rentabilidad FINAL no pisa a la PACTADA y se conservan importe devuelto y
  fecha.

### 7.1c Sonda adversarial contra producción

`node scripts/adversarial-idor-probe.mjs --yes-production` — **16 ataques, los 16 bloqueados**:
insert y update cruzados de invitación e inversión, upsert `merge-duplicates` para esquivar
la policy, apropiarse de la oportunidad ajena, leer el snapshot de una invitación de otro,
reclamar el token ajeno, escribir y firmar en el Storage de la víctima, lectura directa de
las cinco tablas del módulo, y conceder o borrar roles de terceros.

**Limitación del E2E:** usa sesiones anónimas, que no llevan email ni teléfono en el JWT,
así que ahí solo se comprueba la rama NEGATIVA de `claim_invitation` (identidad que no
coincide ⇒ denegado). La rama positiva por email y por teléfono está cubierta en
`supabase/tests/investorPlatform.test.mjs` contra Postgres real.

### 7.2 WEB — implementado y verificado (typecheck + lint + build + tests)

| Funcionalidad | Dónde |
|---|---|
| Roles promotor / inversor / ambos, con conmutador de área | `src/contexts/RoleContext.tsx`, `components/AppGate.tsx`, `app/i/layout.tsx` |
| Registro eligiendo perfil | `app/signup/page.tsx` |
| Entrada por invitación sin onboarding de promotor | `app/invitacion/[token]/page.tsx` |
| Identificación sin contraseña (magic link / OTP) | `src/components/auth/IdentifyForm.tsx` |
| CRM real de contactos | `app/inversores/page.tsx`, `src/components/investors/*` |
| Configurador de oferta + notas internas separadas | `src/components/opportunity/OfferForm.tsx` |
| Visibilidad granular, efecto inmediato | `src/components/opportunity/VisibilityPanel.tsx` |
| Destinatarios, WhatsApp / email / enlace, trazabilidad | `src/components/opportunity/InvitationsPanel.tsx` |
| Inversiones reales, captación y liquidación | `src/components/opportunity/InvestmentsPanel.tsx` |
| Presentación automática de la oportunidad | `src/components/investor/OpportunityPresentation.tsx` |
| Área Inversor: oportunidades, inversiones, histórico, perfil | `app/i/**` |
| Oportunidades del promotor con captación real | `app/oportunidades/page.tsx` |

Verificado con navegador real a 390 px: `/invitacion/[token]` y `/signup` sin
desbordamiento horizontal, sin errores de consola y con todos los campos etiquetados.

### 7.3 Eliminado

`src/lib/shares.ts`, `SharePanel.tsx`, `InvestorView.tsx`, `InvestorSnapshotView.tsx`,
`src/lib/investors.ts`, `src/lib/opportunities.ts`, las maquetas de `/inversores` y
`/oportunidades`, y el botón «Compartir» de `/informes` que solo mostraba un aviso.
`/inversor` queda como redirección permanente a `/i`.

### 7.4 NO implementado (y por qué)

| Pendiente | Motivo |
|---|---|
| Aplicar las migraciones en producción | Bloqueo externo, §8 |
| E2E del flujo completo | Depende de que la BD esté aplicada |
| Notificaciones (nueva oportunidad, actualización) | El modelo lo admite (`investment_activity`); no se ha construido |
| Subida de documentos POR el inversor | El modelo lo admite; la UI es solo lectura |
| Crear invitaciones desde la APP | React Native no expone `crypto.getRandomValues` sin módulo nativo; `Math.random()` no vale para un token que viaja en una URL pública |
| Registrar inversiones desde la APP | Fuera del alcance de esta ejecución |

### 7.5 APP

Unificada con la WEB (commit `e64f84d`, rama `feat/plataforma-inversores`):
sistema paralelo `share.recipients` eliminado, modelo de media unificado, `/inversores`
y `/oportunidades` con datos reales, y un panel que lee las invitaciones reales y
permite reenviar y revocar. Crear invitaciones sigue siendo cosa de la WEB, y se dice
en la interfaz. `npx tsc --noEmit` limpio; lint limpio en los ficheros tocados.

**NO CONFIRMADO:** que la APP apunte al mismo proyecto Supabase que la WEB. Su fichero
`.env` está protegido por una regla de denegación del entorno y no se pudo leer. Es
imprescindible confirmarlo antes de dar por buena la paridad.

### 7.6 Fallos corregidos en la revisión de segunda pasada

Una auditoría adversarial independiente sobre el propio commit encontró tres fallos
reales. Los tres se reprodujeron sobre Postgres antes de tocar nada, y cada uno tiene
ahora una prueba de regresión:

| Gravedad | Fallo | Corrección |
|---|---|---|
| **CRÍTICO** | La policy `contacts: linked self read` daba al inversor su fila entera de `investor_contacts`, incluida `notes` — el CRM privado del promotor sobre él ("moroso", "no financiar"). La RLS filtra FILAS, no COLUMNAS; que el frontend pidiera solo unas columnas no protegía nada frente a un `select *` por REST. Lo mismo con `investments.notes` | Se eliminan ambas policies de lectura del inversor. Sus datos van por `get_my_investor_profile()` y `list_my_investments()`, que devuelven solo lo que le corresponde. Revocar la columna no servía: los privilegios de columna son por rol, y promotor e inversor son ambos `authenticated` |
| **ALTO** | El backfill insertaba las filas heredadas sin email violando el check `addressable`, y sin manejo de excepción: **una sola fila así abortaba la migración entera** y dejaba la base de datos sin ninguna tabla. Y esas filas existen (defecto D7) | Se excluyen del backfill los accesos sin destinatario (nunca fueron legibles por nadie) y el `insert` se envuelve en `exception ... continue`. Además `email = norm_email(...)` pasa a `is not distinct from`, que sí casa con NULL |
| **MEDIO** | `has_role(p_user, p_role)` era `SECURITY DEFINER` y ejecutable por cualquier autenticado: permitía enumerar el rol de cualquier cuenta ajena | Pasa a `has_role(p_role)` y resuelve el usuario con `auth.uid()`. No hay caso legítimo que pregunte por el rol de otro |

---

## 8. BLOQUEOS EXTERNOS CONOCIDOS

| Bloqueo | Estado |
|---|---|
| Aplicar migraciones a producción | **RESUELTO.** Aplicada a mano en el SQL Editor y verificada con `verify-investor-schema.mjs` |
| Buckets de Storage | **RESUELTO.** El E2E sube un archivo real a `investment-media` y lo firma: el bucket existe y sus policies funcionan |
| ¿APP y WEB en el mismo proyecto? | **RESUELTO.** Ambos apuntan a `zrstaskwqwuxgelcrwxx` con clave publicable `sb_pub…` |

### Limitaciones que siguen vigentes

| Limitación | Detalle |
|---|---|
| `SUPABASE_SECRET_KEY` no es recuperable | Está marcada como **sensible** en Vercel: solo se puede sobrescribir, no leer. Por eso el E2E usa sesiones anónimas y **no puede borrar los usuarios de prueba que crea** (sí borra todas sus filas) |
| Supabase rechaza dominios de prueba | `.invalid` y `example.com` son rechazados por el validador de email, así que no se pueden crear usuarios con email para el E2E |
| OTP por SMS | Depende de que haya un proveedor configurado en el proyecto. Si no lo hay, el formulario muestra el error real en vez de fingir el envío. El magic link por email no necesita nada más |

---

## 9. DEUDA Y ELEMENTOS OBSOLETOS — decisión por cada uno

| Elemento | Decisión |
|---|---|
| `share.recipients` | **Eliminar** como mecanismo de compartición. Migrar a `investor_contacts` + `opportunity_invitations` |
| `investment_shares.token` | **Usar**: pasa a ser el identificador de la invitación en el enlace |
| `investment_shares.permissions` | **Eliminar** del modelo de código (columna se conserva en BD, sin uso) |
| `investment_shares.expires_at` | **Usar**: expuesto en la UI |
| `investment_shares.investor_user_id` | **Usar**: se rellena al vincular contacto↔usuario (A4) |
| `investorDefaults` (APP, AsyncStorage) | **Conservar** como preferencias locales de UI del promotor. No es fuente de verdad |
| Toggle `resumen` | **Corregir**: debe filtrar de verdad nombre/dirección, o eliminarse |
| `src/lib/investors.ts` (tipos maqueta) | **Sustituir** por los tipos reales del CRM |
| `src/lib/opportunities.ts` (tipos maqueta) | **Sustituir** por los tipos reales de oportunidad |

### 9.3 Nota sobre entidades heredadas de la APP

La APP procede de un producto anterior (tareas/metas/agenda). Su motor de sync todavía
referencia `metas`, `tasks`, `bank_accounts`, `finance_movements`, `income_forecast_lines`
y `ai_meta_drafts`, **que no existen en el proyecto Supabase de Invergravital**. Esto es
independiente del módulo de inversores, pero conviene resolverlo: o esas entidades se
retiran de la APP, o se documenta que su sync no opera. **NO CONFIRMADO** si la APP apunta
al mismo proyecto Supabase que la WEB (el fichero `.env` de la APP está protegido por una
regla de denegación en el entorno de trabajo y no se pudo leer).

---

## 9.4 Qué le pasa a la visibilidad en el backfill

Las claves de visibilidad del sistema antiguo y del nuevo **coinciden casi todas**
(`progreso`, `media`, `hitos`, `gastos`, `gastosImportes`, `facturas`, `ventas`,
`ventasPrecios`, `costesTotales`, `ingresos`, `pendientePago`, `rentabilidad*`), así
que el backfill las conserva tal cual. Las diferencias:

| Clave | Situación tras el backfill |
|---|---|
| `resumen`, `tiempos` | Solo existían en el sistema antiguo. Se copian y quedan **ignoradas** (nadie las lee). `resumen` era además un toggle inerte, ver D2 |
| `estrategia`, `riesgos`, `estadoCaptacion` | Solo existen en el nuevo. No están en el dato migrado → se leen como **false** |

El comportamiento es **fail-closed**: lo que no se sabe, no se enseña. Un acceso
migrado nunca muestra más de lo que mostraba antes.

---

## 9.5 Segunda revisión adversarial — hallazgos y decisiones

Una segunda auditoría independiente, ya con la plataforma desplegada, encontró un
fallo **crítico y explotable en producción**. Se reprodujo contra el proyecto real
antes de corregirlo.

| Gravedad | Hallazgo | Decisión |
|---|---|---|
| **CRÍTICO** | **IDOR entre oportunidades.** Las policies solo comprobaban `auth.uid() = owner_id` — que la fila *dijera* ser tuya — y no que la `opportunity_id` a la que apunta lo fuera. Cualquier usuario autenticado podía colgar una invitación propia, con toda la visibilidad activada, de la oportunidad de otro promotor y leerla con `get_investor_snapshot` (que es `SECURITY DEFINER` y no pasa por la RLS). **Medido en producción: se filtraban título, `costesTotales` y `rentabilidadPromotor` de una oportunidad con la visibilidad completamente vacía.** Servía también para que un inversor legítimo se auto‑concediera más visibilidad de la autorizada | **CORREGIDO** en `20260910b_investor_platform_owner_guard.sql`: `owner_id` se deriva en el servidor desde `investment_opportunities` mediante trigger (INSERT y UPDATE), y la policy exige además la propiedad de la oportunidad. 3 pruebas de regresión |
| ALTO | `claim_invitation` compara `auth.jwt() ->> 'email'` sin mirar si esa identidad está verificada | **CORREGIDO**: si el JWT dice explícitamente que no está verificada, se rechaza. Ausente ⇒ no se bloquea, para no romper accesos en curso. La protección principal sigue siendo que el proyecto exige confirmación al registrarse |
| MEDIO | `AppGate` concedía el rol `promotor` a un inversor puro que llegara por error a una ruta de promotor | **CORREGIDO**: solo se autoconcede a cuentas **sin ningún rol** (las anteriores al sistema de roles) |
| MEDIO | La comprobación de limpieza del E2E miraba 3 de las 7 tablas que borra | **CORREGIDO**: se comprueban las siete |
| MEDIO | `interest_note` lo escribe el inversor por RPC y lo lee el promotor sobre la misma fila; hoy ningún código escribe ahí desde el lado del promotor | **ACEPTADO y documentado.** Es campo **de escritura exclusiva del inversor**. No pongas ahí notas del promotor: la RLS filtra filas, no columnas, y el inversor lee esa fila |
| BAJO | `has_role(text)` no la usa ninguna policy | **ACEPTADO**: se conserva para uso futuro. **No forma parte de la superficie de seguridad activa** |

### Sin hallazgos (verificado explícitamente)

Path traversal en Storage; oráculos por mensaje de error o por tiempo en las funciones
`SECURITY DEFINER`; transferencia de una invitación ya reclamada; concordancia SQL↔TS.

---

## 9.6 Tercera revisión — el IDOR y la remediación que lo empeoraba

| Gravedad | Hallazgo | Decisión |
|---|---|---|
| **CRÍTICO** | **IDOR entre oportunidades.** Las policies solo compraban `auth.uid() = owner_id` — que la fila *dijera* ser tuya — y no que la `opportunity_id` lo fuera. Cualquier usuario autenticado podía colgar una invitación propia, con toda la visibilidad activada, de la oportunidad de otro promotor y leerla con `get_investor_snapshot` (SECURITY DEFINER, no pasa por la RLS). Medido en producción con la visibilidad vacía: se filtraban título, `costesTotales` y `rentabilidadPromotor` | **CORREGIDO** en tres capas: trigger que deriva `owner_id` (INSERT y UPDATE), policy que exige propiedad de la oportunidad, y comprobación de coherencia en **todos** los caminos SECURITY DEFINER vía `invitation_is_coherent()` |
| **CRÍTICO** | La primera versión del propio guard **reasignaba** `owner_id` de las filas incoherentes al promotor legítimo. Eso convertía la invitación forjada en una invitación **válida** de la víctima que seguía apuntando al atacante en `investor_user_id`: le consolidaba el acceso | **CORREGIDO**: ahora se **neutralizan** (revocadas, desvinculadas, sin visibilidad), conservando la fila como evidencia |
| MEDIO | `user_roles` no tenía policy de DELETE: un rol era irrevocable | **CORREGIDO**: cada usuario puede renunciar a los suyos |

### Barrera contra la reintroducción

`supabase/tests/investorPlatform.test.mjs` incluye el test **GUARDIA**, que falla si la
migración vuelve a *reasignar* `owner_id` en vez de neutralizar, o si desaparece
cualquiera de las tres capas de defensa. Cualquier `revert` a la versión insegura rompe
`npm test`.

---

## 9.7 Usuarios anónimos de prueba — cómo purgarlos

`e2e-investor-flow.mjs` y `adversarial-idor-probe.mjs` crean **sesiones anónimas reales**
porque `SUPABASE_SECRET_KEY` está marcada como sensible en Vercel y no se puede recuperar
(no hay API de administración disponible, ni para crear usuarios con email ni para
borrarlos). Sus **filas de datos sí las borran ellos** al terminar — lo verifican y lo
imprimen —; lo único que queda son registros vacíos en `auth.users`.

Para limpiarlos, ejecuta en el SQL Editor:

```
WEB/scripts/purge-anonymous-test-users.sql
```

Va en tres pasos: inventario (debe salir `datos_asociados = 0` en todas las filas),
borrado — cuyo `where` repite la condición de seguridad, así que **nunca** borra un
usuario que tenga datos colgando — y comprobación final. Verificado sobre Postgres real:
borra los anónimos vacíos y respeta tanto a un anónimo con datos como a un usuario real.

---

## 9.8 Cuarta revisión — endurecimiento

**0 críticos, 0 altos.** Los cinco fallos de las revisiones anteriores siguen cerrados.
Cuatro hallazgos MEDIO, ninguno explotable con las capas ya aplicadas, todos corregidos
en `20260910c_investor_platform_hardening.sql` (los tres primeros) y en el código (el cuarto):

| Hallazgo | Comprobado en producción | Corrección |
|---|---|---|
| `investment_opportunities.operation_id` no validaba que la operación fuera de quien publica | Sí: HTTP 201 apuntando a la operación de otro | Trigger `tg_enforce_operation_owner`. Rechaza si la operación existe y es de otro; **permite** si aún no está sincronizada, porque exigirla rompería «Preparar para inversores» en una operación recién creada y sin fila no hay tercero al que perjudicar |
| `investment_activity` aceptaba referencias a entidades ajenas | Sí: HTTP 201 | Trigger `tg_enforce_activity_owner`, que además deriva `owner_id` |
| `register_invitation_view` y `set_invitation_interest` eran las dos únicas funciones `SECURITY DEFINER` sin comprobación de coherencia — el guard afirmaba «TODOS los caminos» | No explotable (una invitación incoherente ya no se puede crear) | Ambas comprueban `invitation_is_coherent()`. Ahora la afirmación es cierta |
| `AppGate` reconcedía `promotor` a quien acababa de renunciar a su rol | — | La autoconcesión se acota a cuentas **anteriores** al sistema de roles (`ROLES_LIVE_AT`) |

Detalle técnico: las dos RPC escriben la traza a nombre del **promotor** mientras las
ejecuta el **inversor**. El trigger de actividad reescribiría `owner_id` al inversor y
dejaría al promotor sin la trazabilidad que necesita, así que esas inserciones se marcan
con un ajuste **local** de transacción que el trigger respeta. Cubierto por prueba.

---

## 10. CÓMO APLICAR LAS MIGRACIONES

1. Supabase Dashboard → proyecto de Invergravital → SQL Editor.
2. Ejecutar en orden los ficheros de `WEB/supabase/migrations/` que aún no estén aplicados.
   Todos son **aditivos e idempotentes**: no hacen `DROP`, `DELETE` ni `TRUNCATE`.
3. Verificar con las sondas de §0 y con `WEB/scripts/verify-investor-schema.mjs`.
4. Comprobar el flujo real: `node scripts/e2e-investor-flow.mjs --yes-production`.

**Orden obligatorio:** `20260910_investor_platform.sql` y después
`20260910b_investor_platform_owner_guard.sql`. La segunda cierra un IDOR: no dejes la
primera aplicada sin la segunda.
