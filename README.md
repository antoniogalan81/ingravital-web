# Invergravital — Web

Herramienta gratuita de **análisis y seguimiento de operaciones inmobiliarias**:
costes, reforma, financiación e impuestos para estimar la rentabilidad real de cada
operación antes de decidir.

- **Producción:** https://www.invergravital.com
- **Apex:** https://invergravital.com → redirige a `www`
- **Fallback técnico:** https://invergravital.vercel.app

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase.

Ver [`CLAUDE.md`](./CLAUDE.md) para la arquitectura detallada (dominio, motor de sync,
gestión de estado y convenciones).

## Comandos

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run start    # Servidor de producción
npm run lint     # ESLint
npm test         # Tests (node:test) — p. ej. el merge del motor de sync
```

## Configuración

Variables de entorno en `.env.local` (no versionado):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
```

## Estructura

- `app/` — Páginas y rutas del App Router (landing pública, legal, auth, panel).
- `components/` — Shell público de nivel superior.
- `src/components/` — Componentes reutilizables (`realEstate/`, `ui/`).
- `src/lib/` — Lógica de negocio y tipos (`types.ts` canónico).
- `src/sync/` — Motor de sincronización offline contra Supabase.
- `supabase/migrations/` — Migraciones SQL versionadas.

## Despliegue

Despliegue continuo en Vercel desde `main`.
