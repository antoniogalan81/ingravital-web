import LegalDocLayout from "@/components/LegalDocLayout";
import type { LegalSection } from "@/components/LegalDocLayout";

const sections: LegalSection[] = [
  {
    id: "aceptacion",
    title: "1. Aceptación de los términos",
    content: [
      "El acceso y uso de Ingravital («la Aplicación», «el Servicio» o «los Servicios») implica la aceptación plena y sin reservas de estos Términos. Si no estás de acuerdo, no utilices la Aplicación.",
      "Estos Términos constituyen un acuerdo vinculante entre el usuario y Ventana al Futuro SL («nosotros»).",
    ],
  },
  {
    id: "objeto",
    title: "2. Objeto del servicio",
    content: [
      "Ingravital es una aplicación de productividad, organización personal, bienestar y análisis inteligente que incluye:",
      {
        list: [
          "Registro de hábitos, rutinas y tareas",
          "Sistema de puntos y estadísticas",
          "Gráficos y métricas avanzadas",
          "Análisis generados por IA",
          "Posible sincronización entre dispositivos (futuro)",
          "Servicios premium y suscripciones (futuro)",
        ],
      },
      "La Aplicación puede evolucionar, modificarse o ampliarse sin previo aviso.",
    ],
  },
  {
    id: "edad",
    title: "3. Edad mínima",
    content: [
      "El uso está permitido solo a personas:",
      {
        list: [
          "Con al menos 13 años",
          "Con capacidad legal",
          "O con consentimiento de sus tutores si la ley local lo exige",
        ],
      },
    ],
  },
  {
    id: "cuenta",
    title: "4. Cuenta de usuario",
    content: [
      "El usuario puede registrarse con Google, Apple o email y contraseña. El usuario acepta:",
      {
        list: [
          "Proveer datos reales",
          "No compartir su cuenta",
          "Proteger sus credenciales",
          "Notificar accesos no autorizados",
        ],
      },
      "La contraseña de Google/Apple nunca es visible para Ventana al Futuro SL Podemos suspender o eliminar cuentas por incumplimiento de los Términos.",
    ],
  },
  {
    id: "obligaciones",
    title: "5. Obligaciones del usuario",
    content: [
      "El usuario se compromete a NO:",
      {
        list: [
          "Usar la app con fines ilegales",
          "Realizar ingeniería inversa o manipular el código",
          "Crear cuentas falsas o introducir datos maliciosos",
          "Intentar vulnerar la seguridad",
          "Publicar contenido ofensivo, ilegal o que infrinja derechos de terceros",
          "Usar bots o automatización no permitida",
          "Utilizar la app para emitir diagnósticos profesionales",
          "Manipular los sistemas de IA",
        ],
      },
      "Ventana al Futuro SL podrá suspender cuentas que vulneren estos compromisos.",
    ],
  },
  {
    id: "acceso-internacional",
    title: "6. Acceso internacional",
    content: [
      "El usuario es responsable de cumplir las leyes de su país. Si el uso de la app viola las leyes de tu jurisdicción, debes dejar de usarla.",
    ],
  },
  {
    id: "no-medico",
    title: "7. No es un servicio médico ni profesional",
    content: [
      "Ingravital NO es un servicio médico, sustitutivo de terapia, sistema de diagnóstico, programa clínico, asesor financiero o sistema de emergencia.",
      "Todo contenido:",
      {
        list: [
          "Es orientativo",
          "Puede ser inexacto o incompleto",
          "No sustituye a profesionales",
          "No debe usarse para decisiones críticas de salud ni legales",
        ],
      },
    ],
  },
  {
    id: "riesgos",
    title: "8. Asunción de riesgos",
    content: [
      "El usuario acepta que:",
      {
        list: [
          "Toda actividad física o de bienestar derivada de la app se realiza bajo su propio riesgo",
          "La IA puede fallar, generar errores, información imprecisa o incompleta",
          "Las recomendaciones generadas por IA no están garantizadas",
          "Ventana al Futuro SL no es responsable por lesiones, daños o decisiones basadas en la app",
        ],
      },
    ],
  },
  {
    id: "ia",
    title: "9. Inteligencia artificial",
    content: [
      "La IA utilizada en Ingravital puede generar errores, interpretar mal datos introducidos, producir análisis incompletos o sugerir hábitos no adecuados para todos los usuarios.",
      "El usuario acepta que:",
      {
        list: [
          "No debe tomar decisiones críticas basándose solo en la IA",
          "Es su responsabilidad validar cualquier contenido generado",
          "La IA no constituye asesoramiento profesional",
        ],
      },
    ],
  },
  {
    id: "pagos",
    title: "10. Compras, suscripciones y pagos",
    content: [
      "Al realizar compras in-app:",
      {
        list: [
          "El pago se procesa mediante App Store o Google Play",
          "Ventana al Futuro SL no almacena datos bancarios",
          "Puede existir renovación automática",
          "Los reembolsos dependen exclusivamente de Apple/Google",
          "Las suscripciones son personales y no transferibles",
        ],
      },
    ],
  },
  {
    id: "contenido-usuario",
    title: "11. Contenido del usuario",
    content: [
      "El usuario puede introducir texto, listas, hábitos, rutinas, datos personales y notas. El usuario declara que:",
      {
        list: [
          "Es titular del contenido introducido",
          "No infringe derechos de terceros",
          "No contiene material ilegal u ofensivo",
          "No viola la ley de propiedad intelectual",
        ],
      },
    ],
  },
  {
    id: "propiedad-intelectual",
    title: "12. Propiedad intelectual",
    content: [
      "Todo el contenido, código, diseño, IA, estructura y elementos de la app pertenecen a Ventana al Futuro SL",
      "Está prohibido copiar, modificar, distribuir, descompilar, revender o reutilizar partes de la app sin permiso escrito.",
    ],
  },
  {
    id: "disponibilidad",
    title: "13. Disponibilidad del servicio",
    content: [
      "Ventana al Futuro SL puede actualizar, modificar, limitar, interrumpir, suspender o eliminar servicios o funciones en cualquier momento y sin obligación de indemnizar al usuario.",
    ],
  },
  {
    id: "limitacion-responsabilidad",
    title: "14. Limitación de responsabilidad",
    content: [
      "Ventana al Futuro SL no será responsable, bajo ninguna circunstancia, de:",
      {
        list: [
          "Daños indirectos o consecuenciales",
          "Pérdida de datos o de ingresos",
          "Errores derivados de IA",
          "Decisiones tomadas por el usuario",
          "Hackeos o ataques imposibles de evitar",
          "Fallos de proveedores externos (Google, Apple, OpenAI, Firebase…)",
          "Suspensiones temporales del servicio",
        ],
      },
      "La app se ofrece «TAL CUAL», sin garantías de ningún tipo.",
    ],
  },
  {
    id: "seguridad",
    title: "15. Seguridad",
    content: [
      "Aplicamos medidas razonables para proteger datos y funcionalidades, pero ningún sistema es 100% seguro. El usuario acepta los riesgos inherentes al uso de internet.",
    ],
  },
  {
    id: "exportaciones",
    title: "16. Control de exportaciones",
    content: [
      "El usuario declara que no reside en un país sujeto a sanciones internacionales, no es una persona sancionada por la UE, ONU o EE.UU., y no utilizará la app para actividades ilegales internacionales.",
    ],
  },
  {
    id: "modificaciones",
    title: "17. Modificaciones de los términos",
    content: [
      "Ventana al Futuro SL puede actualizar estos Términos en cualquier momento. La versión vigente será la publicada en la app y/o la web. El uso continuado implica aceptación.",
    ],
  },
  {
    id: "legislacion",
    title: "18. Legislación aplicable y jurisdicción",
    content: [
      "Estos Términos se rigen por la legislación española y la normativa europea aplicable. En caso de conflicto, las partes se someten a los Juzgados y Tribunales de Sevilla (España), salvo norma imperativa en contra.",
    ],
  },
  {
    id: "contacto",
    title: "19. Contacto legal",
    content: [
      "Ventana al Futuro SL · C/ Hernando Colón 39, 41004 Sevilla, España · info@palmaycoco.com",
    ],
  },
];

export default function Terminos() {
  return (
    <LegalDocLayout
      title="Términos y Condiciones"
      updated="02 de diciembre de 2025"
      intro="Estas condiciones regulan el uso de la aplicación Ingravital. Al acceder y usar el servicio, aceptas este acuerdo con Ventana al Futuro SL"
      sections={sections}
    />
  );
}
