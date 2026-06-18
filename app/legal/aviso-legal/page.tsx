import LegalDocLayout from "@/components/LegalDocLayout";
import type { LegalSection } from "@/components/LegalDocLayout";

const sections: LegalSection[] = [
  {
    id: "titularidad",
    title: "1. Titularidad del sitio web",
    content: [
      "De acuerdo con la Ley 34/2002 (LSSI-CE), se informa que:",
      {
        list: [
          "Titular: Ventana al Futuro SL",
          "CIF: B70919006",
          "Domicilio: C/ Hernando Colón 39, 41004 Sevilla, España",
          "Email de contacto: info@palmaycoco.com",
          "Actividad: Desarrollo de software y servicios digitales asociados a la app INVERGRAVITAL",
        ],
      },
    ],
  },
  {
    id: "objeto",
    title: "2. Objeto del aviso legal",
    content: [
      "Este Aviso Legal regula el acceso, navegación y uso del sitio web asociado a la aplicación Invergravital, así como cualquier página, dominio, subdominio o servicio online propiedad de la empresa.",
      "Este Aviso Legal regula:",
      {
        list: [
          "El acceso y uso del sitio web",
          "Las responsabilidades del usuario",
          "Los límites legales del titular",
          "Las normas sobre propiedad intelectual",
          "Las condiciones aplicables al contenido y servicios ofrecidos",
          "Los enlaces externos y responsabilidad asociada",
        ],
      },
      "Este Aviso Legal es complementario a la Política de Privacidad, los Términos y Condiciones de Uso y la Política de Cookies.",
    ],
  },
  {
    id: "acceso",
    title: "3. Acceso y uso del sitio web",
    content: [
      "El usuario se compromete a:",
      {
        list: [
          "Usar el sitio web de forma lícita",
          "No dañar, inutilizar o sobrecargar la web",
          "No vulnerar los sistemas de seguridad",
          "No realizar ingeniería inversa ni manipular el código",
          "No introducir virus, troyanos o software malicioso",
          "No utilizar la web para actividades contrarias a la ley o al orden público",
        ],
      },
      "Ventana al Futuro SL podrá bloquear, restringir o eliminar acceso a usuarios que incumplan estas normas.",
    ],
  },
  {
    id: "propiedad-intelectual",
    title: "4. Propiedad intelectual e industrial",
    content: [
      "Todo el contenido disponible en la web es propiedad exclusiva de Ventana al Futuro SL, incluyendo:",
      {
        list: [
          "Código fuente y arquitectura técnica",
          "Diseño, logotipos, marcas y nombres comerciales",
          "Textos, imágenes y gráficos",
          "Software y bases de datos",
          "Documentación",
        ],
      },
      "Queda prohibida cualquier copia, reproducción, distribución, modificación o utilización no autorizada sin permiso escrito de la empresa. El uso no autorizado puede constituir delito según los artículos 270 y siguientes del Código Penal español.",
    ],
  },
  {
    id: "enlaces",
    title: "5. Enlaces externos",
    content: [
      "El sitio puede contener enlaces a sitios de terceros. Ventana al Futuro SL:",
      {
        list: [
          "No se hace responsable del contenido de páginas externas",
          "No garantiza su disponibilidad",
          "No supervisa ni aprueba dichos contenidos",
          "No es responsable de daños derivados del acceso a páginas de terceros",
        ],
      },
      "El usuario accede a sitios externos bajo su propia responsabilidad.",
    ],
  },
  {
    id: "responsabilidad-titular",
    title: "6. Responsabilidad del titular",
    content: [
      "Ventana al Futuro SL no será responsable de:",
      {
        list: [
          "Fallos técnicos o interrupciones de la web",
          "Problemas derivados del proveedor de internet del usuario",
          "Daños causados por malware o ataques externos",
          "Uso indebido de la información publicada",
          "Inexactitudes puntuales por errores humanos o técnicos",
          "Pérdida de datos ocasionada por terceros o por el usuario",
        ],
      },
      "El sitio se ofrece «tal cual» sin garantías de disponibilidad continua.",
    ],
  },
  {
    id: "responsabilidad-usuario",
    title: "7. Responsabilidad del usuario",
    content: [
      "El usuario acepta:",
      {
        list: [
          "Hacer un uso adecuado del contenido",
          "No utilizar la web para fines ilegales",
          "No acceder a áreas privadas sin permiso",
          "No falsificar identidades",
          "No transmitir información ofensiva, ilícita o dañina",
          "No vulnerar derechos de terceros",
        ],
      },
      "El incumplimiento puede dar lugar a acciones legales.",
    ],
  },
  {
    id: "datos-personales",
    title: "8. Protección de datos personales",
    content: [
      "Los datos personales se gestionan conforme a la Política de Privacidad de Invergravital, el RGPD (UE 2016/679) y la LOPDGDD (LO 3/2018).",
      "Puedes acceder a todos tus derechos (acceso, rectificación, supresión, oposición, portabilidad y limitación) escribiendo a info@palmaycoco.com.",
    ],
  },
  {
    id: "cookies",
    title: "9. Política de cookies",
    content: [
      "La web puede utilizar cookies técnicas y analíticas. El usuario podrá consultar la Política de Cookies donde se explican los tipos, funcionalidad, finalidad y cómo gestionarlas o desactivarlas.",
      "No instalamos cookies no esenciales sin consentimiento.",
    ],
  },
  {
    id: "seguridad",
    title: "10. Seguridad del sitio web",
    content: [
      "Implementamos medidas razonables para proteger el contenido y la infraestructura del sitio:",
      {
        list: [
          "Certificado SSL (HTTPS)",
          "Actualizaciones de seguridad",
          "Protección contra ataques comunes",
          "Controles de acceso",
        ],
      },
      "Ningún sistema es 100% seguro; el usuario asume los riesgos implícitos del uso de internet.",
    ],
  },
  {
    id: "modificaciones",
    title: "11. Modificaciones del aviso legal",
    content: [
      "Ventana al Futuro SL puede modificar este Aviso Legal en cualquier momento. La versión vigente será la publicada en la web. El uso continuado implica aceptación de la versión actualizada.",
    ],
  },
  {
    id: "legislacion",
    title: "12. Legislación aplicable y jurisdicción",
    content: [
      "Este Aviso Legal se rige por la Ley 34/2002 (LSSI-CE), el Código Civil español y la normativa europea aplicable.",
      "En caso de disputa, el fuero competente será Sevilla (España), salvo disposición en contra.",
    ],
  },
  {
    id: "contacto",
    title: "13. Contacto",
    content: [
      "Ventana al Futuro SL · C/ Hernando Colón 39, 41004 Sevilla, España · info@palmaycoco.com",
    ],
  },
];

export default function AvisoLegal() {
  return (
    <LegalDocLayout
      title="Aviso Legal"
      updated="02 de diciembre de 2025"
      intro="Este Aviso Legal regula el acceso, navegación y uso del sitio web asociado a la aplicación Invergravital y todos los servicios online de Ventana al Futuro SL"
      sections={sections}
    />
  );
}
