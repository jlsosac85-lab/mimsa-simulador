"use client";

import { useEffect, useRef } from "react";
import {
  Station,
  PieceType,
  ProductionLine,
  stationCapacity,
  deriveEdges,
} from "@/lib/simulation";

type StartMode = "carga" | "transitorio";

interface Props {
  line: ProductionLine;
  stations: Station[];
  target: number;
  systemCapacity: number;
  running: boolean;
  speed: number;
  mode: StartMode;
  onTick: (state: { hour: number; completed: number; wip: number }) => void;
}

interface Pt {
  x: number;
  y: number;
}
interface Curve {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

interface Piece {
  id: number;
  type: PieceType;
  stationId: string;
  slot: number;
  total: number;
  stage: number;
  x: number;
  y: number;
  t: number;
  state: "queue" | "serve" | "exit" | "toPallet" | "travel" | "flowOut" | "waitCount";
  serviceTime: number;
  cv: Curve | null;
  edgeT: number;
  edgeLen: number;
  counted: boolean;
  el: SVGCircleElement;
}

interface StatBucket {
  busy: number;
  queue: Piece[];
  serving: Piece | null;
}

const TURN_HOURS = 11;
const BATCH = 90;
const PALLET_SIZE = 330;
const TRAVEL_SPEED = 520;

// Paleta KPI (estaciones)
const KPI_DARK = "#1C1C1A";
const KPI_GREEN = "#94C11C";

// Oscurece un color hex (para el borde sombreado de las esferas, sin recurrir
// al negro: así las bolitas se ven volumétricas también sobre fondo claro).
function darken(hex: string, f: number): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `rgb(${r},${g},${b})`;
}

// Operario isométrico simple: casco verde MIMSA + chaleco hi-vis ámbar.
// Dibujado en origen local (pies en 0,0) y colocado/escalado por transform.
function WorkerGlyph({ cx, by, delay, scale = 1 }: { cx: number; by: number; delay: number; scale?: number }) {
  return (
    <g transform={`translate(${cx},${by}) scale(${scale})`}>
      <g className="op-bob" style={{ animationDelay: `${delay}s` }}>
        {/* sombra */}
        <ellipse cx={0} cy={0} rx={3.6} ry={1.3} fill="#1C1C1A" opacity="0.2" />
        {/* piernas */}
        <rect x={-2.3} y={-4.2} width={1.7} height={4.2} rx={0.6} fill="#37383A" />
        <rect x={0.6} y={-4.2} width={1.7} height={4.2} rx={0.6} fill="#37383A" />
        {/* chaleco / torso */}
        <rect x={-3.1} y={-9.8} width={6.2} height={6.2} rx={1.5} fill="#EF9F27" stroke="#8a5b12" strokeWidth={0.4} />
        {/* franja reflejante */}
        <rect x={-3.1} y={-7.1} width={6.2} height={1.1} fill="#fff7e0" opacity="0.85" />
        {/* brazos insinuados */}
        <rect x={-3.7} y={-9} width={1.1} height={4} rx={0.5} fill="#d98e1f" />
        <rect x={2.6} y={-9} width={1.1} height={4} rx={0.5} fill="#d98e1f" />
        {/* cabeza */}
        <circle cx={0} cy={-11.7} r={1.95} fill="#E7C9A3" stroke="#2C2C2A" strokeWidth={0.3} />
        {/* casco */}
        <path d={`M -2.5 -11.9 a 2.5 2.6 0 0 1 5 0 z`} fill="#94C11C" stroke="#5c7a10" strokeWidth={0.3} />
        <rect x={-2.9} y={-12.1} width={5.8} height={1} rx={0.5} fill="#6F9213" />
      </g>
    </g>
  );
}

// Cuadrilla: tantos operarios como personas tenga la estación (máx visible 6).
function Crew({ cx, by, n }: { cx: number; by: number; n: number }) {
  const vis = Math.min(n, 6);
  if (vis <= 0) return null;
  const gap = 9.5;
  const startX = cx - ((vis - 1) * gap) / 2;
  return (
    <g>
      {Array.from({ length: vis }).map((_, i) => (
        <WorkerGlyph key={i} cx={startX + i * gap} by={by} delay={(i % 4) * 0.35} scale={1.35} />
      ))}
    </g>
  );
}

// Caras de una caja isométrica anclada por su base trasera-inferior (cx,cyBase).
function isoFaces(cx: number, cyBase: number, a: number, b: number, H: number) {
  const cyTop = cyBase - H;
  return {
    top: `${cx},${cyTop - b} ${cx + a},${cyTop} ${cx},${cyTop + b} ${cx - a},${cyTop}`,
    left: `${cx - a},${cyTop} ${cx},${cyTop + b} ${cx},${cyBase + b} ${cx - a},${cyBase}`,
    right: `${cx},${cyTop + b} ${cx + a},${cyTop} ${cx + a},${cyBase} ${cx},${cyBase + b}`,
  };
}

function IsoBox({
  cx, cyBase, a, b, H, t, l, r, topId, stroke, sw,
}: {
  cx: number; cyBase: number; a: number; b: number; H: number;
  t: string; l: string; r: string; topId?: string; stroke?: string; sw?: number;
}) {
  const f = isoFaces(cx, cyBase, a, b, H);
  return (
    <>
      <polygon points={f.left} fill={l} />
      <polygon points={f.right} fill={r} />
      <polygon
        points={f.top}
        fill={t}
        {...(topId ? { id: topId } : {})}
        {...(stroke ? { stroke, strokeWidth: sw ?? 1, strokeLinejoin: "round" } : {})}
      />
    </>
  );
}

// Clasifica la estación por su nombre para darle una herramienta distintiva.
function machineKind(name: string): "saw" | "drill" | "press" | "paint" | "table" {
  const n = name.toLowerCase();
  if (n.includes("corte") || n.includes("sierra") || n.includes("escuadr")) return "saw";
  if (n.includes("orific") || n.includes("taladr") || n.includes("perfor") || n.includes("broca")) return "drill";
  if (n.includes("pint")) return "paint";
  if (n.includes("pegad") || n.includes("prensa") || n.includes("armad") || n.includes("ensam") || n.includes("union")) return "press";
  return "table";
}

