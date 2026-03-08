import LegalDocLayout from "@/components/LegalDocLayout";
import type { LegalSection } from "@/components/LegalDocLayout";

const sections: LegalSection[] = [
  {
    id: "introduccion",
    title: "1. Introducción",
    content: [
      "El sitio web de Ingravital puede utilizar cookies y tecnologías similares para mejorar la experiencia del usuario, garantizar el correcto funcionamiento del sitio y obtener información sobre el uso de la web.",
      "Al continuar navegando por este sitio, el usuario acepta el uso de cookies conforme a esta Política.",
    ],
  },
  {
    id: "que-son",
    title: "2. Qué son las cookies",
    content: [
      "Las cookies son pequeños archivos de texto que se almacenan en el navegador o dispositivo del usuario cuando visita un sitio web. Permiten al sitio recordar información sobre la navegación, como preferencias o el estado de la sesión.",
      "Las cookies no dañan el dispositivo ni acceden a información personal almacenada en él.",
    ],
  },
  {
    id: "tipos",
    title: "3. Tipos de cookies que utilizamos",
    content: [
      {
        list: [
          "Cookies técnicas: necesarias para el funcionamiento básico del sitio. Sin ellas, el sitio no puede funcionar correctamente.",
          "Cookies de preferencias: permiten recordar configuraciones del usuario, como el idioma o preferencias de visualización.",
          "Cookies de análisis y estadísticas: permiten entender cómo los usuarios interactúan con el sitio para mejorar su funcionamiento (por ejemplo, Google Analytics).",
        ],
      },
      "No utilizamos cookies publicitarias ni de seguimiento sin el consentimiento expreso del usuario.",
    ],
  },
  {
    id: "gestion",
    title: "4. Gestión de cookies",
    content: [
      "El usuario puede gestionar las cookies en cualquier momento:",
      {
        list: [
          "Aceptar o rechazar cookies desde el banner de consentimiento al acceder al sitio.",
          "Eliminar las cookies almacenadas desde la configuración del navegador.",
          "Configurar el navegador para bloquear la instalación de cookies de forma automática.",
        ],
      },
      "Ten en cuenta que deshabilitar ciertas cookies puede afectar al funcionamiento del sitio.",
    ],
  },
  {
    id: "cambios",
    title: "5. Cambios en la política",
    content: [
      "Ventana al Futuro SL puede actualizar esta Política de Cookies en el futuro para adaptarla a cambios normativos o técnicos. La versión vigente será siempre la publicada en esta página.",
    ],
  },
  {
    id: "titular",
    title: "6. Información del titular",
    content: [
      "Ventana al Futuro SL · CIF: B70919006 · Sevilla, España · info@palmaycoco.com",
    ],
  },
];

export default function Cookies() {
  return (
    <LegalDocLayout
      title="Política de Cookies"
      updated="02 de diciembre de 2025"
      intro="Información sobre el uso de cookies y tecnologías similares en el sitio web de Ingravital."
      sections={sections}
    />
  );
}
