"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "@/src/contexts/AuthContext";
import { useSync } from "@/src/sync/SyncContext";
import type { Gender } from "@/src/lib/types";
import SiteShell from "@/components/SiteShell";

const PROFILE_SETTINGS_ID = "__PROFILE_SETTINGS__";

interface ProfileSettingsData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  birthDateISO: string;
  heightCm: number | null;
  weightKg: number | null;
  updatedAt: string;
}

type FormData = {
  firstName: string;
  lastName: string;
  gender: Gender | "";
  birthDateISO: string;
  heightCm: string;
  weightKg: string;
};

export default function AccountPage() {
  const router = useRouter();
  const { loading: authLoading, user, profile, signOut } = useAuth();
  const { modules, setModuleEnabled } = useSync();
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    gender: "",
    birthDateISO: "",
    heightCm: "",
    weightKg: "",
  });
  const [originalData, setOriginalData] = useState<FormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Refs for click-outside autosave and race-condition prevention
  const formContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef(0);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const hasChangesRef = useRef(false);
  const savingRef = useRef(false);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [birthDateDisplay, setBirthDateDisplay] = useState("");
  const datePickerRef = useRef<HTMLInputElement>(null);

  // ISO (AAAA-MM-DD) <-> display español (DD-MM-AAAA)
  const isoToDisplay = (iso: string): string => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  };
  const displayToIso = (display: string): string | null => {
    if (!display) return "";
    if (!/^\d{2}-\d{2}-\d{4}$/.test(display)) return null;
    const [d, m, y] = display.split("-");
    return `${y}-${m}-${d}`;
  };

  // Security modals
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordSending, setPasswordSending] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Redirect si no autenticado
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Cargar profile_settings al montar
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        const { data: row, error } = await supabase
          .from("profile_settings")
          .select("data")
          .eq("id", PROFILE_SETTINGS_ID)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("[Account] Error cargando profile_settings:", error.message);
          setLoadingSettings(false);
          return;
        }

        if (row?.data) {
          const d = row.data as ProfileSettingsData;
          const data: FormData = {
            firstName: d.firstName || "",
            lastName: d.lastName || "",
            gender: (d.gender as Gender) || "",
            birthDateISO: d.birthDateISO || "",
            heightCm: d.heightCm?.toString() || "",
            weightKg: d.weightKg?.toString() || "",
          };
          setFormData(data);
          setOriginalData(data);
          setBirthDateDisplay(isoToDisplay(d.birthDateISO || ""));
        } else {
          // Sin datos en Supabase todavía: inicializa originalData con el estado vacío
          // para que hasChanges funcione en cuanto el usuario escriba algo
          setOriginalData({ firstName: "", lastName: "", gender: "", birthDateISO: "", heightCm: "", weightKg: "" });
        }
      } finally {
        setLoadingSettings(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSaveSuccess(false);
    setSaveError(null);
    setSyncMessage(null);
  };

  // Handler específico para el input de texto de fecha (formato DD-MM-AAAA)
  const handleBirthDateDisplayChange = (value: string) => {
    setBirthDateDisplay(value);
    setSaveSuccess(false);
    setSaveError(null);
    setSyncMessage(null);
    if (!value) {
      setFormData(prev => ({ ...prev, birthDateISO: "" }));
      setBirthDateError(null);
    } else if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
      // Parcial: solo mostrar error cuando ya tiene 10 chars
      setBirthDateError(value.length >= 10 ? "Formato: DD-MM-AAAA" : null);
    } else {
      const iso = displayToIso(value);
      if (!iso || isNaN(new Date(iso).getTime())) {
        setBirthDateError("Fecha no válida");
      } else {
        setBirthDateError(null);
        setFormData(prev => ({ ...prev, birthDateISO: iso }));
      }
    }
  };

  const handleCancel = () => {
    if (originalData) {
      setFormData(originalData);
      setBirthDateDisplay(isoToDisplay(originalData.birthDateISO));
    }
    setSaveError(null);
    setSyncMessage(null);
    setSaveSuccess(false);
    setBirthDateError(null);
  };

  const validateBodyMetrics = (): string | null => {
    if (birthDateError) return birthDateError;
    if (birthDateDisplay && !formData.birthDateISO) {
      return "Fecha de nacimiento incompleta (usa DD-MM-AAAA)";
    }
    if (formData.heightCm !== "") {
      const h = Number(formData.heightCm);
      if (!isFinite(h) || h < 100 || h > 250) return "Altura debe estar entre 100 y 250 cm";
    }
    if (formData.weightKg !== "") {
      const w = Number(formData.weightKg);
      if (!isFinite(w) || w < 30 || w > 300) return "Peso debe estar entre 30 y 300 kg";
    }
    return null;
  };

  const handleSave = async () => {
    if (!user) return;

    // Cancel any pending debounced autosave
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const validationError = validateBodyMetrics();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    // Race-condition prevention: capture version and snapshot before async ops
    saveVersionRef.current += 1;
    const thisVersion = saveVersionRef.current;
    const snapshotData = { ...formData };

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setSyncMessage(null);

    try {
      const nowISO = new Date().toISOString();

      const payloadData: ProfileSettingsData = {
        id: PROFILE_SETTINGS_ID,
        firstName: snapshotData.firstName.trim(),
        lastName: snapshotData.lastName.trim(),
        email: user.email || "",
        gender: snapshotData.gender || "",
        birthDateISO: snapshotData.birthDateISO || "",
        heightCm: snapshotData.heightCm ? parseInt(snapshotData.heightCm, 10) : null,
        weightKg: snapshotData.weightKg ? parseInt(snapshotData.weightKg, 10) : null,
        updatedAt: nowISO,
      };

      // Upsert en profile_settings
      const { data: rpcResult, error } = await supabase.rpc("upsert_profile_settings_if_newer", {
        p_user_id: user.id,
        p_id: PROFILE_SETTINGS_ID,
        p_data: payloadData,
        p_client_updated_at: nowISO,
      });

      if (error) {
        // Fallback: upsert directo si RPC no existe
        if (error.message.includes("function") || error.code === "42883") {
          const { error: upsertError } = await supabase
            .from("profile_settings")
            .upsert({
              id: PROFILE_SETTINGS_ID,
              user_id: user.id,
              data: payloadData,
              client_updated_at: nowISO,
              deleted_at: null,
            }, { onConflict: "id,user_id" });

          if (upsertError) {
            setSaveError(upsertError.message);
            return;
          }
        } else {
          setSaveError(error.message);
          return;
        }
      } else if (rpcResult && !rpcResult.updated) {
        // El servidor tiene versión más nueva
        const serverData = rpcResult.row?.data as ProfileSettingsData;
        if (serverData) {
          const refreshed: FormData = {
            firstName: serverData.firstName || "",
            lastName: serverData.lastName || "",
            gender: (serverData.gender as Gender) || "",
            birthDateISO: serverData.birthDateISO || "",
            heightCm: serverData.heightCm?.toString() || "",
            weightKg: serverData.weightKg?.toString() || "",
          };
          setFormData(refreshed);
          setOriginalData(refreshed);
          setBirthDateDisplay(isoToDisplay(serverData.birthDateISO || ""));
          setSyncMessage("Se actualizó con la versión más reciente del servidor");
          return;
        }
      }

      // Only apply success if this is still the latest in-flight save
      if (thisVersion !== saveVersionRef.current) return;

      // Update originalData only — avoids overwriting live edits the user may have made mid-save
      setOriginalData(snapshotData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      if (thisVersion === saveVersionRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  const hasChanges = useMemo(() => {
    if (!originalData) return false;
    const keys: Array<keyof FormData> = ["firstName", "lastName", "gender", "birthDateISO", "heightCm", "weightKg"];
    return keys.some(key => formData[key] !== originalData[key]);
  }, [formData, originalData]);

  // Keep refs in sync with latest state/function for stable event listener closure
  hasChangesRef.current = hasChanges;
  savingRef.current = saving;
  handleSaveRef.current = handleSave;

  // Click-outside autosave: triggers save with 600ms debounce when clicking outside the form card
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (formContainerRef.current?.contains(e.target as Node)) return;
      if (!hasChangesRef.current || savingRef.current) return;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        handleSaveRef.current?.();
      }, 600);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Cambiar email
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      setEmailError("Introduce un email válido");
      return;
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      setEmailError("El formato del email no es válido");
      return;
    }

    setEmailSending(true);
    setEmailError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim().toLowerCase(),
      });

      if (error) {
        setEmailError(error.message);
        return;
      }

      setEmailSuccess(true);
    } finally {
      setEmailSending(false);
    }
  };

  const closeEmailModal = () => {
    setEmailModalOpen(false);
    setNewEmail("");
    setEmailError(null);
    setEmailSuccess(false);
  };

  // Cambiar contraseña
  const handleChangePassword = async () => {
    if (!user?.email) {
      setPasswordError("No se pudo obtener el email del usuario");
      return;
    }

    setPasswordSending(true);
    setPasswordError(null);

    try {
      const redirectUrl = `${window.location.origin}/auth/reset`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setPasswordError(error.message);
        return;
      }

      setPasswordSuccess(true);
    } finally {
      setPasswordSending(false);
    }
  };

  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  // Calcular edad
  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Formatear fecha premium
  const formatPremiumDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  };

  // Loading
  if (authLoading || loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No mostrar si no hay user
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isPremium = profile?.premium_active ?? false;
  const displayName = formData.firstName || user.email?.split("@")[0] || "Usuario";
  const age = calculateAge(formData.birthDateISO);

  return (
    <>
      <SiteShell>
        <div className="max-w-[640px] mx-auto space-y-6">
          {/* Header de cuenta */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-3xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>

          {/* Tarjeta Premium */}
          <div className={`rounded-2xl border p-6 ${isPremium ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" : "bg-white border-slate-200"}`}>
            <div className="flex flex-col xs:flex-row items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {isPremium ? (
                    <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                  <h2 className={`text-lg font-semibold ${isPremium ? "text-amber-900" : "text-slate-900"}`}>
                    {isPremium ? "Premium activo" : "Plan Gratuito"}
                  </h2>
                </div>
                <p className={`text-sm ${isPremium ? "text-amber-700" : "text-slate-500"}`}>
                  {isPremium 
                    ? profile?.premium_until 
                      ? `Activo hasta ${formatPremiumDate(profile.premium_until)}`
                      : "Suscripción activa"
                    : "Accede a todas las funciones premium"
                  }
                </p>
              </div>
              {!isPremium && (
                <a
                  href="https://wa.me/34656195880?text=Hola,%20quiero%20información%20sobre%20Premium"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  Obtener Premium
                </a>
              )}
            </div>
          </div>

          {/* Tarjeta Editar perfil */}
          <div ref={formContainerRef} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Información personal</h2>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Success message */}
              {saveSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-sm text-emerald-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cambios guardados correctamente
                  </p>
                </div>
              )}

              {/* Sync message */}
              {syncMessage && (
                <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-sm text-blue-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {syncMessage}
                  </p>
                </div>
              )}

              {/* Error message */}
              {saveError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-sm text-red-600">{saveError}</p>
                </div>
              )}

              {/* Barra de cambios */}
              {hasChanges && (
                <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm text-slate-700">Tienes cambios sin guardar</p>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Guardando...
                        </span>
                      ) : (
                        "Guardar cambios"
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Nombre y Apellidos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Nombre
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={handleChange}
                      placeholder="Tu nombre"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Apellidos
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={handleChange}
                      placeholder="Tus apellidos"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Género y Fecha nacimiento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gender" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Género
                    </label>
                    <select
                      id="gender"
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    >
                      <option value="">Seleccionar</option>
                      <option value="hombre">Hombre</option>
                      <option value="mujer">Mujer</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="birthDateISO" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Fecha de nacimiento {age !== null && <span className="text-slate-400">({age} años)</span>}
                    </label>
                    <div className="relative">
                      <input
                        id="birthDateISO"
                        name="birthDateISO"
                        type="text"
                        inputMode="numeric"
                        value={birthDateDisplay}
                        onChange={(e) => handleBirthDateDisplayChange(e.target.value)}
                        placeholder="DD-MM-AAAA"
                        maxLength={10}
                        className={`w-full px-4 py-2.5 pr-10 rounded-lg border ${birthDateError ? "border-red-400" : "border-slate-200"} text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400`}
                      />
                      {/* Hidden date picker — se abre con el botón calendario */}
                      <input
                        ref={datePickerRef}
                        type="date"
                        value={formData.birthDateISO}
                        onChange={(e) => {
                          const iso = e.target.value;
                          setFormData(prev => ({ ...prev, birthDateISO: iso }));
                          setBirthDateDisplay(isoToDisplay(iso));
                          setBirthDateError(null);
                          setSaveSuccess(false);
                          setSyncMessage(null);
                        }}
                        className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = datePickerRef.current;
                          if (!el) return;
                          el.style.pointerEvents = "auto";
                          el.showPicker?.();
                          setTimeout(() => { el.style.pointerEvents = "none"; }, 1000);
                        }}
                        className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                        aria-label="Abrir selector de fecha"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    {birthDateError && (
                      <p className="mt-1 text-xs text-red-500">{birthDateError}</p>
                    )}
                  </div>
                </div>

                {/* Altura y Peso */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="heightCm" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Altura (cm)
                    </label>
                    <input
                      id="heightCm"
                      name="heightCm"
                      type="number"
                      min="100"
                      max="250"
                      value={formData.heightCm}
                      onChange={handleChange}
                      placeholder="175"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="weightKg" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Peso (kg)
                    </label>
                    <input
                      id="weightKg"
                      name="weightKg"
                      type="number"
                      min="30"
                      max="300"
                      value={formData.weightKg}
                      onChange={handleChange}
                      placeholder="70"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Botón guardar explícito */}
                <div className="pt-1 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Guardando...
                      </span>
                    ) : "Guardar"}
                  </button>
                  {saveSuccess && !saving && (
                    <span className="text-sm text-emerald-600 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Guardado
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta Seguridad */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Seguridad</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Email actual */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Email</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                </div>
                <button
                  onClick={() => setEmailModalOpen(true)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Cambiar
                </button>
              </div>
              
              {/* Contraseña */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-700">Contraseña</p>
                  <p className="text-sm text-slate-500">••••••••</p>
                </div>
                <button
                  onClick={() => setPasswordModalOpen(true)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Cambiar
      </button>
              </div>
            </div>
          </div>

          {/* Links rápidos */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Accesos rápidos</h2>
            <div className="space-y-2">
              <Link
                href="/agenda"
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <span className="text-sm font-medium text-slate-700">Ir a la Agenda</span>
                <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/finanzas"
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <span className="text-sm font-medium text-slate-700">Ver Finanzas</span>
                <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/legal"
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <span className="text-sm font-medium text-slate-700">Legal y privacidad</span>
                <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Funciones */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Funciones</h2>
            <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
              <div>
                <div className="text-sm font-medium text-slate-800">Inversión inmobiliaria</div>
                <div className="text-xs text-slate-500 mt-0.5">Analiza rentabilidad, costes y financiación de propiedades</div>
              </div>
              <button
                type="button"
                onClick={() => setModuleEnabled("operaciones", !modules.operaciones.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${modules.operaciones.enabled ? "bg-blue-600" : "bg-slate-200"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${modules.operaciones.enabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
          </div>

          {/* Cerrar sesión (mobile friendly) */}
          <button
            onClick={handleSignOut}
            className="w-full py-3 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </SiteShell>

      {/* Modal: Cambiar email */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeEmailModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[420px] mx-4 p-6">
            {!emailSuccess ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Cambiar email</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Te enviaremos un enlace de confirmación al nuevo email.
                </p>

                {emailError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-sm text-red-600">{emailError}</p>
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="newEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nuevo email
                  </label>
                  <input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nuevo@email.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeEmailModal}
                    disabled={emailSending}
                    className="flex-1 py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleChangeEmail}
                    disabled={emailSending}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {emailSending ? "Enviando..." : "Enviar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Email enviado</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Te hemos enviado un email de confirmación a <strong>{newEmail}</strong> para completar el cambio.
                </p>
                <button
                  onClick={closeEmailModal}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Cambiar contraseña */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closePasswordModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[420px] mx-4 p-6">
            {!passwordSuccess ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Cambiar contraseña</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Te enviaremos un enlace a <strong>{user.email}</strong> para crear una nueva contraseña.
                </p>

                {passwordError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-sm text-red-600">{passwordError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={closePasswordModal}
                    disabled={passwordSending}
                    className="flex-1 py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={passwordSending}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {passwordSending ? "Enviando..." : "Enviar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Email enviado</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Te hemos enviado un enlace para cambiar la contraseña.
                </p>
                <button
                  onClick={closePasswordModal}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