// Máquina/puesto de trabajo isométrico ilustrado para una estación.
function StationMachine({ s, matFill }: { s: Station; matFill: string }) {
  const cx = s.x;
  const y = s.y;
  const kind = machineKind(s.name);
  const matPts = `${cx},${y + 30 - 18} ${cx + 44},${y + 30} ${cx},${y + 30 + 18} ${cx - 44},${y + 30}`;
  return (
    <g>
      {/* tapete de piso */}
      <polygon points={matPts} fill={matFill} stroke="#C7DC8A" strokeWidth="1.5" strokeLinejoin="round" />
      {/* sombra de contacto */}
      <ellipse cx={cx} cy={y + 32} rx={28} ry={8.5} fill="#1C1C1A" opacity="0.14" />
      {/* cuerpo de la máquina (acero) */}
      <IsoBox cx={cx} cyBase={y + 20} a={26} b={10} H={18} t="#C2C6CC" l="#8E949B" r="#6C7178" />
      {/* base/zócalo oscuro */}
      <IsoBox cx={cx} cyBase={y + 26} a={28} b={11} H={6} t="#6C7178" l="#4c5057" r="#3a3d42" />
      {/* panel de control con luz verde */}
      <IsoBox cx={cx + 21} cyBase={y + 18} a={5.5} b={4} H={14} t="#23262b" l="#16181c" r="#0e0f12" />
      <circle cx={cx + 21} cy={y + 2.5} r={2.4} fill="#94C11C" stroke="#3f5610" strokeWidth="0.8" />
      {/* superficie de trabajo (lleva el id de alerta del cuello) */}
      <IsoBox cx={cx} cyBase={y + 2} a={28} b={11} H={4} t="#D7DBE0" l="#AEB4BB" r="#9298A0"
        topId={`cube-top-${s.id}`} stroke={KPI_GREEN} sw={1.3} />
      {/* herramienta distintiva según el tipo de estación */}
      {kind === "saw" && (
        <g>
          <circle cx={cx - 7} cy={y - 8} r={8} fill="#cfd3d8" stroke="#8a9097" strokeWidth="1" />
          <circle cx={cx - 7} cy={y - 8} r={8} fill="none" stroke="#9aa0a6" strokeWidth="1.2" strokeDasharray="2.4 2.4" />
          <circle cx={cx - 7} cy={y - 8} r={2} fill="#6c7178" />
          <rect x={cx - 10} y={y - 1} width={22} height={2} rx={1} fill="#3a3d42" opacity="0.55" />
        </g>
      )}
      {kind === "drill" && (
        <g>
          <rect x={cx + 13} y={y - 27} width={3.5} height={29} rx={1} fill="#3a3d42" />
          <rect x={cx - 4} y={y - 27} width={20} height={4} rx={1.5} fill="#4a4d52" />
          <rect x={cx - 4} y={y - 23} width={4} height={10} rx={1} fill="#2b2d30" />
          <rect x={cx - 2.7} y={y - 14} width={1.6} height={7} fill="#9aa0a6" />
          <circle cx={cx - 1.9} cy={y - 6} r={1.3} fill="#94C11C" />
        </g>
      )}
      {kind === "press" && (
        <g>
          <rect x={cx - 17} y={y - 25} width={3} height={25} rx={1} fill="#3a3d42" />
          <rect x={cx + 14} y={y - 25} width={3} height={25} rx={1} fill="#3a3d42" />
          <IsoBox cx={cx} cyBase={y - 15} a={20} b={8} H={6} t="#5a5f66" l="#3f444b" r="#2b2f34" />
        </g>
      )}
      {kind === "paint" && (
        <g>
          <rect x={cx + 12} y={y - 23} width={3} height={23} rx={1} fill="#3a3d42" />
          <rect x={cx - 3} y={y - 21} width={17} height={3.5} rx={1.5} fill="#4a4d52" />
          <rect x={cx - 6} y={y - 20.5} width={4.5} height={5} rx={1} fill="#6c7178" />
          <circle cx={cx - 7} cy={y - 14} r={2.2} fill="#94C11C" />
          <circle cx={cx - 10} cy={y - 10} r={1.2} fill="#B6D94E" opacity="0.7" />
          <circle cx={cx - 12} cy={y - 7} r={1} fill="#B6D94E" opacity="0.5" />
        </g>
      )}
    </g>
  );
}

// Montacargas isométrico (cuerpo ámbar, mástil, horquillas con tarima verde,
// operario y techo de protección). Anclado por el suelo (origen local = piso).
function Forklift({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx={4} cy={7} rx={42} ry={11} fill="#1C1C1A" opacity="0.15" />
      {/* ruedas */}
      <ellipse cx={-15} cy={5} rx={9} ry={5.2} fill="#26282b" />
      <ellipse cx={-15} cy={5} rx={4} ry={2.4} fill="#53575c" />
      <ellipse cx={13} cy={6.5} rx={7} ry={4.2} fill="#26282b" />
      <ellipse cx={13} cy={6.5} rx={3} ry={1.8} fill="#53575c" />
      {/* contrapeso / cuerpo */}
      <IsoBox cx={-13} cyBase={2} a={17} b={11} H={17} t="#F2AE3E" l="#CC8A20" r="#A86E15" />
      <rect x={-29} y={-5} width={33} height={2.6} rx={1} fill="#1C1C1A" opacity="0.22" />
      {/* techo de protección */}
      <rect x={-27} y={-40} width={2.4} height={26} rx={1} fill="#2b2d30" />
      <rect x={1} y={-40} width={2.4} height={26} rx={1} fill="#2b2d30" />
      <IsoBox cx={-13} cyBase={-39} a={17} b={11} H={3} t="#3a3d42" l="#2a2c30" r="#1f2125" />
      {/* operario */}
      <g transform="translate(-13,-15)"><WorkerGlyph cx={0} by={0} delay={0.2} /></g>
      {/* mástil */}
      <rect x={19} y={-33} width={3} height={39} rx={1} fill="#34373c" />
      <rect x={25} y={-33} width={3} height={39} rx={1} fill="#34373c" />
      {/* carro de horquillas: sube/baja para depositar en el camión */}
      <g className="fork-lift">
        <polygon points="14,4 36,4 36,6 14,6" fill="#3a3d42" />
        {/* tarima con producto verde: aparece al recoger, desaparece al depositar */}
        <g className="fork-load">
          <IsoBox cx={35} cyBase={1} a={12} b={7} H={4} t="#C0894B" l="#9C6A34" r="#7E5328" />
          <IsoBox cx={35} cyBase={-3} a={10} b={6} H={11} t="#B6D94E" l="#94C11C" r="#6F9213" />
        </g>
      </g>
    </g>
  );
}

// Camión de embarque isométrico (caja blanca con franja verde MIMSA + cabina
// verde). Anclado por el suelo. Mira hacia la derecha (salida).
function Truck({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx={-4} cy={9} rx={88} ry={15} fill="#1C1C1A" opacity="0.15" />
      {/* ruedas */}
      {[-54, -32, 46].map((wx, i) => (
        <g key={i}>
          <ellipse cx={wx} cy={7} rx={10} ry={6} fill="#222427" />
          <ellipse cx={wx} cy={7} rx={4.5} ry={2.8} fill="#53575c" />
        </g>
      ))}
      {/* chasis */}
      <IsoBox cx={-10} cyBase={3} a={62} b={22} H={6} t="#3a3d42" l="#26282b" r="#1c1e21" />
      {/* caja / trailer */}
      <IsoBox cx={-18} cyBase={-3} a={48} b={22} H={36} t="#EEF0EA" l="#CDD2C8" r="#AEB4A8" />
      {/* franja verde MIMSA sobre el costado del trailer */}
      <polygon points="-18,-2.9 30,-24.9 30,-19.9 -18,2.1" fill="#94C11C" opacity="0.95" />
      {/* puerta trasera (líneas) */}
      <line x1={-18} y1={-18} x2={-18} y2={18} stroke="#AEB4A8" strokeWidth="1" />
      {/* cabina */}
      <IsoBox cx={52} cyBase={-1} a={16} b={16} H={26} t="#A6CE3A" l="#7AA31E" r="#5D7F16" />
      {/* parabrisas */}
      <polygon points="52,-13 68,-27 68,-19 52,-5" fill="#2b3a44" opacity="0.85" />
      {/* defensa */}
      <polygon points="68,-2 74,1 74,5 68,4" fill="#2b2d30" />
    </g>
  );
}

