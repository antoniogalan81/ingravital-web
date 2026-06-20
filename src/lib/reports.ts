// src/lib/reports.ts — Estructura del módulo INFORMES (paridad con APP).
// Un informe se compone desde una REOperation reutilizando calcResults.
// ESTADO: tipos + 1ª versión funcional de previsualización. Export PDF / compartir PENDIENTES.

export type ReportSectionKey =
  | "resumen"
  | "compra"
  | "costes"
  | "obra"
  | "licencias"
  | "financiacion"
  | "ingresos"
  | "rentabilidad"
  | "escenarios"
  | "riesgos"
  | "estado"
  | "documentacion";

export type ReportSectionDef = {
  key: ReportSectionKey;
  label: string;
  desc: string;
  auto: boolean;
};

export const REPORT_SECTIONS: ReportSectionDef[] = [
  { key: "resumen",       label: "Resumen de la operación", desc: "KPIs principales y tesis de inversión", auto: true },
  { key: "compra",        label: "Datos de compra",          desc: "Precio, superficies y dirección",        auto: true },
  { key: "costes",        label: "Costes",                   desc: "Impuestos, cimentación, accesos…",        auto: true },
  { key: "obra",          label: "Obra",                     desc: "Coste de obra por tipo de unidad",        auto: true },
  { key: "licencias",     label: "Licencias y tasas",        desc: "Tasas e impuestos urbanísticos",          auto: true },
  { key: "financiacion",  label: "Financiación",             desc: "Compra y obra, cuotas e intereses",       auto: true },
  { key: "ingresos",      label: "Ventas y alquileres",      desc: "Ingresos esperados por escenario",        auto: true },
  { key: "rentabilidad",  label: "Rentabilidad",             desc: "ROI, rentabilidad bruta/neta, cashflow",  auto: true },
  { key: "escenarios",    label: "Escenarios",               desc: "Conservador / base / optimista",          auto: false },
  { key: "riesgos",       label: "Riesgos",                  desc: "Riesgos identificados y mitigación",      auto: false },
  { key: "estado",        label: "Estado actual",            desc: "Avance, hitos y desviaciones",            auto: false },
  { key: "documentacion", label: "Documentación",            desc: "Documentos adjuntos de la operación",     auto: false },
];

export type ReportExportFormat = "PDF" | "ENLACE";
