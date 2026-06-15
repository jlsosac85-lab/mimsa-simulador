// ============================================================
// Motor de simulacion de la linea de Marcos Metalicos - MIMSA
// Toda la logica de capacidades y cuellos de botella vive aqui,
// independiente de la interfaz.
// ============================================================

// Tipo de pieza que fluye por la linea.
// Un marco terminado = 1 cabezal + 1 larguero-bisagra + 1 larguero-embutido.
export type PieceType = "cabezal" | "bisagra" | "embutido";

export interface Station {
  id: string;
  name: string;
  /** Personas asignadas a la estacion. */
  people: number;
  /** Marcos-equivalentes que produce UNA persona en UNA hora. */
  ratePerPersonHour: number;
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
  capacity: number; // marcos-equivalentes por turno
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

// Capacidad de una estacion en marcos-equivalentes por turno.
export function stationCapacity(s: Station): number {
  return s.people * s.ratePerPersonHour * s.hours;
}

// Evalua todo el sistema para un conjunto de estaciones y parametros.
export function evaluate(
  stations: Station[],
  params: GlobalParams
): SimulationResult {
  const caps = stations.map(stationCapacity);
  const systemCapacity = Math.min(...caps);

  // La materia prima puede ser un limite adicional.
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
// Cada capacidad coincide con la columna "Marco" del analisis:
//   Roladora 855 · Troquel Cab 960 · Troquel Bis 960 ·
//   Troquel Emb 960 · Remachadora 900 · Pintura 840 · Embolsado 900
// ============================================================
export function defaultStations(): Station[] {
  return [
    {
      id: "roladora",
      name: "Roladora",
      people: 1,
      ratePerPersonHour: 90,
      hours: 9.5,
      x: 110,
      y: 180,
      fill: "#94C11C",
      handles: ["cabezal", "bisagra", "embutido"],
    },
    {
      id: "troquel-cabezal",
      name: "Troquel Cabezal",
      people: 2,
      ratePerPersonHour: 60,
      hours: 8,
      x: 290,
      y: 80,
      fill: "#1C1C1A",
      handles: ["cabezal"],
    },
    {
      id: "troquel-bisagra",
      name: "Troquel Bisagra",
      people: 1,
      ratePerPersonHour: 240,
      hours: 4,
      x: 290,
      y: 180,
      fill: "#1C1C1A",
      handles: ["bisagra"],
    },
    {
      id: "troquel-embutido",
      name: "Troquel Embutido",
      people: 1,
      ratePerPersonHour: 120,
      hours: 8,
      x: 290,
      y: 280,
      fill: "#1C1C1A",
      handles: ["embutido"],
    },
    {
      id: "remachadora",
      name: "Remachadora",
      people: 1,
      ratePerPersonHour: 180,
      hours: 5,
      x: 430,
      y: 180,
      fill: "#94C11C",
      handles: ["bisagra"],
    },
    {
      id: "pintura",
      name: "Pintura",
      people: 3,
      ratePerPersonHour: 40,
      hours: 7,
      x: 560,
      y: 180,
      fill: "#94C11C",
      handles: ["cabezal", "bisagra", "embutido"],
    },
    {
      id: "embolsado",
      name: "Embolsado",
      people: 2,
      ratePerPersonHour: 50,
      hours: 9,
      x: 680,
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
export const ROUTES: Record<PieceType, string[]> = {
  cabezal: ["roladora", "troquel-cabezal", "pintura", "embolsado"],
  bisagra: ["roladora", "troquel-bisagra", "remachadora", "pintura", "embolsado"],
  embutido: ["roladora", "troquel-embutido", "pintura", "embolsado"],
};

// Colores por tipo de pieza (para la animacion).
export const PIECE_COLORS: Record<PieceType, string> = {
  cabezal: "#94C11C",
  bisagra: "#1C1C1A",
  embutido: "#888780",
};