// Cubo isometrico de estacion
const ST_A = 32;
const ST_B = 15;
const ST_H = 32;
// Apilado interno de ocupacion dentro de la estacion
const ESTACK = { nx: 3, ny: 3, nz: 3, stepX: 6, stepY: 3, stepZ: 6.2, r: 2.3 };
const ST_CAP = ESTACK.nx * ESTACK.ny * ESTACK.nz;

// Zona de tarimas
const LEGEND_Y = 322;
const TITLE_Y = 348;
const PALLET_TOP = 366;
const PAL_SLOT = 168;
const PAL_ROW_H = 138;
const PAL_PER_ROW = 4;
const PSTACK = { nx: 3, ny: 3, nz: 5, stepX: 7.5, stepY: 3.6, stepZ: 6.4, r: 3.1 };
const PAL_CAP = PSTACK.nx * PSTACK.ny * PSTACK.nz;
const DOCK_H = 172; // muelle de embarque al fondo (almacén · montacargas · camión)
const LOAD_CAP = 18; // unidades visibles cargándose en el camión

function palletCount(target: number, palletSize: number): number {
  return Math.max(1, Math.ceil(target / palletSize));
}

function palletGeom(i: number, n: number) {
  const per = Math.min(Math.max(n, 1), PAL_PER_ROW);
  const rowW = per * PAL_SLOT;
  const startX = (760 - rowW) / 2 + PAL_SLOT / 2;
  const col = i % per;
  const row = Math.floor(i / per);
  const cx = startX + col * PAL_SLOT;
  const baseY = PALLET_TOP + 70 + row * PAL_ROW_H;
  return { cx, baseY };
}

// Y donde termina la cuadrícula de tarimas (antes del muelle de embarque).
function palletsBottomY(target: number, palletSize: number): number {
  const rows = Math.ceil(palletCount(target, palletSize) / PAL_PER_ROW);
  return PALLET_TOP + 70 + (rows - 1) * PAL_ROW_H + 78;
}

function viewBoxHeight(target: number, palletSize: number): number {
  return palletsBottomY(target, palletSize) + DOCK_H;
}

function isoStack(
  cx: number,
  baseY: number,
  cfg: { nx: number; ny: number; nz: number; stepX: number; stepY: number; stepZ: number }
) {
  const { nx, ny, nz, stepX, stepY, stepZ } = cfg;
  const cells: { x: number; y: number; fo: number }[] = [];
  let fo = 0;
  for (let k = 0; k < nz; k++) {
    const layer: { x: number; y: number; depth: number }[] = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = cx + (i - j) * stepX;
        const y = baseY - k * stepZ + (i + j - (nx + ny - 2)) * stepY;
        layer.push({ x, y, depth: i + j });
      }
    }
    layer.sort((a, b) => a.depth - b.depth);
    layer.forEach((c) => cells.push({ x: c.x, y: c.y, fo: fo++ }));
  }
  return cells;
}

function cubeFaces(cx: number, cy: number, a: number, b: number, H: number) {
  const tcy = cy - H / 2;
  return {
    top: `${cx},${tcy - b} ${cx + a},${tcy} ${cx},${tcy + b} ${cx - a},${tcy}`,
    left: `${cx - a},${tcy} ${cx},${tcy + b} ${cx},${tcy + b + H} ${cx - a},${tcy + H}`,
    right: `${cx},${tcy + b} ${cx + a},${tcy} ${cx + a},${tcy + H} ${cx},${tcy + b + H}`,
  };
}

function bezier(c: Curve, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.p1.x + 3 * u * t * t * c.p2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.p1.y + 3 * u * t * t * c.p2.y + t * t * t * c.p3.y,
  };
}

