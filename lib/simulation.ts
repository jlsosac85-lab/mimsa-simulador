// ============================================================
// Motor de simulacion multi-linea - MIMSA
// Soporta varias lineas de produccion (Marcos Metalicos, Panel, Fibrex).
// Cada linea define sus estaciones, rutas, tipos de pieza y parametros base.
// Capacidad por estacion = piezas/hora (de la estacion) x horas.
// Las personas son informativas (KPI de personal y deteccion de exceso),
// no multiplican la capacidad.
// ============================================================

export type PieceType = string;

export interface Station {
  id: string;
  name: string;
  /** Personas asignadas. */
  people: number;
  /** Piezas por hora que produce la estacion. */
  ratePerHour: number;
  /** Horas disponibles de la estacion en el turno. */
  hours: number;
  /** Posicion en el plano (coordenadas SVG). */
  x: number;
  y: number;
  /** Color de relleno del nodo. */
  fill: string;
  /** Que tipos de pieza pasan por esta estacion. */
  handles: PieceType[];
}

export interface GlobalParams {
  targetMarcos: number;
  rawMaterial: number;
  workingDays: number;
}

export interface StationResult {
  station: Station;
  capacity: number;
  isBottleneck: boolean;
  utilizationAtTarget: number;
}

export interface SimulationResult {
  systemCapacity: number;
  effectiveCapacity: number;
  monthlyCapacity: number;
  bottleneck: Station;
  feasible: boolean;
  deficit: number;
  stationResults: StationResult[];
}

// Una linea de produccion completa.
export interface ProductionLine {
  id: string;
  name: string; // nombre largo, p.ej. "Línea de Marcos Metálicos"
  shortName: string; // etiqueta corta para el selector
  tagline: string; // descripcion breve
  unit: string; // unidad de producto (marcos, paneles, piezas...)
  pieceTypes: PieceType[];
  pieceColors: Record<string, string>;
  routes: Record<string, string[]>;
  makeStations: () => Station[];
  makeParams: () => GlobalParams;
  stdProductivity: Record<string, number>;
}

export function stationCapacity(s: Station): number {
  return s.ratePerHour * s.hours;
}

export function evaluate(stations: Station[], params: GlobalParams): SimulationResult {
  const caps = stations.map(stationCapacity);
  const systemCapacity = caps.length ? Math.min(...caps) : 0;
  const rawLimit = params.rawMaterial > 0 ? params.rawMaterial : Infinity;
  const effectiveCapacity = Math.min(systemCapacity, rawLimit);

  let bottleneckIdx = 0;
  for (let i = 1; i < caps.length; i++) {
    if (caps[i] < caps[bottleneckIdx]) bottleneckIdx = i;
  }
  const bottleneck = stations[bottleneckIdx];

  const feasible = params.targetMarcos <= effectiveCapacity;
  const deficit = Math.max(0, params.targetMarcos - effectiveCapacity);

  const stationResults: StationResult[] = stations.map((s, i) => ({
    station: s,
    capacity: caps[i],
    isBottleneck: i === bottleneckIdx,
    utilizationAtTarget: caps[i] > 0 ? (params.targetMarcos / caps[i]) * 100 : 0,
  }));

  return {
    systemCapacity,
    effectiveCapacity,
    monthlyCapacity: effectiveCapacity * params.workingDays,
    bottleneck,
    feasible,
    deficit,
    stationResults,
  };
}

