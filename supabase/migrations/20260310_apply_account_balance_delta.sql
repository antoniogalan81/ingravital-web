-- Función RPC: aplica un delta atómico al balance de una cuenta bancaria.
-- Evita el race condition de read-modify-write desde cliente cuando
-- varios dispositivos modifican el balance simultáneamente.
--
-- Uso desde cliente:
--   supabase.rpc('apply_account_balance_delta', {
--     p_account_id: 'uuid',
--     p_user_id: 'uuid',
--     p_delta: 50.0        -- positivo: suma; negativo: resta
--   })
-- Devuelve: el campo 'data' actualizado (JSONB) con el nuevo balance.

CREATE OR REPLACE FUNCTION public.apply_account_balance_delta(
  p_account_id TEXT,
  p_user_id    UUID,
  p_delta      NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- hereda el contexto del usuario; RLS sigue activo
AS $$
DECLARE
  v_updated_data JSONB;
BEGIN
  UPDATE bank_accounts
  SET
    data = jsonb_set(
      data,
      '{balance}',
      to_jsonb(
        COALESCE((data->>'balance')::numeric, 0) + p_delta
      )
    ),
    client_updated_at = NOW()
  WHERE
    id          = p_account_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING data INTO v_updated_data;

  -- Si no se actualizó ninguna fila (cuenta inexistente o de otro usuario),
  -- devolvemos NULL; el cliente debe ignorar el resultado silenciosamente.
  RETURN v_updated_data;
END;
$$;

-- Permisos: solo usuarios autenticados pueden llamar la función.
GRANT EXECUTE ON FUNCTION public.apply_account_balance_delta(TEXT, UUID, NUMERIC)
  TO authenticated;