function bezierLen(c: Curve): number {
  let len = 0;
  let prev = c.p0;
  for (let i = 1; i <= 14; i++) {
    const pt = bezier(c, i / 14);
    len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return Math.max(1, len);
}

function curveH(x1: number, y1: number, x2: number, y2: number): Curve {
  const c = Math.max(24, Math.abs(x2 - x1) * 0.4);
  return {
    p0: { x: x1, y: y1 },
    p1: { x: x1 + c, y: y1 },
    p2: { x: x2 - c, y: y2 },
    p3: { x: x2, y: y2 },
  };
}

// Curva del embolsado a la tarima activa (baja por la derecha, evita textos).
function arrowToPallet(x1: number, y1: number, cx: number, baseY: number): Curve {
  const top = baseY - PSTACK.nz * PSTACK.stepZ - 14;
  const chY = baseY - PSTACK.nz * PSTACK.stepZ - 42;
  return {
    p0: { x: x1, y: y1 },
    p1: { x: x1, y: chY },
    p2: { x: cx, y: chY },
    p3: { x: cx, y: top },
  };
}
function curveStr(c: Curve): string {
  return `M ${c.p0.x} ${c.p0.y} C ${c.p1.x} ${c.p1.y}, ${c.p2.x} ${c.p2.y}, ${c.p3.x} ${c.p3.y}`;
}

export function PlantLayout({
  line,
  stations,
  target,
  systemCapacity,
  running,
  speed,
  mode,
  onTick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);

  const lineRef = useRef(line);
  const stationsRef = useRef(stations);
  const targetRef = useRef(target);
  const capacityRef = useRef(systemCapacity);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const modeRef = useRef(mode);
  const nPalletsRef = useRef(palletCount(target, line.palletSize));

  const simRef = useRef({
    pieces: [] as Piece[],
    pieceId: 0,
    simTime: 0,
    completed: 0,
    nextArrival: 0,
    arrivalCount: 0,
    stats: {} as Record<string, StatBucket>,
    buffer: {} as Record<string, number>,
    lastTick: 0,
    rafId: 0,
  });

  lineRef.current = line;
  stationsRef.current = stations;
  targetRef.current = target;
  capacityRef.current = systemCapacity;
  speedRef.current = speed;
  modeRef.current = mode;
  nPalletsRef.current = palletCount(target, line.palletSize);

  function resetStats() {
    const stats: Record<string, StatBucket> = {};
    stationsRef.current.forEach((s) => {
      stats[s.id] = { busy: 0, queue: [], serving: null };
    });
    simRef.current.stats = stats;
  }
  if (Object.keys(simRef.current.stats).length === 0) resetStats();

  function stationById(id: string): Station | undefined {
    return stationsRef.current.find((s) => s.id === id);
  }

  function makePiece(type: PieceType): Piece {
    const sim = simRef.current;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", "4.3");
    c.setAttribute("fill", "url(#sphere-green)");
    c.setAttribute("stroke", "none");
    layerRef.current?.appendChild(c);
    return {
      id: ++sim.pieceId,
      type,
      stationId: "",
      slot: 0,
      total: 1,
      stage: 0,
      x: 0,
      y: 0,
      t: 0,
      state: "queue",
      serviceTime: 0,
      cv: null,
      edgeT: 0,
      edgeLen: 1,
      counted: false,
      el: c,
    };
  }

  function setPos(p: Piece, x: number, y: number) {
    p.x = x;
    p.y = y;
    p.el.setAttribute("cx", String(x));
    p.el.setAttribute("cy", String(y));
  }
  function removePiece(p: Piece) {
    p.el.parentNode?.removeChild(p.el);
  }

  
  function servePos(s: Station): Pt {
    return { x: s.x, y: s.y - ST_H / 2 };
  }

  // Separacion vertical de cada tipo de pieza (para no encimar bolitas
  // de tipos distintos en colas y llegadas). Centrado segun pieceTypes.
  function typeOffset(type: string): number {
    // En líneas de vía paralela (modo "or") las piezas son el mismo producto:
    // no se separan por tipo. La división se ve por la bifurcación física
    // hacia las estaciones de cada rama (Mesa 1 arriba / Mesa 2 abajo).
    if (lineRef.current.assembly === "or") return 0;
    const types = lineRef.current.pieceTypes;
    const idx = types.indexOf(type);
    const n = types.length;
    return (idx - (n - 1) / 2) * 6;
  }

  function setTravel(p: Piece, cv: Curve) {
    p.cv = cv;
    p.edgeT = 0;
    p.edgeLen = bezierLen(cv);
    p.state = "travel";
  }

  function advance(p: Piece, dt: number): boolean {
    if (!p.cv) return true;
    p.edgeT += (TRAVEL_SPEED * dt) / p.edgeLen;
    if (p.edgeT >= 1) p.edgeT = 1;
    const pt = bezier(p.cv, p.edgeT);
    setPos(p, pt.x, pt.y);
    return p.edgeT >= 1;
  }

  function clearAll() {
    const sim = simRef.current;
    sim.pieces.forEach(removePiece);
    sim.pieces = [];
    sim.pieceId = 0;
    sim.simTime = 0;
    sim.completed = 0;
    sim.nextArrival = 0;
    sim.buffer = {};
    resetStats();
  }

  function loadStations() {
    clearAll();
    const sim = simRef.current;
    const types = lineRef.current.pieceTypes;
    // Arranque CALIENTE (línea saturada): se coloca 1 pieza de cada tipo en
    // cada etapa de su ruta, de modo que todas las estaciones trabajan desde
    // t=0 (régimen permanente, sin rampa de llenado). La alimentación continua
    // de stepTransitorio mantiene la línea llena. Así la producción crece al
    // ritmo del cuello desde el inicio y llega a ~capacidad al cierre del turno.
    types.forEach((type) => {
      const route = lineRef.current.routes[type] || [];
      route.forEach((stId, stage) => {
        const s = stationById(stId);
        const st = sim.stats[stId];
        if (!s || !st) return;
        const p = makePiece(type);
        p.stage = stage;
        p.state = "queue";
        const idx = st.queue.length;
        const dx = s.x - ST_A - 10 - (idx % 6) * 5;
        const dy = s.y + Math.floor(idx / 6) * 5 + typeOffset(type);
        setPos(p, dx, dy);
        st.queue.push(p);
        sim.pieces.push(p);
      });
    });
    paint();
  }

  function prepare() {
    // Solo se limpia el plano. En modo "carga" el material se inyecta al
    // arrancar (useEffect de running), cuando las estaciones, las rutas y el
    // objetivo ya están sincronizados, evitando el desfase que dejaba piezas
    // viajando hacia estaciones aún inexistentes.
    clearAll();
    paint();
  }

  function startServe(s: Station, st: StatBucket, p: Piece) {
    st.serving = p;
    p.state = "serve";
    p.t = 0;
    const mult = lineRef.current.assembly === "and" ? (s.handles.length || 1) : 1;
    const effRate = s.ratePerHour * mult;
    p.serviceTime = effRate > 0 ? lineRef.current.ballUnits / effRate : 999;
  }

  function activePalletGeom() {
    const sim = simRef.current;
    const nPal = nPalletsRef.current;
    return palletGeom(Math.min(nPal - 1, Math.floor(sim.completed / lineRef.current.palletSize)), nPal);
  }

  function stepTransitorio(dt: number) {
    const sim = simRef.current;
    sim.simTime += dt;
    const t = sim.simTime;
    const tgt = targetRef.current;

    // Alimentación continua de materia prima. En "carga" sobrealimentamos
    // (×1.4 sobre el ritmo del cuello) para que el cuello JAMÁS quede sin
    // material: el excedente se acumula como cola justo antes del cuello —lo
    // hace visible— y la producción alcanza el ritmo real del cuello. En
    // "transitorio" la materia entra justo al ritmo del objetivo (rampa de
    // llenado en frío).
    const feedFactor = modeRef.current === "carga" ? 1.4 : 1;
    const arrivalsPerHour = (tgt / TURN_HOURS / lineRef.current.ballUnits) * feedFactor;
    const arrivalInterval = arrivalsPerHour > 0 ? 1 / arrivalsPerHour : Infinity;
    const types = lineRef.current.pieceTypes;
    const andMode = lineRef.current.assembly === "and";
    const spawn = (type: string) => {
      const route = lineRef.current.routes[type] || [];
      const first = route.length ? stationById(route[0]) : null;
      if (!first) return;
      const oy = 180 + typeOffset(type);
      const p = makePiece(type);
      p.stage = 0;
      setPos(p, 60, oy);
      setTravel(p, curveH(60, oy, first.x - ST_A, first.y));
      sim.pieces.push(p);
    };
    while (t >= sim.nextArrival && t < TURN_HOURS) {
      if (andMode) {
        // ensamble: cada llegada aporta 1 de cada tipo (se emparejan al final)
        types.forEach(spawn);
      } else {
        // vias paralelas 50/50: una bolita por llegada, alternando tipo
        spawn(types[sim.arrivalCount % types.length]);
        sim.arrivalCount++;
      }
      sim.nextArrival += arrivalInterval;
    }

    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (st && st.serving) st.busy += dt;
    });

    for (let i = sim.pieces.length - 1; i >= 0; i--) {
      const p = sim.pieces[i];
      const route = lineRef.current.routes[p.type] || [];

      if (p.state === "toPallet") {
        // viaje decorativo a la tarima; la pieza YA quedó contabilizada al
        // salir de la última estación. Al llegar solo se retira de la escena.
        if (advance(p, dt)) {
          if (!p.counted && !countProduction(p)) {
            continue; // seguridad: el tope la retiene, reintenta el próximo tick
          }
          p.counted = true;
          removePiece(p);
          sim.pieces.splice(i, 1);
        }
        continue;
      }
      if (p.state === "waitCount") {
        // terminó la última estación pero el tope del cuello aún no permite
        // contarla; espera junto a la salida y reintenta cada tick.
        const lastId = route[route.length - 1];
        const last =
          stationById(lastId) || stationsRef.current[stationsRef.current.length - 1];
        if (countProduction(p)) {
          p.counted = true;
          const g = activePalletGeom();
          setTravel(p, arrowToPallet(last.x, last.y + ST_B, g.cx, g.baseY));
          p.state = "toPallet";
        } else if (last) {
          setPos(p, last.x, last.y + ST_B);
        }
        continue;
      }
      if (p.stage >= route.length) {
        // fallback: pieza sin etapa pendiente que aún no pasó por el conteo
        const lastId = route[route.length - 1];
        const last =
          stationById(lastId) || stationsRef.current[stationsRef.current.length - 1];
        if (countProduction(p)) {
          p.counted = true;
          const g = activePalletGeom();
          setTravel(p, arrowToPallet(last.x, last.y + ST_B, g.cx, g.baseY));
          p.state = "toPallet";
        } else {
          p.state = "waitCount";
        }
        continue;
      }

      const s = stationById(route[p.stage]);
      if (!s) continue;
      const st = sim.stats[s.id];
      if (!st) continue;

      if (p.state === "travel") {
        if (advance(p, dt)) {
          p.state = "queue";
          st.queue.push(p);
        }
      } else if (p.state === "queue") {
        const idx = st.queue.indexOf(p);
        const dx = s.x - ST_A - 10 - (idx % 6) * 5;
        const offset = typeOffset(p.type);
        const dy = s.y + Math.floor(idx / 6) * 5 + offset;
        setPos(p, dx, dy);
      } else if (p.state === "serve") {
        const sp = servePos(s);
        setPos(p, sp.x, sp.y);
        p.t += dt;
        if (p.t >= p.serviceTime) {
          const carry = p.t - p.serviceTime; // tiempo sobrante del ciclo
          st.serving = null;
          p.stage++;
          if (p.stage < route.length) {
            const to = stationById(route[p.stage])!;
            setTravel(p, curveH(s.x + ST_A, s.y, to.x - ST_A, to.y));
          } else {
            // salió de la ÚLTIMA estación: contabilizar AQUÍ, sin esperar el
            // viaje a la tarima (que pasa a ser puramente animación). Esto
            // elimina la latencia del tramo final y la producción crece al
            // ritmo real del cuello.
            if (countProduction(p)) {
              p.counted = true;
              const g = activePalletGeom();
              setTravel(p, arrowToPallet(s.x, s.y + ST_B, g.cx, g.baseY));
              p.state = "toPallet";
            } else {
              p.state = "waitCount";
            }
          }
          // Encadenar de inmediato la siguiente pieza de la cola heredando el
          // tiempo sobrante: así la estación no pierde fracciones de ciclo y su
          // throughput es el ritmo real (independiente de la velocidad de la
          // animación).
          if (st.queue.length > 0) {
            const nb = st.queue.shift()!;
            startServe(s, st, nb);
            nb.t = carry;
          }
        }
      }
    }

    // Despacho: en cuanto una estación queda libre, toma de inmediato la
    // siguiente pieza de su cola (FIFO). Hacerlo en una pasada aparte —y no
    // dentro del recorrido de piezas— evita los huecos que dependían del orden
    // de iteración y que mantenían el throughput por debajo del ritmo real del
    // cuello de botella.
    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (st && !st.serving && st.queue.length > 0) {
        startServe(s, st, st.queue.shift()!);
      }
    });
  }

  // Aplica el tope del cuello y suma a la producción si cabe, SIN remover la
  // pieza. Devuelve true si la pieza ya quedó contabilizada (o aportada al
  // buffer de ensamble), false si el tope la retiene y debe reintentar.
  function countProduction(p: Piece): boolean {
    const sim = simRef.current;
    const ballU = lineRef.current.ballUnits;
    // Tope por cuello de botella: la producción acumulada nunca supera la
    // capacidad del sistema escalada por el tiempo del turno (capacidad × t/11),
    // con techo absoluto en la capacidad del turno. Lo que queda en la línea al
    // cierre es trabajo en proceso (WIP), no producto terminado.
    const capLimit = capacityRef.current * Math.min(1, sim.simTime / TURN_HOURS);

    if (lineRef.current.assembly === "or") {
      // cada bolita terminada es producto terminado
      if (sim.completed + ballU > capLimit + 1e-6) return false; // retener
      sim.completed += ballU;
      return true;
    }
    // ensamble: se requiere 1 de cada tipo para completar el lote. La pieza
    // aporta al buffer siempre; solo el CONTEO respeta el tope del cuello.
    sim.buffer[p.type] = (sim.buffer[p.type] || 0) + 1;
    const types = lineRef.current.pieceTypes;
    while (
      types.every((tp) => (sim.buffer[tp] || 0) > 0) &&
      sim.completed + ballU <= capLimit + 1e-6
    ) {
      types.forEach((tp) => (sim.buffer[tp] = (sim.buffer[tp] || 0) - 1));
      sim.completed += ballU;
    }
    return true;
  }

  function paint() {
    const sim = simRef.current;
    const svg = svgRef.current;
    if (!svg) return;
    const isCarga = modeRef.current === "carga";

    let bnId: string | null = null;
    let bnVal = -1;

    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (!st) return;
      const elapsed = Math.min(sim.simTime, TURN_HOURS);
      const util = elapsed > 0 ? (st.busy / elapsed) * 100 : 0;
      const utilC = Math.min(100, Math.max(0, util));
      const pend = st.queue.length + (st.serving ? 1 : 0);

      const qEl = svg.querySelector(`#q-${s.id}`);
      const uEl = svg.querySelector(`#u-${s.id}`);
      if (qEl) qEl.textContent = String(pend);
      if (uEl) uEl.textContent = `${Math.round(utilC)}%`;

      // Llenado interno por ocupacion
      const nShow = Math.round((utilC / 100) * ST_CAP);
      const occ = svg.querySelectorAll(`[data-st="${s.id}"]`);
      occ.forEach((node) => {
        const fo = Number((node as SVGElement).getAttribute("data-fo"));
        (node as SVGElement).setAttribute("opacity", fo < nShow ? "1" : "0");
      });

      const metric = isCarga ? pend : st.queue.length;
      if (metric > bnVal && sim.simTime > 0.2) {
        bnVal = metric;
        bnId = s.id;
      }

      const topEl = svg.querySelector(`#cube-top-${s.id}`) as SVGPolygonElement | null;
      if (topEl && sim.simTime > 0.2) {
        const alert = isCarga ? utilC > 95 && pend > 1 : utilC > 90 && st.queue.length > 2;
        topEl.setAttribute("stroke", alert ? "#A32D2D" : utilC > 80 ? "#EF9F27" : KPI_GREEN);
        topEl.setAttribute("stroke-width", alert ? "2.4" : utilC > 80 ? "2" : "1.3");
      }
    });

    const nPal = nPalletsRef.current;
    let fullPallets = 0;
    for (let pi = 0; pi < nPal; pi++) {
      const palletSize = lineRef.current.palletSize;
      const fill = Math.max(0, Math.min(palletSize, sim.completed - pi * palletSize));
      if (fill >= palletSize) fullPallets++;
      const nShow = Math.round((fill / palletSize) * PAL_CAP);
      const nodes = svg.querySelectorAll(`[data-pal="${pi}"]`);
      nodes.forEach((node) => {
        const fo = Number((node as SVGElement).getAttribute("data-fo"));
        (node as SVGElement).setAttribute("opacity", fo < nShow ? "1" : "0");
      });
      const lbl = svg.querySelector(`#pallet-lbl-${pi}`);
      if (lbl) lbl.textContent = `${Math.round(fill)}/${lineRef.current.palletSize}`;
    }
    const sum = svg.querySelector("#pallet-summary");
    if (sum)
      sum.textContent = `Tarimas llenas: ${fullPallets}/${nPal} · ${sim.completed.toLocaleString(
        "es-MX"
      )} ${lineRef.current.unit} terminadas`;

    // Camión: producto cargado proporcional a las tarimas llenas.
    const nLoad = Math.round((fullPallets / Math.max(1, nPal)) * LOAD_CAP);
    svg.querySelectorAll("[data-load]").forEach((node) => {
      const fo = Number((node as SVGElement).getAttribute("data-load"));
      (node as SVGElement).setAttribute("opacity", fo < nLoad ? "1" : "0");
    });
    const tload = svg.querySelector("#truck-load");
    if (tload) tload.textContent = `Cargado: ${fullPallets}/${nPal}`;

    // Flecha que apunta a la tarima que se esta llenando
    const arrow = svg.querySelector("#pallet-arrow") as SVGPathElement | null;
    const lastR = lineRef.current.routes[lineRef.current.pieceTypes[0]] || [];
    const emb = lastR.length ? stationById(lastR[lastR.length - 1]) : undefined;
    if (arrow && emb) {
      const g = activePalletGeom();
      arrow.setAttribute("d", curveStr(arrowToPallet(emb.x, emb.y + ST_B, g.cx, g.baseY)));
    }

    const badge = svg.querySelector("#bn-badge") as SVGGElement | null;
    if (badge) {
      const show = bnId && bnVal > (isCarga ? 0 : 2) && sim.simTime > 0.2;
      if (show) {
        const s = stationById(bnId!);
        if (s) {
          const sp2 = s.name.indexOf(" ");
          const twoL = s.name.length > 11 && sp2 > 0;
          badge.style.display = "";
          const r = badge.querySelector("rect");
          const tx = badge.querySelector("text");
          const by = s.y - ST_H / 2 - ST_B - (twoL ? 26 : 18) - 17;
          r?.setAttribute("x", String(s.x - 60));
          r?.setAttribute("y", String(by));
          tx?.setAttribute("x", String(s.x));
          tx?.setAttribute("y", String(by + 13));
        }
      } else badge.style.display = "none";
    }

    onTick({ hour: sim.simTime, completed: sim.completed, wip: sim.pieces.length });
  }

  function loop(ts: number) {
    const sim = simRef.current;
    if (!runningRef.current) return;
    if (!sim.lastTick) sim.lastTick = ts;
    const real = (ts - sim.lastTick) / 1000;
    sim.lastTick = ts;
    const simDt = real * speedRef.current * 0.25;
    const sub = Math.max(1, Math.ceil(simDt / 0.05));
    for (let i = 0; i < sub; i++) {
      stepTransitorio(simDt / sub);
    }
    paint();
    // El turno dura TURN_HOURS (11 h). Al cerrar, lo que quede en la línea es
    // trabajo en proceso (WIP). Esto fija el corte en la hora 11 en ambos modos.
    const done = sim.simTime >= TURN_HOURS;
    if (done) runningRef.current = false;
    else sim.rafId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    runningRef.current = running;
    const sim = simRef.current;
    if (running) {
      // Al arrancar un turno nuevo (simTime 0) en modo carga, recargar siempre
      // para usar el objetivo/capacidad vigente (evita cargar con un valor
      // viejo si la config cambió justo antes de iniciar). Al reanudar desde
      // pausa (simTime > 0) se conserva el avance.
      if (modeRef.current === "carga" && sim.simTime === 0) loadStations();
      sim.lastTick = 0;
      sim.rafId = requestAnimationFrame(loop);
    } else if (sim.rafId) cancelAnimationFrame(sim.rafId);
    return () => {
      if (sim.rafId) cancelAnimationFrame(sim.rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    function onReset() {
      const sim = simRef.current;
      runningRef.current = false;
      if (sim.rafId) cancelAnimationFrame(sim.rafId);
      sim.lastTick = 0;
      prepare();
      stationsRef.current.forEach((s) => {
        const topEl = svgRef.current?.querySelector(`#cube-top-${s.id}`) as SVGPolygonElement | null;
        if (topEl) {
          topEl.setAttribute("stroke", KPI_GREEN);
          topEl.setAttribute("stroke-width", "1.3");
        }
      });
    }
    window.addEventListener("mimsa-reset", onReset);
    return () => window.removeEventListener("mimsa-reset", onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nPal = palletCount(target, line.palletSize);
  const vbH = viewBoxHeight(target, line.palletSize);

  return (
    <div className="hud-grid hud-frame hud-bracket p-3">
      <svg ref={svgRef} viewBox={`0 0 760 ${vbH}`} className="block h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#94C11C" />
          </marker>
          <marker id="arrowGreen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#94C11C" />
          </marker>
          {/* Resplandor verde para las bolitas en movimiento */}
          <filter id="ballGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#94C11C" floodOpacity="0.9" />
          </filter>
          {/* Resplandor tenue para las líneas de flujo */}
          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.1" floodColor="#94C11C" floodOpacity="0.55" />
          </filter>
          {/* Esferas (volumen 3D) por tipo de pieza */}
          {line.pieceTypes.map((tp) => {
            const base = line.pieceColors[tp] || "#9bd11e";
            return (
              <radialGradient key={`sph-${tp}`} id={`sphere-${tp.replace(/\s+/g, "-")}`} cx="36%" cy="30%" r="80%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="32%" stopColor={base} />
                <stop offset="100%" stopColor={darken(base, 0.42)} />
              </radialGradient>
            );
          })}
          <radialGradient id="sphere-green" cx="36%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="32%" stopColor="#94C11C" />
            <stop offset="100%" stopColor="#3f5610" />
          </radialGradient>
          {/* Caras del cubo con iluminación direccional (volumen) */}
          <linearGradient id="cubeTopG" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#d4f072" />
            <stop offset="100%" stopColor="#7fa31a" />
          </linearGradient>
          <linearGradient id="cubeLeftG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9ec92a" />
            <stop offset="100%" stopColor="#3a500c" />
          </linearGradient>
          <linearGradient id="cubeRightG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5f8011" />
            <stop offset="100%" stopColor="#222f06" />
          </linearGradient>
          {/* Madera de tarima con volumen */}
          <linearGradient id="woodTopG" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#c08544" />
            <stop offset="100%" stopColor="#8a5a2b" />
          </linearGradient>
        </defs>

        {/* Conectores que las bolitas siguen */}
        <g stroke="#94C11C" strokeWidth="1.4" fill="none" opacity="0.6" filter="url(#lineGlow)">
          {(() => {
            const first = stations[0];
            return first ? (
              <path className="flow-line" d={`M 60 180 C 90 180, ${first.x - ST_A - 30} ${first.y}, ${first.x - ST_A} ${first.y}`} markerEnd="url(#arrow)" />
            ) : null;
          })()}
          {deriveEdges(line.routes).map(({ from, to }) => {
            const a = stations.find((s) => s.id === from);
            const b = stations.find((s) => s.id === to);
            if (!a || !b) return null;
            const cv = curveH(a.x + ST_A, a.y, b.x - ST_A, b.y);
            return <path className="flow-line" key={`${from}-${to}`} d={curveStr(cv)} markerEnd="url(#arrow)" />;
          })}
        </g>

        {/* Flecha dinamica a la tarima activa */}
        {(() => {
          const lastR0 = line.routes[line.pieceTypes[0]] || [];
          const emb = lastR0.length ? stations.find((s) => s.id === lastR0[lastR0.length - 1]) : undefined;
          const g = palletGeom(0, nPal);
          if (!emb) return null;
          return (
            <path
              id="pallet-arrow"
              d={curveStr(arrowToPallet(emb.x, emb.y + ST_B, g.cx, g.baseY))}
              stroke="#6F9213"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 3"
              markerEnd="url(#arrowGreen)"
            />
          );
        })()}

        {/* Entrada */}
        {(() => {
          const f = cubeFaces(40, 180, 18, 9, 22);
          return (
            <g>
              <polygon points={f.left} fill="#B9B7AD" stroke="#6F9213" strokeWidth="0.8" />
              <polygon points={f.right} fill="#A4A299" stroke="#6F9213" strokeWidth="0.8" />
              <polygon points={f.top} fill="#D3D1C7" stroke="#6F9213" strokeWidth="0.8" />
              <text x="40" y="216" textAnchor="middle" fontSize="10" fill="#5F5E5A">Entrada</text>
            </g>
          );
        })()}

        {/* Estaciones: máquinas isométricas ilustradas con su cuadrilla */}
        {stations.map((s, si) => {
          const occ = isoStack(s.x, s.y + ST_H / 2 - 4, ESTACK);
          const occDraw = [...occ].sort((a, b) => a.y - b.y);
          const sp = s.name.indexOf(" ");
          const twoLines = s.name.length > 11 && sp > 0;
          const line1 = twoLines ? s.name.slice(0, sp) : s.name;
          const line2 = twoLines ? s.name.slice(sp + 1) : "";
          const nameY = s.y - ST_H / 2 - ST_B - (twoLines ? 24 : 16);
          const capY = nameY + (twoLines ? 20 : 10);
          const matFill = si % 2 === 0 ? "#E3EFBD" : "#DBEBD2";
          return (
            <g key={s.id}>
              {/* tapete + máquina (la superficie lleva el id de alerta) */}
              <StationMachine s={s} matFill={matFill} />
              {/* producto en proceso sobre la máquina (ocupación) */}
              {occDraw.map((c) => (
                <circle
                  key={`occ-${s.id}-${c.fo}`}
                  data-st={s.id}
                  data-fo={c.fo}
                  cx={c.x}
                  cy={c.y}
                  r={ESTACK.r}
                  fill="url(#sphere-green)"
                  stroke="none"
                  opacity="0"
                />
              ))}
              {/* operarios al frente (= personas asignadas) */}
              <Crew cx={s.x} by={s.y + 33} n={s.people} />
              {/* nombre + capacidad arriba */}
              {twoLines ? (
                <>
                  <text x={s.x} y={nameY} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1C1C1A">{line1}</text>
                  <text x={s.x} y={nameY + 10} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1C1C1A">{line2}</text>
                </>
              ) : (
                <text x={s.x} y={nameY} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1C1C1A">{s.name}</text>
              )}
              <text x={s.x} y={capY} textAnchor="middle" fontSize="8" fontWeight="600" fill="#6F9213">
                {Math.round(stationCapacity(s))}/t
              </text>
              {/* pendiente + ocupacion debajo */}
              <text x={s.x} y={s.y + 46} textAnchor="middle" fontSize="9" fill="#5F5E5A">
                Pend:{" "}
                <tspan id={`q-${s.id}`} fontWeight="600" fill="#1C1C1A">0</tspan> · Ocup.{" "}
                <tspan id={`u-${s.id}`} fontWeight="700" fill="#6F9213">0%</tspan>
              </text>
            </g>
          );
        })}

        {/* Bolitas en movimiento */}
        <g ref={layerRef} filter="url(#ballGlow)" />

        {/* Badge cuello de botella */}
        <g id="bn-badge" style={{ display: "none" }}>
          <rect className="animate-pulse" x="0" y="0" width="120" height="20" rx="3" fill="#A32D2D" stroke="#EF9F27" strokeWidth="1" />
          <text x="60" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" style={{ letterSpacing: "0.08em" }}>CUELLO DE BOTELLA</text>
        </g>

        {/* Leyenda: una sola corrida en modo "or"; por componente en "and" */}
        {line.assembly === "or" ? (
          <g>
            <circle cx={40} cy={LEGEND_Y} r="4" fill={line.pieceColors[line.pieceTypes[0]] || "#1C1C1A"} stroke="#FFFFFF" strokeWidth="0.8" />
            <text x={50} y={LEGEND_Y + 3} fontSize="9" fill="#5F5E5A" style={{ textTransform: "capitalize" }}>{line.unit}</text>
          </g>
        ) : (
          line.pieceTypes.map((tp, i) => {
            const lx = 40 + i * 132;
            return (
              <g key={`leg-${tp}`}>
                <circle cx={lx} cy={LEGEND_Y} r="4" fill={line.pieceColors[tp] || "#888780"} stroke="#FFFFFF" strokeWidth="0.8" />
                <text x={lx + 10} y={LEGEND_Y + 3} fontSize="9" fill="#5F5E5A" style={{ textTransform: "capitalize" }}>{tp}</text>
              </g>
            );
          })
        )}
        <text x={line.assembly === "or" ? 172 : 40 + line.pieceTypes.length * 132} y={LEGEND_Y + 3} fontSize="9" fill="#5F5E5A">Cada bolita = {line.ballUnits} unidades</text>

        {/* Titulo zona de tarimas */}
        <text x="20" y={TITLE_Y} fontSize="11" fontWeight="700" fill="#1C1C1A">ALMACÉN · PRODUCTO TERMINADO</text>
        <text id="pallet-summary" x="20" y={TITLE_Y + 15} fontSize="10" fill="#5F5E5A">
          Tarimas llenas: 0/{nPal} · 0 marcos terminados
        </text>

        {/* Tarimas: cubos isometricos que se llenan de bolitas */}
        {Array.from({ length: nPal }).map((_, pi) => {
          const g = palletGeom(pi, nPal);
          const cx = g.cx;
          const baseY = g.baseY;
          const topRombo = baseY - PSTACK.nz * PSTACK.stepZ - 2;
          const wA = (PSTACK.nx - 1) * PSTACK.stepX + 8;
          const wB = ((PSTACK.nx + PSTACK.ny - 2) * PSTACK.stepY) / 2 + 5;
          const stack = isoStack(cx, baseY, PSTACK);
          const draw = [...stack].sort((a, b) => a.y - b.y);
          return (
            <g key={`pallet-${pi}`}>
              <polygon
                points={`${cx},${topRombo - wB} ${cx + wA},${topRombo} ${cx},${topRombo + wB} ${cx - wA},${topRombo}`}
                fill="none"
                stroke="#B7B3A6"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line x1={cx - wA} y1={topRombo} x2={cx - wA} y2={baseY} stroke="#B7B3A6" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={cx + wA} y1={topRombo} x2={cx + wA} y2={baseY} stroke="#B7B3A6" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={cx} y1={topRombo + wB} x2={cx} y2={baseY + wB} stroke="#B7B3A6" strokeWidth="1" strokeDasharray="3 3" />
              {draw.map((c) => (
                <circle
                  key={`${pi}-${c.fo}`}
                  data-pal={pi}
                  data-fo={c.fo}
                  cx={c.x}
                  cy={c.y}
                  r={PSTACK.r}
                  fill="url(#sphere-green)"
                  stroke="none"
                  opacity="0"
                />
              ))}
              {/* sombra de contacto bajo la tarima */}
              <ellipse cx={cx} cy={baseY + wB + 6} rx={wA + 4} ry={wB * 0.55} fill="#1C1C1A" opacity="0.14" />
              <polygon
                points={`${cx},${baseY + wB} ${cx + wA},${baseY} ${cx},${baseY - wB} ${cx - wA},${baseY}`}
                fill="url(#woodTopG)"
                stroke="#6E4420"
                strokeWidth="0.8"
              />
              <polygon points={`${cx - wA},${baseY} ${cx},${baseY + wB} ${cx},${baseY + wB + 7} ${cx - wA},${baseY + 7}`} fill="#6E4420" />
              <polygon points={`${cx},${baseY + wB} ${cx + wA},${baseY} ${cx + wA},${baseY + 7} ${cx},${baseY + wB + 7}`} fill="#5A3618" />
              <text x={cx} y={baseY + wB + 22} textAnchor="middle" fontSize="9" fontWeight="600" fill="#1C1C1A">Tarima {pi + 1}</text>
              <text id={`pallet-lbl-${pi}`} x={cx} y={baseY + wB + 33} textAnchor="middle" fontSize="9" fill="#5F5E5A">0/{line.palletSize}</text>
            </g>
          );
        })}

        {/* ===== Muelle de embarque: almacén · montacargas · camión ===== */}
        {(() => {
          const dockTop = palletsBottomY(target, line.palletSize);
          const fy = dockTop + 96; // línea de piso del muelle
          return (
            <g>
              {/* piso del andén */}
              <rect x={24} y={dockTop + 18} width={712} height={132} rx={10} fill="#EAEDE0" stroke="#C7DC8A" strokeWidth="1.5" />
              <rect x={24} y={dockTop + 18} width={712} height={20} rx={10} fill="#DCE7C4" />
              {/* línea de carril */}
              <line x1={40} y1={fy + 26} x2={720} y2={fy + 26} stroke="#94C11C" strokeWidth="2" strokeDasharray="10 8" opacity="0.5" />
              <text x={40} y={dockTop + 44} fontSize="11" fontWeight="700" fill="#1C1C1A" style={{ letterSpacing: "0.06em" }}>EMBARQUE · DESPACHO</text>

              {/* tarimas en espera de carga (cola) */}
              <g>
                {[0, 1].map((i) => {
                  const px = 150 + i * 68;
                  return (
                    <g key={`stage-${i}`}>
                      <ellipse cx={px} cy={fy + 8} rx={26} ry={7} fill="#1C1C1A" opacity="0.13" />
                      <IsoBox cx={px} cyBase={fy + 4} a={22} b={11} H={6} t="#C0894B" l="#9C6A34" r="#7E5328" />
                      <IsoBox cx={px} cyBase={fy - 2} a={18} b={9} H={16} t="#B6D94E" l="#94C11C" r="#6F9213" />
                    </g>
                  );
                })}
              </g>

              {/* producto cargándose en el camión (proporcional a tarimas llenas) */}
              {(() => {
                const lx = 500;
                const lbaseY = fy + 2;
                const cells = isoStack(lx, lbaseY, { nx: 3, ny: 2, nz: 3, stepX: 6, stepY: 3, stepZ: 6 });
                const draw = [...cells].sort((a, b) => a.y - b.y);
                return (
                  <g>
                    <ellipse cx={lx} cy={lbaseY + 6} rx={24} ry={7} fill="#1C1C1A" opacity="0.13" />
                    <IsoBox cx={lx} cyBase={lbaseY + 4} a={22} b={11} H={5} t="#C0894B" l="#9C6A34" r="#7E5328" />
                    {draw.map((c) => (
                      <circle key={`load-${c.fo}`} data-load={c.fo} cx={c.x} cy={c.y} r={3} fill="url(#sphere-green)" stroke="none" opacity="0" />
                    ))}
                    <text id="truck-load" x={lx} y={lbaseY + 22} textAnchor="middle" fontSize="9" fontWeight="600" fill="#5F5E5A">
                      Cargado: 0/{nPal}
                    </text>
                  </g>
                );
              })()}

              {/* montacargas: recoge una tarima, la lleva al camión y regresa */}
              <g className="fork-drive">
                <Forklift x={300} y={fy + 6} scale={1.05} />
              </g>

              {/* camión de embarque a la derecha */}
              <Truck x={590} y={fy} scale={1.0} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
