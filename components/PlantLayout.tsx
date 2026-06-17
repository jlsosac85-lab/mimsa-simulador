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

function viewBoxHeight(target: number, palletSize: number): number {
  const rows = Math.ceil(palletCount(target, palletSize) / PAL_PER_ROW);
  return PALLET_TOP + 70 + (rows - 1) * PAL_ROW_H + 78;
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
    c.setAttribute("fill", `url(#sphere-${type.replace(/\s+/g, "-")})`);
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
          {line.pieceTypes.map((tp) => (
            <radialGradient key={`sph-${tp}`} id={`sphere-${tp.replace(/\s+/g, "-")}`} cx="34%" cy="28%" r="82%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="20%" stopColor={line.pieceColors[tp] || "#9bd11e"} />
              <stop offset="100%" stopColor="#0a0c07" />
            </radialGradient>
          ))}
          <radialGradient id="sphere-green" cx="34%" cy="28%" r="82%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#a6d62a" />
            <stop offset="100%" stopColor="#0a0c07" />
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
              <polygon points={f.left} fill="#1c2114" stroke="#94C11C" strokeWidth="0.8" />
              <polygon points={f.right} fill="#141810" stroke="#94C11C" strokeWidth="0.8" />
              <polygon points={f.top} fill="#2a331c" stroke="#94C11C" strokeWidth="0.8" />
              <text x="40" y="216" textAnchor="middle" fontSize="10" fill="#9AA17F">Entrada</text>
            </g>
          );
        })()}

        {/* Estaciones: cubos translucidos (paleta KPI) que se llenan por ocupacion */}
        {stations.map((s) => {
          const f = cubeFaces(s.x, s.y, ST_A, ST_B, ST_H);
          const occ = isoStack(s.x, s.y + ST_H / 2 - 3, ESTACK);
          const occDraw = [...occ].sort((a, b) => a.y - b.y);
          const sp = s.name.indexOf(" ");
          const twoLines = s.name.length > 11 && sp > 0;
          const line1 = twoLines ? s.name.slice(0, sp) : s.name;
          const line2 = twoLines ? s.name.slice(sp + 1) : "";
          const nameY = s.y - ST_H / 2 - ST_B - (twoLines ? 24 : 16);
          const capY = nameY + (twoLines ? 20 : 10);
          return (
            <g key={s.id}>
              {/* sombra de contacto (profundidad) */}
              <ellipse
                cx={s.x}
                cy={s.y + ST_B + ST_H / 2 + 1}
                rx={ST_A * 0.92}
                ry={ST_B * 0.8}
                fill="#000000"
                opacity="0.4"
              />
              {/* bolitas de ocupacion dentro del cubo */}
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
              {/* vidrio translucido con volumen (neón sobre carbón) */}
              <polygon points={f.top} fill="url(#cubeTopG)" fillOpacity="0.26" />
              <polygon points={f.left} fill="url(#cubeLeftG)" fillOpacity="0.22" />
              <polygon points={f.right} fill="url(#cubeRightG)" fillOpacity="0.3" />
              {/* aristas verde KPI */}
              <polygon id={`cube-top-${s.id}`} points={f.top} fill="none" stroke={KPI_GREEN} strokeWidth="1.3" />
              <polygon points={f.left} fill="none" stroke={KPI_GREEN} strokeWidth="1.3" />
              <polygon points={f.right} fill="none" stroke={KPI_GREEN} strokeWidth="1.3" />
              {/* nombre + capacidad arriba */}
              {twoLines ? (
                <>
                  <text x={s.x} y={nameY} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DCE3CC">{line1}</text>
                  <text x={s.x} y={nameY + 10} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DCE3CC">{line2}</text>
                </>
              ) : (
                <text x={s.x} y={nameY} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DCE3CC">{s.name}</text>
              )}
              <text x={s.x} y={capY} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94C11C">
                {Math.round(stationCapacity(s))}/t
              </text>
              {/* pendiente + ocupacion debajo */}
              <text x={s.x} y={s.y + ST_B + ST_H / 2 + 12} textAnchor="middle" fontSize="9" fill="#8A9072">
                Pend:{" "}
                <tspan id={`q-${s.id}`} fontWeight="600" fill="#DCE3CC">0</tspan> · Ocup.{" "}
                <tspan id={`u-${s.id}`} fontWeight="700" fill="#94C11C">0%</tspan>
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
            <text x={50} y={LEGEND_Y + 3} fontSize="9" fill="#9AA17F" style={{ textTransform: "capitalize" }}>{line.unit}</text>
          </g>
        ) : (
          line.pieceTypes.map((tp, i) => {
            const lx = 40 + i * 132;
            return (
              <g key={`leg-${tp}`}>
                <circle cx={lx} cy={LEGEND_Y} r="4" fill={line.pieceColors[tp] || "#888780"} stroke="#FFFFFF" strokeWidth="0.8" />
                <text x={lx + 10} y={LEGEND_Y + 3} fontSize="9" fill="#9AA17F" style={{ textTransform: "capitalize" }}>{tp}</text>
              </g>
            );
          })
        )}
        <text x={line.assembly === "or" ? 172 : 40 + line.pieceTypes.length * 132} y={LEGEND_Y + 3} fontSize="9" fill="#9AA17F">Cada bolita = {line.ballUnits} unidades</text>

        {/* Titulo zona de tarimas */}
        <text x="20" y={TITLE_Y} fontSize="11" fontWeight="700" fill="#DCE3CC">PRODUCTO TERMINADO</text>
        <text id="pallet-summary" x="200" y={TITLE_Y} fontSize="10" fill="#9AA17F">
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
                stroke="#C9C7BD"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line x1={cx - wA} y1={topRombo} x2={cx - wA} y2={baseY} stroke="#C9C7BD" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={cx + wA} y1={topRombo} x2={cx + wA} y2={baseY} stroke="#C9C7BD" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={cx} y1={topRombo + wB} x2={cx} y2={baseY + wB} stroke="#C9C7BD" strokeWidth="1" strokeDasharray="3 3" />
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
              <ellipse cx={cx} cy={baseY + wB + 6} rx={wA + 4} ry={wB * 0.55} fill="#000000" opacity="0.38" />
              <polygon
                points={`${cx},${baseY + wB} ${cx + wA},${baseY} ${cx},${baseY - wB} ${cx - wA},${baseY}`}
                fill="url(#woodTopG)"
                stroke="#6E4420"
                strokeWidth="0.8"
              />
              <polygon points={`${cx - wA},${baseY} ${cx},${baseY + wB} ${cx},${baseY + wB + 7} ${cx - wA},${baseY + 7}`} fill="#6E4420" />
              <polygon points={`${cx},${baseY + wB} ${cx + wA},${baseY} ${cx + wA},${baseY + 7} ${cx},${baseY + wB + 7}`} fill="#5A3618" />
              <text x={cx} y={baseY + wB + 22} textAnchor="middle" fontSize="9" fontWeight="600" fill="#DCE3CC">Tarima {pi + 1}</text>
              <text id={`pallet-lbl-${pi}`} x={cx} y={baseY + wB + 33} textAnchor="middle" fontSize="9" fill="#9AA17F">0/{line.palletSize}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
