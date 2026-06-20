import LegalDocLayout from "@/components/LegalDocLayout";
import type { LegalSection } from "@/components/LegalDocLayout";

const sections: LegalSection[] = [
  {
    id: "aceptacion",
    title: "1. Aceptación de los términos",
    content: [
      "El acceso y uso de Invergravital («la Aplicación», «el Servicio» o «los Servicios») implica la aceptación plena y sin reservas de estos Términos. Si no estás de acuerdo, no utilices la Aplicación.",
      "Estos Términos constituyen un acuerdo vinculante entre el usuario y Ventana al Futuro SL («nosotros»).",
    ],
  },
  {
    id: "objeto",
    title: "2. Objeto del servicio",
    content: [
      "Invergravital es una herramienta de análisis de inversiones inmobiliarias que ayuda al usuario a estudiar operaciones antes de decidir. Incluye:",
      {
        list: [
          "Cálculo de costes, reforma, impuestos y financiación de una operación",
          "Estimación de rentabilidad de compraventa y de alquiler",
          "Comparación de varios escenarios de inversión",
          "Generación de informes de operación",
          "Análisis y resúmenes generados por IA (orientativos)",
          "Sincronización de tus operaciones entre dispositivos",
        ],
      },
      "La Aplicación es una herramienta de cálculo y apoyo a la decisión. No interviene en la compra, venta ni financiación de inmuebles, no ejecuta operaciones y no gestiona dinero del usuario.",
      "La Aplicación puede evolucionar, modificarse o ampliarse sin previo aviso.",
    ],
  },
  {
    id: "gratuito",
    title: "3. Servicio gratuito",
    content: [
      "El uso de las herramientas principales de Invergravital es gratuito: no se requiere tarjeta, suscripción ni pago para acceder y analizar operaciones.",
      "No existen costes ocultos ni comisiones por el uso de la herramienta de análisis. Si en el futuro se ofrecieran servicios opcionales de pago, se informarían de forma clara y se regirían por condiciones específicas que el usuario podría aceptar o no.",
    ],
  },
  {
    id: "edad",
    title: "4. Edad mínima y capacidad",
    content: [
      "El uso está permitido solo a personas:",
      {
        list: [
          "Mayores de 18 años",
          "Con capacidad legal para contratar",
          "Que actúen en su propio nombre o debidamente autorizadas",
        ],
      },
    ],
  },
  {
    id: "cuenta",
    title: "5. Cuenta de usuario",
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
      "La contraseña de Google/Apple nunca es visible para Ventana al Futuro SL. Podemos suspender o eliminar cuentas por incumplimiento de los Términos.",
    ],
  },
  {
    id: "obligaciones",
    title: "6. Obligaciones del usuario",
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
          "Presentar los análisis de la app como asesoramiento financiero, fiscal o de inversión profesional",
          "Manipular los sistemas de IA",
        ],
      },
      "Ventana al Futuro SL podrá suspender cuentas que vulneren estos compromisos.",
    ],
  },
  {
    id: "acceso-internacional",
    title: "7. Acceso internacional",
    content: [
      "El usuario es responsable de cumplir las leyes de su país. Si el uso de la app viola las leyes de tu jurisdicción, debes dejar de usarla.",
    ],
  },
  {
    id: "no-asesoramiento",
    title: "8. No es asesoramiento financiero ni profesional",
    content: [
      "Invergravital es una herramienta de cálculo y análisis. NO es un servicio de asesoramiento financiero, fiscal, legal o de inversión, ni una recomendación de compra o venta, ni una entidad de intermediación o gestión de inversiones.",
      "Todo contenido, incluidos cálculos, estimaciones y análisis de IA:",
      {
        list: [
          "Es orientativo y se basa en los datos que introduce el usuario",
          "Puede ser inexacto o incompleto",
          "No garantiza rentabilidades ni resultados de inversión",
          "No sustituye el criterio de un asesor financiero, fiscal o legal cualificado",
          "No debe usarse como única base para una decisión de inversión",
        ],
      },
    ],
  },
  {
    id: "riesgos",
    title: "9. Asunción de riesgos de inversión",
    content: [
      "El usuario acepta que:",
      {
        list: [
          "Toda inversión inmobiliaria conlleva riesgo, incluida la posible pérdida del capital invertido",
          "Las rentabilidades estimadas son proyecciones y no resultados garantizados",
          "Los resultados reales dependen de factores de mercado ajenos a la Aplicación",
          "Las decisiones de inversión se toman bajo la responsabilidad exclusiva del usuario",
          "Ventana al Futuro SL no es responsable de pérdidas ni de decisiones tomadas a partir de la app",
        ],
      },
    ],
  },
  {
    id: "ia",
    title: "10. Inteligencia artificial",
    content: [
      "La IA utilizada en Invergravital puede generar errores, interpretar mal los datos introducidos o producir análisis incompletos de una operación.",
      "El usuario acepta que:",
      {
        list: [
          "No debe tomar decisiones de inversión basándose solo en la IA",
          "Es su responsabilidad validar cualquier contenido generado",
          "La IA no constituye asesoramiento financiero, fiscal ni de inversión",
        ],
      },
    ],
  },
  {
    id: "contenido-usuario",
    title: "11. Contenido y datos del usuario",
    content: [
      "El usuario introduce datos de sus operaciones (precios, costes, reformas, financiación, alquileres, notas y similares). El usuario declara que:",
      {
        list: [
          "Es titular de la información introducida o está autorizado a tratarla",
          "Los datos no infringen derechos de terceros",
          "No introduce material ilegal u ofensivo",
          "Es responsable de la veracidad de los datos sobre los que se calculan los resultados",
        ],
      },
    ],
  },
  {
    id: "propiedad-intelectual",
    title: "12. Propiedad intelectual",
    content: [
      "Todo el contenido, código, diseño, IA, estructura y elementos de la app pertenecen a Ventana al Futuro SL.",
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
          "Pérdidas económicas derivadas de decisiones de inversión del usuario",
          "Errores derivados de IA",
          "Hackeos o ataques imposibles de evitar",
          "Fallos de proveedores externos (Google, Apple, proveedores de IA, alojamiento…)",
          "Suspensiones temporales del servicio",
        ],
      },
      "La app se ofrece «TAL CUAL», sin garantías de ningún tipo sobre la exactitud de los cálculos ni sobre resultados de inversión.",
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
      updated="20 de junio de 2026"
      intro="Estas condiciones regulan el uso de Invergravital, una herramienta de análisis de inversiones inmobiliarias. Al acceder y usar el servicio, aceptas este acuerdo con Ventana al Futuro SL."
      sections={sections}
    />
  );
}
