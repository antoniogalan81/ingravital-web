import LegalDocLayout from "@/components/LegalDocLayout";
import type { LegalSection } from "@/components/LegalDocLayout";

const sections: LegalSection[] = [
  {
    id: "introduccion",
    title: "1. Introducción",
    content: [
      "Esta Política de Privacidad describe cómo Ventana al Futuro SL recopila, utiliza, procesa, almacena y protege tus datos personales cuando utilizas Invergravital, una herramienta de análisis de inversiones inmobiliarias, y todos los servicios vinculados.",
      "La presente Política cumple con:",
      {
        list: [
          "RGPD (Reglamento UE 2016/679)",
          "LOPDGDD (Ley Orgánica 3/2018)",
          "CCPA (California)",
          "Requisitos de App Store y Google Play",
          "Normativa de transferencias internacionales",
        ],
      },
      "Al usar nuestros Servicios aceptas esta Política. Si no estás de acuerdo, debes dejar de utilizarlos.",
    ],
  },
  {
    id: "responsable",
    title: "2. Identidad del responsable",
    content: [
      "Responsable: Ventana al Futuro SL",
      "Domicilio: C/ Hernando Colón 39, 41004 Sevilla, España",
      "Email: info@palmaycoco.com",
      "Jurisdicción primaria: España / Unión Europea.",
    ],
  },
  {
    id: "datos-recopilados",
    title: "3. Datos personales que recopilamos",
    content: [
      "Recopilamos datos proporcionados por el usuario, datos generados automáticamente, datos inferidos por algoritmos o IA, y datos obtenidos de terceros.",
      "Datos de cuenta proporcionados por el usuario:",
      {
        list: [
          "Nombre, apellidos, email, fecha de nacimiento y género",
          "Avatar y preferencias de la cuenta",
          "Mensajes enviados al soporte",
        ],
      },
      "Datos de operaciones e inversión que introduce el usuario:",
      {
        list: [
          "Precios de compra, costes, reforma e impuestos de cada operación",
          "Condiciones de financiación (capital, plazo, interés)",
          "Importes de alquiler, venta y escenarios analizados",
          "Notas, nombres de operación y documentación que el usuario añada",
        ],
      },
      "Estos datos son datos personales del usuario asociados a sus análisis. No son datos de categoría especial. Invergravital no solicita ni trata datos de salud, biométricos ni de ningún tipo sensible.",
      "Datos técnicos y de uso (recopilados automáticamente):",
      {
        list: [
          "Dirección IP, zona horaria e idioma del dispositivo",
          "Datos sobre rendimiento, fallos y errores",
          "Actividad dentro de la app (pantallas visitadas, tiempo de uso)",
        ],
      },
    ],
  },
  {
    id: "finalidades",
    title: "4. Finalidades del tratamiento",
    content: [
      "Procesamos tus datos para prestar el servicio (crear cuenta, guardar tus operaciones, calcular rentabilidad y mostrar informes), mejorar la aplicación mediante analítica técnica, cumplir obligaciones legales y, con tu consentimiento explícito, para funciones de inteligencia artificial y publicidad personalizada.",
      "Nunca vendemos los datos de tus operaciones ni los usamos para publicidad.",
    ],
  },
  {
    id: "base-legal",
    title: "5. Base legal del tratamiento (RGPD)",
    content: [
      {
        list: [
          "Ejecutar un contrato: funcionamiento de la app y guardado de tus operaciones",
          "Consentimiento explícito: análisis con IA y, en su caso, publicidad personalizada",
          "Interés legítimo: seguridad y analítica técnica",
          "Obligación legal: fiscalidad y procesos judiciales",
        ],
      },
    ],
  },
  {
    id: "conservacion",
    title: "6. Conservación de datos",
    content: [
      {
        list: [
          "Cuenta activa → todos los datos mientras esté activa",
          "Obligación legal → mínimo exigido (ej. 5 años para datos con relevancia fiscal)",
          "Logs técnicos → entre 3 y 24 meses",
          "Datos anonimizados → indefinidamente",
          "Datos tratados por IA → según consentimiento o necesidad funcional",
        ],
      },
      "El usuario puede solicitar eliminación total en cualquier momento.",
    ],
  },
  {
    id: "cesion",
    title: "7. Cesión y comunicación de datos a terceros",
    content: [
      "Solo compartimos datos cuando es estrictamente necesario para ofrecer los Servicios, cumplir la ley o cuando tú lo autorizas. Podemos compartir datos con:",
      {
        list: [
          "Servicios de alojamiento y bases de datos",
          "Herramientas de analítica técnica y registro de errores",
          "Servicios de inteligencia artificial (OpenAI, Google Vertex AI, AWS Bedrock u otros)",
          "Herramientas de email, soporte y mensajería",
          "Servicios de publicidad (solo si aceptas publicidad personalizada)",
        ],
      },
      "Todos están obligados por contrato a cumplir el RGPD. Tus datos pueden tratarse en la UE, EE.UU. u otros países donde operen nuestros proveedores, siempre con Cláusulas Contractuales Tipo y cifrado.",
    ],
  },
  {
    id: "derechos",
    title: "8. Derechos del usuario",
    content: [
      "Según el RGPD, LOPDGDD y leyes internacionales, tienes derecho a:",
      {
        list: [
          "Acceso: copia de todos los datos personales que tengamos sobre ti",
          "Rectificación: corregir cualquier dato incorrecto o incompleto",
          "Supresión («derecho al olvido»): borrar tus datos cuando ya no sean necesarios",
          "Limitación del tratamiento: limitar el uso sin solicitar eliminación",
          "Portabilidad: recibir tus datos en formato estructurado (JSON, CSV…)",
          "Oposición: a publicidad personalizada, profiling o interés legítimo",
          "Retirada del consentimiento: en cualquier momento para IA o publicidad",
          "Reclamación ante la AEPD si consideras que hemos incumplido la normativa",
        ],
      },
      "Para ejercer cualquier derecho, escríbenos a info@palmaycoco.com indicando qué derecho deseas ejercer y tu email de cuenta. Responderemos en un plazo máximo de 30 días.",
    ],
  },
  {
    id: "menores",
    title: "9. Menores de edad",
    content: [
      "Invergravital es una herramienta de análisis de inversión y no está dirigida a menores de 18 años. Si detectamos que un menor ha creado una cuenta, eliminaremos la cuenta y todos los datos asociados.",
    ],
  },
  {
    id: "seguridad",
    title: "10. Seguridad de los datos",
    content: [
      "Implementamos medidas técnicas y organizativas robustas:",
      {
        list: [
          "Cifrado en tránsito (HTTPS / TLS)",
          "Controles de acceso estrictos y auditorías internas periódicas",
          "Detección de intrusiones y monitorización continua",
          "Copias de seguridad seguras y gestión de incidentes",
        ],
      },
      "A pesar de todas las medidas, ningún sistema es 100% seguro. El usuario asume los riesgos inherentes al uso de aplicaciones digitales.",
    ],
  },
  {
    id: "cookies",
    title: "11. Política de cookies (web)",
    content: [
      "En la web podemos usar cookies técnicas y necesarias, de preferencias, estadísticas (Google Analytics) y de marketing (solo si el usuario acepta).",
      "No instalamos cookies no esenciales sin tu permiso. Puedes aceptar, rechazar, configurar o retirar el consentimiento desde el banner inicial o desde la configuración del navegador.",
    ],
  },
  {
    id: "ia",
    title: "12. Uso de inteligencia artificial",
    content: [
      "Con tu consentimiento explícito, podemos tratar datos personales mediante IA para:",
      {
        list: [
          "Análisis de tus operaciones, escenarios y métricas de rentabilidad",
          "Generación de resúmenes y observaciones sobre una operación",
          "Mejora de los modelos internos de análisis",
        ],
      },
      "Podemos enviar datos a proveedores como OpenAI, Google Vertex AI o Amazon AWS Bedrock. Los resultados de la IA son orientativos y no constituyen asesoramiento de inversión. Puedes revocar este consentimiento en cualquier momento. Ningún proveedor adquiere la propiedad de tus datos.",
    ],
  },
  {
    id: "limitacion",
    title: "13. Responsabilidad y limitación legal",
    content: [
      "La información generada por la app, incluidos cálculos, estimaciones, recomendaciones y predicciones, no constituye asesoramiento financiero, fiscal ni de inversión, y no sustituye la opinión de profesionales cualificados.",
      "Ventana al Futuro SL no será responsable por daños indirectos, pérdidas de datos, pérdidas económicas derivadas de decisiones de inversión del usuario, errores de proveedores de servicios o ataques externos.",
      "En caso de brecha de seguridad, cumpliremos los requisitos de notificación según el RGPD (plazo 72 horas) y la normativa internacional aplicable.",
    ],
  },
  {
    id: "cambios",
    title: "14. Cambios en esta política",
    content: [
      "Podemos modificar esta Política cuando actualicemos funciones, integremos nueva IA, cambiemos proveedores o cambie la normativa aplicable.",
      "Cuando haya cambios significativos, publicaremos la nueva versión en la app y te avisaremos dentro de la aplicación. El uso posterior implica aceptación de los cambios.",
    ],
  },
  {
    id: "ley-aplicable",
    title: "15. Ley aplicable y jurisdicción",
    content: [
      "Esta Política se rige por las leyes de España, el RGPD y la LOPDGDD. En caso de conflicto, el fuero preferente es Sevilla, España, salvo que la ley disponga otra cosa de forma imperativa.",
    ],
  },
  {
    id: "contacto",
    title: "16. Contacto y ejercicio de derechos",
    content: [
      "Puedes ejercer cualquier derecho (acceso, rectificación, supresión, oposición, limitación, portabilidad, retirada de consentimiento) escribiendo a:",
      "Ventana al Futuro SL · C/ Hernando Colón 39, 41004 Sevilla, España · info@palmaycoco.com",
      "Responderemos en un plazo máximo de 30 días (ampliable por complejidad).",
    ],
  },
  {
    id: "anexo-ia",
    title: "Anexo I — Tratamiento por IA y modelos automatizados",
    content: [
      "Este anexo documenta el uso de IA en la plataforma:",
      {
        list: [
          "Procesamiento de los datos de operaciones para generar análisis y resúmenes",
          "Uso interno para mejorar las recomendaciones de análisis",
          "Procesamiento en proveedores externos bajo contrato",
          "Control del usuario sobre su consentimiento en todo momento",
          "Medidas para evitar resultados discriminatorios",
          "Explicabilidad limitada cuando el modelo sea de un tercer proveedor",
        ],
      },
    ],
  },
  {
    id: "anexo-internacional",
    title: "Anexo II — Transferencias internacionales",
    content: [
      "Invergravital puede almacenar y procesar datos en la Unión Europea, Estados Unidos o cualquier país donde operen proveedores críticos.",
      "Cumplimos Cláusulas Contractuales Tipo (SCC), reglas corporativas vinculantes cuando existan, y evaluación continua de riesgos.",
    ],
  },
  {
    id: "anexo-retencion",
    title: "Anexo III — Política de retención extendida",
    content: [
      {
        list: [
          "Perfil: mientras exista la cuenta",
          "Operaciones e informes: hasta que solicites su eliminación",
          "Logs técnicos: 3 a 24 meses",
          "Analytics agregados: indefinido",
          "Datos anonimizados: indefinido",
          "Documentos de soporte: obligación legal (aprox. 5 años)",
        ],
      },
    ],
  },
];

export default function Privacidad() {
  return (
    <LegalDocLayout
      title="Política de Privacidad"
      updated="20 de junio de 2026"
      intro="Esta Política describe cómo Ventana al Futuro SL recopila, usa y protege tus datos personales cuando usas Invergravital, en cumplimiento del RGPD y la normativa aplicable."
      sections={sections}
    />
  );
}
