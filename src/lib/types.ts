// ========== PROFILE (public.profiles) ==========
// Datos personales están en public.profile_settings.data (jsonb)

export type Gender = "hombre" | "mujer" | "otro";

export interface Profile {
  id: string;
  created_at?: string;
  updated_at?: string;
}
