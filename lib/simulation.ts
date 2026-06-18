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
  /** Fraccion del flujo total que procesa esta estacion (1 = todo el flujo;
   *  0.5 = estacion en paralelo que recibe la mitad, p.ej. Mesa 1 / Mesa 2). */
  flowShare?: number;
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
  /** "and" = el producto requiere 1 de cada tipo (ensamble, p.ej. Marcos).
   *  "or"  = cada pieza de cualquier tipo es un producto terminado (vias
   *           paralelas 50/50, p.ej. Panel y Fibrex). */
  assembly: "and" | "or";
  /** Unidades que representa cada bolita. */
  ballUnits: number;
  /** Unidades por tarima de producto terminado. */
  palletSize: number;
}

export function stationCapacity(s: Station): number {
  return s.ratePerHour * s.hours;
}

export function evaluate(stations: Station[], params: GlobalParams): SimulationResult {
  const caps = stations.map(stationCapacity);
  // Capacidad efectiva de cada estacion = cuanto target del sistema soporta.
  // Una estacion en paralelo (flowShare 0.5) que produce 200 sostiene 400 del
  // sistema, porque solo recibe la mitad del flujo.
  const share = stations.map((s) => (s.flowShare && s.flowShare > 0 ? s.flowShare : 1));
  const effCaps = caps.map((c, i) => c / share[i]);

  const systemCapacity = effCaps.length ? Math.min(...effCaps) : 0;
  const rawLimit = params.rawMaterial > 0 ? params.rawMaterial : Infinity;
  const effectiveCapacity = Math.min(systemCapacity, rawLimit);

  // El cuello de botella es la estacion con menor capacidad efectiva.
  let bottleneckIdx = 0;
  for (let i = 1; i < effCaps.length; i++) {
    if (effCaps[i] < effCaps[bottleneckIdx]) bottleneckIdx = i;
  }
  const bottleneck = stations[bottleneckIdx];

  const feasible = params.targetMarcos <= effectiveCapacity;
  const deficit = Math.max(0, params.targetMarcos - effectiveCapacity);

  const stationResults: StationResult[] = stations.map((s, i) => ({
    station: s,
    capacity: caps[i],
    isBottleneck: i === bottleneckIdx,
    // Utilizacion = demanda (target x flowShare) / capacidad de la estacion.
    utilizationAtTarget: caps[i] > 0 ? ((params.targetMarcos * share[i]) / caps[i]) * 100 : 0,
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

// Personas por estacion RECOMENDADAS para cubrir un objetivo de turno dado,
// usando la ventana de turno de la estacion a su productividad por persona.
// Mantiene la eficiencia: la plantilla justa para procesar la demanda
// (objetivo x fraccion de flujo) dentro del turno, sin faltantes ni exceso.
export function peopleForTarget(line: ProductionLine, s: Station, target: number): number {
  const perPerson = line.stdProductivity[s.id] ?? s.ratePerHour; // u/persona/hora
  const share = s.flowShare && s.flowShare > 0 ? s.flowShare : 1;
  const perPersonShift = perPerson * s.hours; // unidades por persona en el turno
  if (perPersonShift <= 0) return 1;
  return Math.max(1, Math.ceil((target * share) / perPersonShift));
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
  assembly: "and" | "or";
  ballUnits: number;
  palletSize: number;
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
    makeStations: () =>
      base.map((s) => ({ ...s, handles: [...s.handles] })),
    makeParams: () => ({ ...cfg.params }),
    stdProductivity: std,
    assembly: cfg.assembly,
    ballUnits: cfg.ballUnits,
    palletSize: cfg.palletSize,
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

// --- LINEA DE PANEL (datos reales) ---
// Turno de 11 h. Capacidades de la tabla de PANEL convertidas a piezas/hora.
// Flujo: Corte Madera -> Guillotina -> Despunte y Rolado -> Doblez, y ahi se
// divide 50/50: Mesa Armado 1 -> Prensa 1  y  Mesa Armado 2 -> Prensa 2,
// ambas alimentan las tarimas (50 piezas c/u). Cada bolita = 10 unidades.
const PANEL_A = "lote A";
const PANEL_B = "lote B";
function panelStations(): Station[] {
  return [
    { id: "corte-madera", name: "Corte Madera", people: 1, ratePerHour: 2500 / 11, hours: 11, x: 100, y: 180, fill: "#94C11C", handles: [PANEL_A, PANEL_B] },
    { id: "guillotina", name: "Guillotina", people: 1, ratePerHour: 400 / 11, hours: 11, x: 225, y: 180, fill: "#94C11C", handles: [PANEL_A, PANEL_B] },
    { id: "despunte", name: "Despunte y Rolado", people: 1, ratePerHour: 400 / 11, hours: 11, x: 350, y: 180, fill: "#94C11C", handles: [PANEL_A, PANEL_B] },
    { id: "doblez", name: "Doblez", people: 1, ratePerHour: 400 / 11, hours: 11, x: 475, y: 180, fill: "#94C11C", handles: [PANEL_A, PANEL_B] },
    { id: "mesa-1", name: "Mesa Armado 1", people: 2, ratePerHour: 200 / 11, hours: 11, x: 600, y: 100, fill: "#94C11C", handles: [PANEL_A], flowShare: 0.5 },
    { id: "prensa-1", name: "Prensa Espumadora 1", people: 3, ratePerHour: 200 / 11, hours: 11, x: 715, y: 100, fill: "#94C11C", handles: [PANEL_A], flowShare: 0.5 },
    { id: "mesa-2", name: "Mesa Armado 2", people: 2, ratePerHour: 200 / 11, hours: 11, x: 600, y: 260, fill: "#94C11C", handles: [PANEL_B], flowShare: 0.5 },
    { id: "prensa-2", name: "Prensa Espumadora 2", people: 1, ratePerHour: 200 / 11, hours: 11, x: 715, y: 260, fill: "#94C11C", handles: [PANEL_B], flowShare: 0.5 },
  ];
}
const PANEL_ROUTES: Record<string, string[]> = {
  [PANEL_A]: ["corte-madera", "guillotina", "despunte", "doblez", "mesa-1", "prensa-1"],
  [PANEL_B]: ["corte-madera", "guillotina", "despunte", "doblez", "mesa-2", "prensa-2"],
};
const PANEL_COLORS: Record<string, string> = {
  [PANEL_A]: "#1C1C1A",
  [PANEL_B]: "#1C1C1A",
};

// --- LINEA DE FIBREX (datos reales, con variantes configurables) ---
// Flujo: Corte Madera -> Orificios, se divide 50/50 en Mesa Armado 1 / Mesa
// Armado 2, ambas convergen en Pegado -> Escuadradora -> Pintura Cantos, y de
// ahi a tarimas (50 piezas). Pegado y Escuadradora tienen variantes; la 2a
// pintura se activa en paralelo cuando hay cuello de botella.
const FIBREX_A = "lote A";
const FIBREX_B = "lote B";

export interface FibrexOptions {
  pegado: "normal" | "bostoniano";
  escuadra: "normal" | "doble";
  pintura2: boolean;
}
export const FIBREX_DEFAULTS: FibrexOptions = {
  pegado: "normal",
  escuadra: "normal",
  pintura2: false,
};

export function makeFibrexLine(opts: FibrexOptions = FIBREX_DEFAULTS): ProductionLine {
  const pegado: Station =
    opts.pegado === "bostoniano"
      ? { id: "pegado", name: "Pegado Bostoniano", people: 6, ratePerHour: 624 / 11, hours: 11, x: 445, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] }
      : { id: "pegado", name: "Pegado Puerta Lisa", people: 3, ratePerHour: 1144 / 11, hours: 11, x: 445, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] };

  const escuadra: Station =
    opts.escuadra === "doble"
      ? { id: "escuadradora", name: "Escuadradora Doble Paso", people: 6, ratePerHour: 1560 / 11, hours: 11, x: 565, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] }
      : { id: "escuadradora", name: "Escuadradora", people: 4, ratePerHour: 780 / 11, hours: 11, x: 565, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] };

  const stations: Station[] = [
    { id: "corte-madera", name: "Corte Madera", people: 1, ratePerHour: 1040 / 11, hours: 11, x: 90, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] },
    { id: "orificios", name: "Orificios", people: 1, ratePerHour: 1040 / 11, hours: 11, x: 205, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] },
    { id: "mesa-1", name: "Mesa Armado 1", people: 2, ratePerHour: 520 / 11, hours: 11, x: 325, y: 100, fill: "#94C11C", handles: [FIBREX_A], flowShare: 0.5 },
    { id: "mesa-2", name: "Mesa Armado 2", people: 2, ratePerHour: 520 / 11, hours: 11, x: 325, y: 260, fill: "#94C11C", handles: [FIBREX_B], flowShare: 0.5 },
    pegado,
    escuadra,
  ];

  const routes: Record<string, string[]> = {
    [FIBREX_A]: ["corte-madera", "orificios", "mesa-1", "pegado", "escuadradora"],
    [FIBREX_B]: ["corte-madera", "orificios", "mesa-2", "pegado", "escuadradora"],
  };

  if (opts.pintura2) {
    // Dos lineas de pintura en paralelo: lote A -> Pintura 1, lote B -> Pintura 2
    stations.push(
      { id: "pintura-1", name: "Pintura Cantos 1", people: 1, ratePerHour: 780 / 11, hours: 11, x: 685, y: 110, fill: "#94C11C", handles: [FIBREX_A], flowShare: 0.5 },
      { id: "pintura-2", name: "Pintura Cantos 2", people: 1, ratePerHour: 780 / 11, hours: 11, x: 685, y: 250, fill: "#94C11C", handles: [FIBREX_B], flowShare: 0.5 }
    );
    routes[FIBREX_A].push("pintura-1");
    routes[FIBREX_B].push("pintura-2");
  } else {
    // Una sola pintura que recibe ambos lotes
    stations.push({ id: "pintura-1", name: "Pintura Cantos", people: 1, ratePerHour: 780 / 11, hours: 11, x: 685, y: 180, fill: "#94C11C", handles: [FIBREX_A, FIBREX_B] });
    routes[FIBREX_A].push("pintura-1");
    routes[FIBREX_B].push("pintura-1");
  }

  return buildLine({
    id: "fibrex",
    name: "Línea de Fibrex",
    shortName: "Fibrex",
    tagline: "Puertas Fibrex · pegado y escuadradora configurables",
    unit: "puertas",
    pieceTypes: [FIBREX_A, FIBREX_B],
    pieceColors: { [FIBREX_A]: "#1C1C1A", [FIBREX_B]: "#1C1C1A" },
    routes,
    stations,
    params: { targetMarcos: 780, rawMaterial: 0, workingDays: 20 },
    assembly: "or",
    ballUnits: 10,
    palletSize: 50,
  });
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
    assembly: "and",
    ballUnits: 90,
    palletSize: 330,
  }),
  buildLine({
    id: "panel",
    name: "Línea de Panel",
    shortName: "Panel",
    tagline: "Paneles de puerta · división 50/50 a doble prensa espumadora",
    unit: "puertas",
    pieceTypes: [PANEL_A, PANEL_B],
    pieceColors: PANEL_COLORS,
    routes: PANEL_ROUTES,
    stations: panelStations(),
    params: { targetMarcos: 400, rawMaterial: 0, workingDays: 20 },
    assembly: "or",
    ballUnits: 10,
    palletSize: 50,
  }),
  makeFibrexLine(FIBREX_DEFAULTS),
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
