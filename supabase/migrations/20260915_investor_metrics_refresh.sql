-- 20260915_investor_metrics_refresh.sql — Recalcular las métricas del inversor al leerlas.
--
-- `investment_opportunities.metrics` es un resultado precalculado (la BD no sabe calcular la
-- rentabilidad). Antes solo se refrescaba al guardar la oferta, así que un gasto, una venta, un
-- cobro o un documento procesado dejaban cifras antiguas. Ahora, cuando un inversor abre la
-- oportunidad, `/api/investor/refresh-metrics` comprueba su acceso con SU sesión
-- (`get_investor_snapshot`) y recalcula en el servidor con la MISMA función que usa la WEB
-- (`buildOpportunityMetrics`). Para ello la clave de servidor necesita leer la invitación y la
-- oportunidad y escribir SOLO la columna `metrics`.
--
-- Idempotente. No toca datos ni políticas RLS de los usuarios.

grant select on table public.opportunity_invitations to service_role;
grant select on table public.investment_opportunities to service_role;
grant update (metrics) on table public.investment_opportunities to service_role;
