// Página de fallback OFFLINE (estática). El service worker la sirve cuando se navega a
// una ruta no cacheada estando sin conexión. Es intencionadamente estática y sin datos
// de usuario (no filtra nada). Los datos ya cargados siguen disponibles gracias a la
// caché local por usuario del motor de sync.
export const metadata = {
  title: "Sin conexión · Invergravital",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        background: "#0b0f14",
        color: "#e6edf3",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "2px solid #2dd4a6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        ⚡
      </div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
        Sin conexión
      </h1>
      <p style={{ maxWidth: 420, color: "#9fb0bd", lineHeight: 1.5 }}>
        No hay red ahora mismo. Tus operaciones ya cargadas siguen disponibles; los cambios
        se sincronizarán en cuanto vuelva la conexión. Vuelve a intentarlo cuando estés online.
      </p>
    </main>
  );
}
