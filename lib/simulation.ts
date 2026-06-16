// ============================================================
// Motor de simulacion de la linea de Marcos Metalicos - MIMSA
// Capacidad por estacion = marcos por hora (de la estacion) x horas.
// Las personas son SOLO informativas (suman al KPI de personal),
// no multiplican la capacidad.
// ============================================================

// Tipo de pieza que fluye por la linea.
// Un marco terminado = 1 cabezal + 1 larguero-bisagra + 1 larguero-embutido.
export type PieceType = "cabezal" | "bisagra" | "embutido";

export interface Station {
  id: string;
  name: string;
  /** Personas asignadas (solo informativo, suma al KPI de personal). */
  people: number;
  /** Marcos por hora que produce la estacion. */
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
  /** Objetivo de marcos a producir en el turno. */
  targetMarcos: number;
  /** Materia prima disponible (en marcos-equivalentes). 0 = sin limite. */
  rawMaterial: number;
  /** Dias habiles del mes (para proyeccion mensual). */
  workingDays: number;
}

export interface StationResult {
  station: Station;
  capacity: number; // marcos por turno
  isBottleneck: boolean;
  utilizationAtTarget: number; // % de uso si se persigue el objetivo
}

export interface SimulationResult {
  systemCapacity: number; // marcos/turno (minimo de la cadena)
  effectiveCapacity: number; // considerando materia prima
  monthlyCapacity: number;
  bottleneck: Station;
  feasible: boolean;
  deficit: number;
  stationResults: StationResult[];
}

// Capacidad de una estacion en marcos por turno.
export function stationCapacity(s: Station): number {
  return s.ratePerHour * s.hours;
}

// Evalua todo el sistema para un conjunto de estaciones y parametros.
export function evaluate(
  stations: Station[],
  params: GlobalParams
): SimulationResult {
  const caps = stations.map(stationCapacity);
  const systemCapacity = Math.min(...caps);

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
    utilizationAtTarget:
      caps[i] > 0 ? (params.targetMarcos / caps[i]) * 100 : 0,
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

// ============================================================
// Configuracion semilla — valores reales del Excel de MIMSA.
// El cabezal ya no pasa por troquel (estacion eliminada).
//   Roladora 855 · Troquel Bisagra 960 · Troquel Embutido 960 ·
//   Remachadora 900 · Pintura 840 (cuello) · Embolsado 900
// ============================================================
export function defaultStations(): Station[] {
  return [
    {
      id: "roladora",
      name: "Roladora",
      people: 2,
      ratePerHour: 90,
      hours: 9.5,
      x: 130,
      y: 180,
      fill: "#94C11C",
      handles: ["cabezal", "bisagra", "embutido"],
    },
    {
      id: "troquel-bisagra",
      name: "Troquel Bisagra",
      people: 1,
      ratePerHour: 240,
      hours: 4,
      x: 320,
      y: 105,
      fill: "#1C1C1A",
      handles: ["bisagra"],
    },
    {
      id: "troquel-embutido",
      name: "Troquel Embutido",
      people: 1,
      ratePerHour: 120,
      hours: 8,
      x: 320,
      y: 255,
      fill: "#1C1C1A",
      handles: ["embutido"],
    },
    {
      id: "remachadora",
      name: "Remachadora",
      people: 1,
      ratePerHour: 180,
      hours: 5,
      x: 470,
      y: 105,
      fill: "#94C11C",
      handles: ["bisagra"],
    },
    {
      id: "pintura",
      name: "Pintura",
      people: 3,
      ratePerHour: 120,
      hours: 7,
      x: 600,
      y: 180,
      fill: "#94C11C",
      handles: ["cabezal", "bisagra", "embutido"],
    },
    {
      id: "embolsado",
      name: "Embolsado",
      people: 2,
      ratePerHour: 100,
      hours: 9,
      x: 710,
      y: 180,
      fill: "#94C11C",
      handles: ["cabezal", "bisagra", "embutido"],
    },
  ];
}

export function defaultParams(): GlobalParams {
  return {
    targetMarcos: 840,
    rawMaterial: 0,
    workingDays: 20,
  };
}

// Rutas de cada tipo de pieza (secuencia de estaciones por id).
// El cabezal ya NO pasa por troquel: va de Roladora directo a Pintura.
export const ROUTES: Record<PieceType, string[]> = {
  cabezal: ["roladora", "pintura", "embolsado"],
  bisagra: ["roladora", "troquel-bisagra", "remachadora", "pintura", "embolsado"],
  embutido: ["roladora", "troquel-embutido", "pintura", "embolsado"],
};

// Deriva las conexiones (flechas) del flujo a partir de las rutas.
// Devuelve pares unicos { from, to } de estaciones consecutivas.
export function deriveEdges(): { from: string; to: string }[] {
  const seen = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  (Object.keys(ROUTES) as PieceType[]).forEach((type) => {
    const route = ROUTES[type];
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

// Colores por tipo de pieza (para la animacion).
export const PIECE_COLORS: Record<PieceType, string> = {
  cabezal: "#94C11C",
  bisagra: "#1C1C1A",
  embutido: "#888780",
};
