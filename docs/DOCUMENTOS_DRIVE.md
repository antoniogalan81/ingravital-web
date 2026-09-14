# Documentación de Google Drive → "Actualizar con IA"

> Documento de referencia. Estado verificado el 2026-09-14.

## 1. Qué hace

En **Gestión del proyecto → Documentación** el promotor pega el enlace de una carpeta de
Google Drive, la comparte con `invergravital@gmail.com` y pulsa **Actualizar con IA**. Un
worker en el PC del propietario lee solo los documentos nuevos o modificados, extrae datos,
y actualiza los datos reales de la operación (o deja propuestas para revisar).

```
navegador ──rpc request_document_sync──▶ Supabase (tarea pendiente)
PC worker ──claim_document_job (saliente, sin puertos)──▶ Supabase
PC worker ──Drive API v3 (invergravital@gmail.com, drive.readonly)──▶ Google Drive
PC worker: descarga temporal → PyMuPDF / Tesseract / xlrd → reglas → (Ollama si faltan datos)
PC worker ──record_document_proposal──▶ Supabase ──apply_document_proposal──▶ operaciones_inmobiliarias.data
navegador: lee estado (RLS), acepta/rechaza (decide_document_proposal), sincroniza
```

## 2. Piezas

| Pieza | Dónde |
|---|---|
| Migración (tablas, RLS, RPC) | `supabase/migrations/20260914_document_sync.sql` — **aplicada en producción** |
| Pruebas BD (PGlite) | `supabase/tests/documentSync.test.mjs` |
| UI | `src/components/realEstate/tracking/DocumentacionPanel.tsx` (+ `DriveFolderCard.tsx`) |
| Cliente de datos / vista | `src/lib/documentSync.ts`, `src/lib/documentSyncView.ts` |
| Worker | `worker/` (`index.ts` bucle, `pipeline.ts`, `drive.ts`, `rules.ts`, `extract/`, `policy.ts`) |
| Umbrales y límites | `worker/policy.ts` (único sitio) |

Tablas: `document_processing_jobs`, `project_documents`, `document_change_proposals`,
`document_processing_audit`. El navegador **solo lee** (RLS `user_id = auth.uid()`); escribe
únicamente mediante `request_document_sync` y `decide_document_proposal`.

## 3. Reglas de negocio

- **Incremental**: un documento se procesa si es nuevo, cambió su `md5Checksum`/`modifiedTime`,
  o falló de forma transitoria (máx. 3 intentos). Lo demás no se descarga.
- **Ya registrado a mano** (un gasto real activo enlaza ese archivo): no se descarga ni duplica.
- **Duplicados**: mismo contenido (SHA-256) → `duplicate`; misma factura (NIF + número) desde otro
  archivo → no se aplica; un único índice parcial por operación y clave.
- **Confianza** calculada por comprobaciones (base + IVA = total, NIF válido, fecha, nombre de
  archivo coincide…), no opinada por un modelo. ≥ 0,90 se aplica sola; 0,60–0,90 a revisión;
  < 0,60 no toca nada. Lo que aporta Ollama tiene techo 0,85 (siempre revisión).
- **Factura / justificante** → gasto real `rexp_doc_<fileId>` con enlace al archivo.
  **Certificación** → siempre revisión. **Presupuesto** → solo se registra.
- **Préstamo** → financiación real. **Escritura con unidad inequívoca** → parche de la fila de venta;
  arras, cobros, unidad ambigua o sin fila → revisión.
- **Variantes**: todas las operaciones del usuario que enlazan la misma carpeta reciben el cambio;
  aceptar/rechazar se extiende a las hermanas.
- **Documento modificado** tras aplicarse → nueva propuesta a revisión (no pisa correcciones manuales).
- **Archivo eliminado de Drive** → `removed_at`; no se borran datos.
- Nunca revive un elemento borrado por el usuario (`deletedAt`).
- `client_updated_at` avanza 1 ms en cada aplicación: el push condicionado de WEB y APP detecta la
  escritura y fusiona (`realExpenses`/`realLoans` por id con marcas; `sales` misma fila → la más reciente).

## 4. Seguridad y protección de datos

