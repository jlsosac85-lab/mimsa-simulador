// ============================================================
// Motor de simulacion de la linea de Marcos Metalicos - MIMSA
// Capacidad por estacion = marcos por hora (de la estacion) x horas.
// Las personas son SOLO informativas (suman al KPI de personal),
// no multiplican la capacidad.
//
// FLUJO (actualizado):
//   Roladora produce los dos largueros del marco.
//   - Bisagra:  Roladora -> Troquel Bisagra -> Pintura -> Remachadora -> Embolsado
//   - Embutido: Roladora -> Troquel Embutido -> Pintura -> Embolsado
//   (El cabezal se omite del flujo visual para mantenerlo limpio.)
//   Es decir: Pintura recibe el 100% de las piezas. Despues de pintar,
//   solo el larguero-bisagra pasa por Remachadora; el resto queda en
//   standby hasta que la bisagra termina, y entonces el juego completo
//   se va a Embolsado.
// ============================================================

export type PieceType = "bisagra" | "embutido";

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

export function stationCapacity(s: Station): number {
  return s.ratePerHour * s.hours;
}

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
// Configuracion estandar — base de operacion actual de MIMSA.
// Linea balanceada: todas las estaciones a 990 marcos/turno.
//   Roladora        2 pers · 90/h  · 11 h    = 990  (cuello)
//   Troquel Bisagra 1 pers · 240/h · 4.125 h = 990
//   Troquel Embut.  1 pers · 240/h · 4.125 h = 990
//   Pintura         4 pers · 120/h · 8.25 h  = 990
//   Remachadora     1 pers · 180/h · 5.5 h   = 990
//   Embolsado       2 pers · 100/h · 9.9 h   = 990
// ============================================================
export function defaultStations(): Station[] {
  return [
    {
      id: "roladora",
      name: "Roladora",
      people: 2,
      ratePerHour: 90,
      hours: 11,
      x: 120,
      y: 180,
      fill: "#94C11C",
      handles: ["bisagra", "embutido"],
    },
    {
      id: "troquel-bisagra",
      name: "Troquel Bisagra",
      people: 1,
      ratePerHour: 240,
      hours: 4.125,
      x: 290,
      y: 100,
      fill: "#1C1C1A",
      handles: ["bisagra"],
    },
    {
      id: "troquel-embutido",
      name: "Troquel Embutido",
      people: 1,
      ratePerHour: 240,
      hours: 4.125,
      x: 290,
      y: 260,
      fill: "#1C1C1A",
      handles: ["embutido"],
    },
    {
      id: "pintura",
      name: "Pintura",
      people: 4,
      ratePerHour: 120,
      hours: 8.25,
      x: 445,
      y: 180,
      fill: "#94C11C",
      handles: ["bisagra", "embutido"],
    },
    {
      id: "remachadora",
      name: "Remachadora",
      people: 1,
      ratePerHour: 180,
      hours: 5.5,
      x: 590,
      y: 95,
      fill: "#94C11C",
      handles: ["bisagra"],
    },
    {
      id: "embolsado",
      name: "Embolsado",
      people: 2,
      ratePerHour: 100,
      hours: 9.9,
      x: 705,
      y: 180,
      fill: "#94C11C",
      handles: ["bisagra", "embutido"],
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

// Rutas de cada tipo de pieza. Pintura va ANTES que Remachadora:
// se pinta el 100%, luego solo la bisagra se remacha, y todo se embolsa.
export const ROUTES: Record<PieceType, string[]> = {
  bisagra: ["roladora", "troquel-bisagra", "pintura", "remachadora", "embolsado"],
  embutido: ["roladora", "troquel-embutido", "pintura", "embolsado"],
};

// Deriva las conexiones (flechas) del flujo a partir de las rutas.
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

export const PIECE_COLORS: Record<PieceType, string> = {
  bisagra: "#1C1C1A",
  embutido: "#888780",
};