// Deriva las conexiones (flechas) del flujo a partir de las rutas de una linea.
export function deriveEdges(routes: Record<string, string[]>): { from: string; to: string }[] {
  const seen = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  Object.keys(routes).forEach((type) => {
    const route = routes[type];
    for (let i = 0; i < route.length - 1; i++) {
      const key = `${route[i]}->${route[i + 1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: route[i], to: route[i + 1] });
      }
    }
  });
  return edges;
}

// Personas necesarias para sostener el ritmo actual de la estacion,
// segun la productividad estandar (por persona) de la linea.
export function requiredPeople(line: ProductionLine, s: Station): number {
  const prod = line.stdProductivity[s.id] ?? s.ratePerHour;
  if (prod <= 0) return 1;
  return Math.max(1, Math.round(s.ratePerHour / prod));
}

// ============================================================
// Configuracion de cada linea
// ============================================================

interface LineConfig {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  unit: string;
  pieceTypes: PieceType[];
  pieceColors: Record<string, string>;
  routes: Record<string, string[]>;
  stations: Station[];
  params: GlobalParams;
}

function buildLine(cfg: LineConfig): ProductionLine {
  const base = cfg.stations;
  const std: Record<string, number> = {};
  base.forEach((s) => {
    std[s.id] = s.people > 0 ? s.ratePerHour / s.people : s.ratePerHour;
  });
  return {
    id: cfg.id,
    name: cfg.name,
    shortName: cfg.shortName,
    tagline: cfg.tagline,
    unit: cfg.unit,
    pieceTypes: cfg.pieceTypes,
    pieceColors: cfg.pieceColors,
    routes: cfg.routes,
    makeStations: () => base.map((s) => ({ ...s, handles: [...s.handles] })),
    makeParams: () => ({ ...cfg.params }),
    stdProductivity: std,
  };
}

// --- LINEA DE MARCOS METALICOS (operativa, base real) ---
function marcosStations(): Station[] {
  return [
    { id: "roladora", name: "Roladora", people: 2, ratePerHour: 90, hours: 11, x: 120, y: 180, fill: "#94C11C", handles: ["bisagra", "embutido"] },
    { id: "troquel-bisagra", name: "Troquel Bisagra", people: 1, ratePerHour: 240, hours: 4.125, x: 290, y: 100, fill: "#1C1C1A", handles: ["bisagra"] },
    { id: "troquel-embutido", name: "Troquel Embutido", people: 1, ratePerHour: 240, hours: 4.125, x: 290, y: 260, fill: "#1C1C1A", handles: ["embutido"] },
    { id: "pintura", name: "Pintura", people: 4, ratePerHour: 120, hours: 8.25, x: 445, y: 180, fill: "#94C11C", handles: ["bisagra", "embutido"] },
    { id: "remachadora", name: "Remachadora", people: 1, ratePerHour: 180, hours: 5.5, x: 590, y: 95, fill: "#1C1C1A", handles: ["bisagra"] },
    { id: "embolsado", name: "Embolsado", people: 2, ratePerHour: 100, hours: 9.9, x: 705, y: 180, fill: "#94C11C", handles: ["bisagra", "embutido"] },
  ];
}
const MARCOS_ROUTES: Record<string, string[]> = {
  bisagra: ["roladora", "troquel-bisagra", "pintura", "remachadora", "embolsado"],
  embutido: ["roladora", "troquel-embutido", "pintura", "embolsado"],
};
const MARCOS_COLORS: Record<string, string> = {
  bisagra: "#1C1C1A",
  embutido: "#888780",
};

// --- LINEAS DE PANEL Y FIBREX ---
// Por ahora copian la estructura de Marcos Metalicos (placeholder).
// El detalle de estaciones y parametros se definira en la siguiente fase.
function cloneStations(src: Station[]): Station[] {
  return src.map((s) => ({ ...s, handles: [...s.handles] }));
}

export const LINES: ProductionLine[] = [
  buildLine({
    id: "marcos",
    name: "Línea de Marcos Metálicos",
    shortName: "Marcos Metálicos",
    tagline: "Marcos metálicos para puertas residenciales",
    unit: "marcos",
    pieceTypes: ["bisagra", "embutido"],
    pieceColors: MARCOS_COLORS,
    routes: MARCOS_ROUTES,
    stations: marcosStations(),
    params: { targetMarcos: 990, rawMaterial: 0, workingDays: 20 },
  }),
  buildLine({
    id: "panel",
    name: "Línea de Panel",
    shortName: "Panel",
    tagline: "Estructura base — pendiente de detallar estaciones y parámetros",
    unit: "paneles",
    pieceTypes: ["bisagra", "embutido"],
    pieceColors: { ...MARCOS_COLORS },
    routes: JSON.parse(JSON.stringify(MARCOS_ROUTES)),
    stations: cloneStations(marcosStations()),
    params: { targetMarcos: 990, rawMaterial: 0, workingDays: 20 },
  }),
  buildLine({
    id: "fibrex",
    name: "Línea de Fibrex",
    shortName: "Fibrex",
    tagline: "Estructura base — pendiente de detallar estaciones y parámetros",
    unit: "piezas",
    pieceTypes: ["bisagra", "embutido"],
    pieceColors: { ...MARCOS_COLORS },
    routes: JSON.parse(JSON.stringify(MARCOS_ROUTES)),
    stations: cloneStations(marcosStations()),
    params: { targetMarcos: 990, rawMaterial: 0, workingDays: 20 },
  }),
];

export function getLine(id: string): ProductionLine {
  return LINES.find((l) => l.id === id) ?? LINES[0];
}

// Compatibilidad: defaults de la linea de Marcos Metalicos.
export function defaultStations(): Station[] {
  return getLine("marcos").makeStations();
}
export function defaultParams(): GlobalParams {
  return getLine("marcos").makeParams();
}