- Sin credenciales de usuarios: solo comparten la carpeta. OAuth 2.0 (escritorio + PKCE) de
  `invergravital@gmail.com` con `drive.readonly`; token de refresco solo en el PC.
- Secretos fuera del repo: `%LOCALAPPDATA%\Invergravital\worker.env` (ACL solo del usuario).
  Supabase: clave secreta **dedicada** `invergravital_worker` (revocable en Settings → API Keys).
- **Anti-suplantación entre clientes**: la carpeta debe tener como propietario, o haber sido
  compartida por, el mismo email de la cuenta de Invergravital. Si no, la tarea termina en error.
- IDs de Drive validados por regex; URLs construidas por el worker (sin SSRF). Atajos no se siguen.
- Tipos permitidos por firma de bytes (MIME falsificado → error). Límites: 20 MB, 40 páginas,
  6 páginas OCR, 2.000 archivos, 5 niveles. ZIP y hojas de Google se ignoran. Sin ejecución de
  macros ni JavaScript de PDF.
- Copia temporal con nombre aleatorio, borrada tras cada documento (y limpieza al arrancar).
- Minimización: no se guarda el texto del documento; solo campos estructurados. El prestatario de
  un préstamo no se conserva. Los datos no salen del PC (Ollama local; sin APIs externas).
- Logs del worker: solo ids, estados y recuentos.
- Auditoría: quién pidió, qué documento/versión, qué se extrajo, campo modificado con valor
  anterior y nuevo, automático o manual, confianza, quién aceptó/rechazó.
- CSV de control con celdas neutralizadas contra inyección de fórmulas.

## 5. Puesta en marcha del PC (una vez)

Requisitos ya instalados en este PC: Node 24, Python 3.14 con PyMuPDF/xlrd/openpyxl, Tesseract
(`C:\Program Files\Tesseract-OCR`) con `spa` en `%LOCALAPPDATA%\Invergravital\tessdata`, Ollama
(`qwen2.5:7b-instruct`).

**Credencial de Google** (requiere iniciar sesión):
1. <https://console.cloud.google.com/> → crear proyecto (p. ej. "Invergravital documentos").
2. *APIs y servicios → Biblioteca* → **Google Drive API** → Habilitar.
3. *Pantalla de consentimiento OAuth* → Externo → nombre de la app y email de soporte → alcance
   `.../auth/drive.readonly` → **Publicar la app (En producción)**. (En "Prueba" el token de
   refresco caduca a los 7 días.) Google avisará de "app no verificada": es normal para uso propio.
4. *Credenciales → Crear credenciales → ID de cliente OAuth → **Aplicación de escritorio***.
5. En `E:\ECOAPP\Invergravital\WEB`: `npm run worker:setup` → pega ID y secreto → inicia sesión
   con **invergravital@gmail.com** → queda autorizado y registrada la tarea de Windows
   "Invergravital - Actualizar con IA (worker)" (arranca al iniciar sesión, oculto, se reinicia solo).

Operación: registro en `%LOCALAPPDATA%\Invergravital\worker.log`. Quitar la tarea:
`powershell -File worker\install-task.ps1 -Remove`. Reprocesar tras cambiar reglas:
subir `EXTRACTOR_VERSION` y `npm run worker -- --once --reprocess`.

## 6. Pruebas

```bash
npm test                    # unidad (src + worker, extracción real con OCR) + PGlite (RLS/RPC)
npm run typecheck:worker
SUPABASE_PUBLISHABLE_KEY=… npm run worker:e2e   # extremo a extremo contra el Supabase real
```

`worker:e2e` crea usuarios temporales, recorre petición → dos workers → Drive simulado →
extracción → aplicación → push WEB con copia antigua → revisión → aislamiento, y los borra.

## 7. Límites conocidos

- Una APP sin la actualización OTA sube `sales` sin fusionar: podría revertir una venta aplicada
  desde un documento hasta que la APP se actualice.
- Las métricas publicadas a inversores (`investment_opportunities.metrics`) se recalculan al
  guardar la oferta, no al actualizar documentos (hoy no hay ofertas en producción).
- Si el PC está apagado, las tareas quedan en *Pendiente* hasta que arranque.
