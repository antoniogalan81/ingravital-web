// src/lib/realEstate.ts — Tipos Inversión Inmobiliaria (idénticos a APP/models/realEstate.ts)

export type UnitType = "VIVIENDA" | "GARAJE" | "TRASTERO";

export type REUnit = {
  id: string;
  type: UnitType;
  title: string;
  m2Unit?: number;
  m2Access?: number;
  // VIVIENDA: zonas comunes (antes m2NotUseful)
  m2CommonAreas?: number;
  // VIVIENDA: modo alquiler
  rentType?: "TRADICIONAL" | "HABITACIONES";
  numHabitaciones?: number;   // VIVIENDA TRADICIONAL: Nº habitaciones
  // Venta
  salePriceTotal?: number;
  salePriceM2?: number;
  // Alquiler
  rentMonthly?: number;       // VIVIENDA TRADICIONAL y GARAJE
  // VIVIENDA HABITACIONES
  m2PerRoom?: number;
  pricePerRoom?: number;
  // VIVIENDA: multiplicador (Nº de viviendas iguales)
  numUnits?: number;           // default 1
  // GARAJE
  m2PerPlaza?: number;        // M2 por plaza (default 12.5)
  // TRASTERO
  m2Total?: number;           // M2 trastero totales
  m2PerUnit?: number;         // M2 por unidad
};

export type RETasa = {
  label: string;
  pct: number;     // % sobre obra total
  amount?: number; // bidireccional con pct
};

export type RECosts = {
  purchaseTaxPct: number;
  purchaseTaxTotal?: number;
  cimentacionPriceM2?: number;
  cimentacionTotal?: number;
  escalerasM2?: number;
  escalerasPriceM2?: number;
  escalerasTotal?: number;
  accesosM2?: number;
  accesosPriceM2?: number;
  accesosTotal?: number;
  obraViviendaPriceM2?: number;
  obraViviendaTotal?: number;
  obraGarajePriceM2?: number;
  obraGarajeTotal?: number;
  obraTrasterosPriceM2?: number;
  obraTrasterosTotal?: number;
  arquitectoPct: number;
  arquitectoTotal?: number;
  desviacionesPct?: number;
  desviacionesTotal?: number;
  tasas: RETasa[];
  tasasTotal?: number;    // override total (cuando está definido ignora tasas individuales)
  furnitureCostPerUnit?: number;
};

export type REFinancingBlock = {
  pct: number;
  amount?: number;
  interest?: number;
  years?: number;
};

export type REFinancing = {
  enabled: boolean;
  compra: { pct: number; amount?: number; interest: number; years?: number };
  obra: REFinancingBlock;
};

export type REOperation = {
  id: string;
  name: string;
  address?: string;
  link?: string;
  purchasePrice: number;
  m2Plot?: number;
  m2Buildable?: number;
  units: REUnit[];
  costs: RECosts;
  financing: REFinancing;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  isDraft?: boolean;
  _cat?: string;
  _wizardDraft?: {
    cat: string;
    mode: string;
    step: string;
    data: unknown;
  };
  order?: number;
  // Agrupación de variantes (opcional — no afecta cálculos ni sync)
  variantGroupId?: string;
  variantGroupName?: string;
  variantName?: string;
  isMainVariant?: boolean;
};

export const DEFAULT_TASAS: RETasa[] = [
  { label: "Licencia de obra (ICIO + tasa urbanística)", pct: 2.8  },
  { label: "Licencia de actividad",                       pct: 1    },
  { label: "Tasa urbanística adicional",                  pct: 0.35 },
  { label: "Estudio de impacto ambiental",                pct: 0.3  },
  { label: "Certificación energética",                    pct: 0.1  },
  { label: "Otras tasas",                                 pct: 0.2  },
  { label: "Licencia ambiental / PAC",                    pct: 0.5  },
  { label: "Agrupación catastral / segregaciones",        pct: 0.2  },
  { label: "Conexiones a suministros",                    pct: 1    },
  { label: "Gastos notariales y registrales",             pct: 0.5  },
];

export type REResults = {
  purchaseTaxAmt: number;
  cimentacionAmt: number;
  escalerasAmt: number;
  accesosAmt: number;
  obraViviendaAmt: number;
  obraGarajeAmt: number;
  obraTrasterosAmt: number;
  obraTotal: number;
  obraBase: number;
  arquitectoAmt: number;
  desviacionesAmt: number;
  tasasAmt: number;
  furnitureCostTotal: number;
  totalInvestment: number;
  compraAmount: number;
  obraFinAmount: number;
  totalFinanced: number;
  myInvestment: number;
  compraMonthly: number;
  obraMonthly: number;
  totalMonthlyPayment: number;
  unitResults: Array<REUnit & { rooms: number; monthlyIncomeRooms: number; numTrasteros: number; numPlazas: number }>;
  monthlyRentIncome: number;
  monthlyRentBenefit: number;
  rentYield: number;
  totalSales: number;
  saleBenefit: number;
  saleYield: number;
};
