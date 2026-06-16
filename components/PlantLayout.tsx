"use client";

import { useEffect, useRef } from "react";
import {
  Station,
  PieceType,
  ROUTES,
  PIECE_COLORS,
  stationCapacity,
  deriveEdges,
} from "@/lib/simulation";

type StartMode = "carga" | "transitorio";

interface Props {
  stations: Station[];
  target: number;
  running: boolean;
  speed: number;
  mode: StartMode;
  onTick: (state: { hour: number; completed: number; wip: number }) => void;
}

interface Piece {
  id: number;
  type: PieceType;
  stationId: string; // modo carga
  slot: number; // modo carga
  total: number; // modo carga
  stage: number; // modo transitorio (indice en la ruta)
  x: number;
  y: number;
  t: number;
  state: "queue" | "serve" | "exit" | "toPallet" | "travel";
  serviceTime: number;
  exitT: number;
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

const PALLET_TOP = 360;
const PROD_MAX_H = 46;
const ROW_H = 104;
const PER_ROW = 8;

function palletCount(target: number): number {
  return Math.max(1, Math.ceil(target / PALLET_SIZE));
}

function palletGeom(i: number, n: number) {
  const per = Math.min(Math.max(n, 1), PER_ROW);
  const w = Math.min(76, Math.floor(712 / per));
  const gap = w + 8;
  const rowW = per * gap - 8;
  const startX = Math.round((760 - rowW) / 2);
  const col = i % per;
  const row = Math.floor(i / per);
  const x = startX + col * gap;
  const topY = PALLET_TOP + row * ROW_H;
  const baseY = topY + PROD_MAX_H;
  return { x, w, topY, baseY };
}

function viewBoxHeight(target: number): number {
  const rows = Math.ceil(palletCount(target) / PER_ROW);
  return PALLET_TOP + rows * ROW_H + 14;
}

// Pila de material (modo carga) a la izquierda de la estacion.
function queuePos(s: Station, slot: number, total: number) {
  const COLS = 3;
  const rows = Math.max(1, Math.ceil(total / COLS));
  const col = slot % COLS;
  const row = Math.floor(slot / COLS);
  const x = s.x - 42 - col * 6;
  const y0 = s.y - (rows * 6) / 2 + 3;
  const y = y0 + row * 6;
  return { x, y };
}

export function PlantLayout({
  stations,
  target,
  running,
  speed,
  mode,
  onTick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);

  const stationsRef = useRef(stations);
  const targetRef = useRef(target);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const modeRef = useRef(mode);
  const nPalletsRef = useRef(palletCount(target));

  const simRef = useRef({
    pieces: [] as Piece[],
    pieceId: 0,
    simTime: 0,
    completed: 0,
    nextArrival: 0,
    stats: {} as Record<string, StatBucket>,
    buffer: { bisagra: 0, embutido: 0 } as Record<PieceType, number>,
    lastTick: 0,
    rafId: 0,
  });

  stationsRef.current = stations;
  targetRef.current = target;
  speedRef.current = speed;
  modeRef.current = mode;
  nPalletsRef.current = palletCount(target);

  function resetStats() {
    const stats: Record<string, StatBucket> = {};
    stationsRef.current.forEach((s) => {
      stats[s.id] = { busy: 0, queue: [], serving: null };
    });
    simRef.current.stats = stats;
  }

  if (Object.keys(simRef.current.stats).length === 0) {
    resetStats();
  }

  function makePiece(type: PieceType): Piece {
    const sim = simRef.current;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", "4");
    c.setAttribute("fill", PIECE_COLORS[type]);
    c.setAttribute("stroke", "#FFFFFF");
    c.setAttribute("stroke-width", "0.7");
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
      exitT: 0,
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

  function stationById(id: string): Station | undefined {
    return stationsRef.current.find((s) => s.id === id);
  }

  function clearAll() {
    const sim = simRef.current;
    sim.pieces.forEach(removePiece);
    sim.pieces = [];
    sim.pieceId = 0;
    sim.simTime = 0;
    sim.completed = 0;
    sim.nextArrival = 0;
    sim.buffer = { bisagra: 0, embutido: 0 };
    resetStats();
  }

  // MODO CARGA: cada estacion arranca con el 100% de su material.
  function loadStations() {
    clearAll();
    const sim = simRef.current;
    const nB = Math.max(1, Math.round(targetRef.current / BATCH));
    stationsRef.current.forEach((s) => {
      const total = nB * s.handles.length;
      let slot = 0;
      for (let k = 0; k < nB; k++) {
        s.handles.forEach((type) => {
          const p = makePiece(type);
          p.stationId = s.id;
          p.slot = slot++;
          p.total = total;
          p.state = "queue";
          const pos = queuePos(s, p.slot, total);
          setPos(p, pos.x, pos.y);
          sim.stats[s.id].queue.push(p);
          sim.pieces.push(p);
        });
      }
    });
    paint();
  }

  // Prepara el estado segun el modo (carga = material listo; transitorio = vacio).
  function prepare() {
    if (modeRef.current === "carga") {
      loadStations();
    } else {
      clearAll();
      paint();
    }
  }

  // ---------- MODO CARGA ----------
  function stepCarga(dt: number) {
    const sim = simRef.current;
    sim.simTime += dt;
    const nPal = nPalletsRef.current;

    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (!st) return;
      if (st.serving) st.busy += dt;
      if (!st.serving && st.queue.length > 0) {
        const p = st.queue.shift()!;
        st.serving = p;
        p.state = "serve";
        p.t = 0;
        const effRate = s.ratePerHour * (s.handles.length || 1);
        p.serviceTime = effRate > 0 ? BATCH / effRate : 999;
      }
    });

    for (let i = sim.pieces.length - 1; i >= 0; i--) {
      const p = sim.pieces[i];
      const s = stationById(p.stationId);
      if (!s) continue;
      const st = sim.stats[p.stationId];
      if (!st) continue;

      if (p.state === "queue") {
        const pos = queuePos(s, p.slot, p.total);
        setPos(p, pos.x, pos.y);
      } else if (p.state === "serve") {
        setPos(p, s.x, s.y);
        p.t += dt;
        if (p.t >= p.serviceTime) {
          st.serving = null;
          if (s.id === "embolsado") p.state = "toPallet";
          else {
            p.state = "exit";
            p.exitT = 0;
          }
        }
      } else if (p.state === "exit") {
        p.exitT += dt;
        setPos(p, p.x + 260 * dt, p.y);
        p.el.setAttribute("opacity", String(Math.max(0, 1 - p.exitT / 0.45)));
        if (p.exitT > 0.45) {
          removePiece(p);
          sim.pieces.splice(i, 1);
        }
      } else if (p.state === "toPallet") {
        travelToPallet(p, i, nPal, dt);
      }
    }
  }

  // ---------- MODO TRANSITORIO ----------
  function stepTransitorio(dt: number) {
    const sim = simRef.current;
    sim.simTime += dt;
    const t = sim.simTime;
    const tgt = targetRef.current;
    const nPal = nPalletsRef.current;

    // Llegadas graduales por la entrada
    const arrivalsPerHour = tgt / TURN_HOURS / BATCH;
    const arrivalInterval = arrivalsPerHour > 0 ? 1 / arrivalsPerHour : Infinity;
    while (t >= sim.nextArrival && t < TURN_HOURS) {
      (["bisagra", "embutido"] as PieceType[]).forEach((type, idx) => {
        const p = makePiece(type);
        p.state = "travel";
        p.stage = 0;
        p.x = 40;
        p.y = 180 + (idx === 0 ? -5 : 5);
        setPos(p, p.x, p.y);
        sim.pieces.push(p);
      });
      sim.nextArrival += arrivalInterval;
    }

    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (st && st.serving) st.busy += dt;
    });

    for (let i = sim.pieces.length - 1; i >= 0; i--) {
      const p = sim.pieces[i];
      const route = ROUTES[p.type];

      if (p.stage >= route.length || p.state === "toPallet") {
        p.state = "toPallet";
        travelToPallet(p, i, nPal, dt);
        continue;
      }

      const s = stationById(route[p.stage]);
      if (!s) continue;
      const st = sim.stats[s.id];
      if (!st) continue;

      if (p.state === "travel") {
        const tx = s.x - 18;
        const nx = p.x + 550 * dt;
        if (nx >= tx) {
          setPos(p, tx, p.y);
          p.state = "queue";
          st.queue.push(p);
        } else {
          setPos(p, nx, p.y);
        }
      } else if (p.state === "queue") {
        const idx = st.queue.indexOf(p);
        const dx = s.x - 22 - (idx % 6) * 5;
        const offset = p.type === "embutido" ? 3 : -3;
        const dy = s.y + Math.floor(idx / 6) * 5 + offset;
        setPos(p, dx, dy);
        if (!st.serving && st.queue[0] === p) {
          st.queue.shift();
          st.serving = p;
          p.state = "serve";
          p.t = 0;
          const effRate = s.ratePerHour * (s.handles.length || 1);
          p.serviceTime = effRate > 0 ? BATCH / effRate : 999;
        }
      } else if (p.state === "serve") {
        const offset = p.type === "embutido" ? 3 : -3;
        setPos(p, s.x, s.y + offset);
        p.t += dt;
        if (p.t >= p.serviceTime) {
          st.serving = null;
          p.stage++;
          p.state = "travel";
          setPos(p, s.x + 22, p.type === "embutido" ? 185 : 175);
        }
      }
    }
  }

  // Viaje a la tarima activa (comun a ambos modos)
  function travelToPallet(p: Piece, i: number, nPal: number, dt: number) {
    const sim = simRef.current;
    const activeIdx = Math.min(nPal - 1, Math.floor(sim.completed / PALLET_SIZE));
    const g = palletGeom(activeIdx, nPal);
    const tx = g.x + g.w / 2 + (p.type === "bisagra" ? -6 : 6);
    const ty = g.baseY - 6;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = 550 * dt;
    if (dist > 5) {
      setPos(p, p.x + (dx / dist) * Math.min(sp, dist), p.y + (dy / dist) * Math.min(sp, dist));
    } else {
      sim.buffer[p.type]++;
      while (sim.buffer.bisagra > 0 && sim.buffer.embutido > 0) {
        sim.buffer.bisagra--;
        sim.buffer.embutido--;
        sim.completed += BATCH;
      }
      removePiece(p);
      sim.pieces.splice(i, 1);
    }
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

      // cuello: en carga, el de mayor pendiente; en transitorio, el de mayor cola
      const metric = isCarga ? pend : st.queue.length;
      if (metric > bnVal && sim.simTime > 0.2) {
        bnVal = metric;
        bnId = s.id;
      }

      const rect = svg.querySelector(`#rect-${s.id}`) as SVGRectElement | null;
      if (rect && sim.simTime > 0.2) {
        const alert = isCarga ? utilC > 95 && pend > 1 : utilC > 90 && st.queue.length > 2;
        if (alert) {
          rect.setAttribute("stroke", "#A32D2D");
          rect.setAttribute("stroke-width", "2.5");
        } else if (utilC > 80) {
          rect.setAttribute("stroke", "#EF9F27");
          rect.setAttribute("stroke-width", "2");
        } else {
          rect.setAttribute("stroke", s.fill === "#1C1C1A" ? "#94C11C" : "#1C1C1A");
          rect.setAttribute("stroke-width", "1.5");
        }
      }
    });

    const nPal = nPalletsRef.current;
    let fullPallets = 0;
    for (let i = 0; i < nPal; i++) {
      const fill = Math.max(0, Math.min(PALLET_SIZE, sim.completed - i * PALLET_SIZE));
      if (fill >= PALLET_SIZE) fullPallets++;
      const g = palletGeom(i, nPal);
      const prodH = (fill / PALLET_SIZE) * PROD_MAX_H;
      const prod = svg.querySelector(`#pallet-prod-${i}`) as SVGRectElement | null;
      if (prod) {
        prod.setAttribute("y", String(g.baseY - prodH));
        prod.setAttribute("height", String(prodH));
        prod.setAttribute("fill", fill >= PALLET_SIZE ? "#94C11C" : "#B5D85A");
      }
      const lbl = svg.querySelector(`#pallet-lbl-${i}`);
      if (lbl) lbl.textContent = `${Math.round(fill)}/${PALLET_SIZE}`;
    }
    const sum = svg.querySelector("#pallet-summary");
    if (sum) {
      sum.textContent = `Tarimas llenas: ${fullPallets}/${nPal} · ${sim.completed.toLocaleString(
        "es-MX"
      )} marcos terminados`;
    }

    const badge = svg.querySelector("#bn-badge") as SVGGElement | null;
    if (badge) {
      const show = bnId && bnVal > (isCarga ? 0 : 2) && sim.simTime > 0.2;
      if (show) {
        const s = stationById(bnId!);
        if (s) {
          badge.style.display = "";
          const r = badge.querySelector("rect");
          const tx = badge.querySelector("text");
          r?.setAttribute("x", String(s.x - 60));
          r?.setAttribute("y", String(s.y - 52));
          tx?.setAttribute("x", String(s.x));
          tx?.setAttribute("y", String(s.y - 39));
        }
      } else {
        badge.style.display = "none";
      }
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
      if (modeRef.current === "carga") stepCarga(simDt / sub);
      else stepTransitorio(simDt / sub);
    }
    paint();

    const done =
      modeRef.current === "carga"
        ? sim.pieces.length === 0 && sim.simTime > 0.1
        : sim.simTime >= TURN_HOURS && sim.pieces.length === 0;
    if (done) {
      runningRef.current = false;
    } else {
      sim.rafId = requestAnimationFrame(loop);
    }
  }

  useEffect(() => {
    runningRef.current = running;
    const sim = simRef.current;
    if (running) {
      if (modeRef.current === "carga" && sim.pieces.length === 0) loadStations();
      sim.lastTick = 0;
      sim.rafId = requestAnimationFrame(loop);
    } else if (sim.rafId) {
      cancelAnimationFrame(sim.rafId);
    }
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
        const rect = svgRef.current?.querySelector(
          `#rect-${s.id}`
        ) as SVGRectElement | null;
        if (rect) {
          rect.setAttribute("stroke", s.fill === "#1C1C1A" ? "#94C11C" : "#1C1C1A");
          rect.setAttribute("stroke-width", "1.5");
        }
      });
    }
    window.addEventListener("mimsa-reset", onReset);
    return () => window.removeEventListener("mimsa-reset", onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preparar al montar segun el modo inicial.
  useEffect(() => {
    prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nPal = palletCount(target);
  const vbH = viewBoxHeight(target);

  return (
    <div className="rounded-lg border border-mimsa-line bg-mimsa-bg p-2">
      <svg ref={svgRef} viewBox={`0 0 760 ${vbH}`} className="block h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#888780" />
          </marker>
        </defs>

        <g stroke="#888780" strokeWidth="1.5" fill="none">
          <path d="M 60 180 L 95 180" markerEnd="url(#arrow)" />
          {deriveEdges().map(({ from, to }) => {
            const a = stations.find((s) => s.id === from);
            const b = stations.find((s) => s.id === to);
            if (!a || !b) return null;
            const halfA = (a.id === "embolsado" ? 55 : 70) / 2;
            const halfB = (b.id === "embolsado" ? 55 : 70) / 2;
            const x1 = a.x + halfA;
            const y1 = a.y;
            const x2 = b.x - halfB - 7;
            const y2 = b.y;
            const c = Math.max(24, (x2 - x1) * 0.4);
            const d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
            return <path key={`${from}-${to}`} d={d} markerEnd="url(#arrow)" />;
          })}
          <path
            d={`M 705 205 C 705 ${PALLET_TOP - 30}, 380 ${PALLET_TOP - 30}, 380 ${PALLET_TOP - 6}`}
            strokeDasharray="4 3"
            markerEnd="url(#arrow)"
          />
        </g>

        <rect x="20" y="160" width="40" height="40" rx="4" fill="#D3D1C7" stroke="#888780" />
        <text x="40" y="218" textAnchor="middle" fontSize="10" fill="#5F5E5A">Entrada</text>

        {stations.map((s) => {
          const isDark = s.fill === "#1C1C1A";
          const w = 70;
          const h = 50;
          return (
            <g key={s.id}>
              <rect id={`rect-${s.id}`} x={s.x - w / 2} y={s.y - h / 2} width={w} height={h} rx="4" fill={s.fill} stroke={isDark ? "#94C11C" : "#1C1C1A"} strokeWidth="1.5" />
              <text x={s.x} y={s.y - 2} textAnchor="middle" fontSize="9" fontWeight="600" fill={isDark ? "white" : "#1C1C1A"}>
                {s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name}
              </text>
              <text x={s.x} y={s.y + 10} textAnchor="middle" fontSize="8" fill={isDark ? "#94C11C" : "#1C1C1A"}>
                {Math.round(stationCapacity(s))}/t
              </text>
              <text x={s.x} y={s.y + h / 2 + 14} textAnchor="middle" fontSize="9" fill="#5F5E5A">
                Pend:{" "}
                <tspan id={`q-${s.id}`} fontWeight="600" fill="#1C1C1A">0</tspan> ·{" "}
                <tspan id={`u-${s.id}`} fontWeight="600" fill="#1C1C1A">0%</tspan>
              </text>
            </g>
          );
        })}

        <g ref={layerRef} />

        <g id="bn-badge" style={{ display: "none" }}>
          <rect x="0" y="0" width="120" height="20" rx="10" fill="#A32D2D" />
          <text x="60" y="13" textAnchor="middle" fontSize="10" fontWeight="600" fill="white">CUELLO DE BOTELLA</text>
        </g>

        <circle cx="40" cy="312" r="4" fill="#1C1C1A" stroke="#FFFFFF" strokeWidth="0.7" />
        <text x="50" y="315" fontSize="9" fill="#5F5E5A">Larguero bisagra</text>
        <circle cx="150" cy="312" r="4" fill="#888780" stroke="#FFFFFF" strokeWidth="0.7" />
        <text x="160" y="315" fontSize="9" fill="#5F5E5A">Larguero embutido</text>
        <text x="270" y="315" fontSize="9" fill="#5F5E5A">Cada bolita = 90 unidades</text>

        <text x="20" y={PALLET_TOP - 12} fontSize="11" fontWeight="700" fill="#1C1C1A">PRODUCTO TERMINADO</text>
        <text id="pallet-summary" x="200" y={PALLET_TOP - 12} fontSize="10" fill="#5F5E5A">
          Tarimas llenas: 0/{nPal} · 0 marcos terminados
        </text>

        {Array.from({ length: nPal }).map((_, i) => {
          const g = palletGeom(i, nPal);
          const plankY = g.baseY;
          return (
            <g key={`pallet-${i}`}>
              <rect x={g.x + 3} y={g.topY} width={g.w - 6} height={PROD_MAX_H} rx="2" fill="none" stroke="#C9C7BD" strokeWidth="1" strokeDasharray="3 3" />
              <rect id={`pallet-prod-${i}`} x={g.x + 4} y={g.baseY} width={g.w - 8} height={0} rx="1.5" fill="#B5D85A" />
              <rect x={g.x} y={plankY} width={g.w} height="9" rx="1" fill="#8C5A2B" />
              <line x1={g.x + g.w * 0.33} y1={plankY} x2={g.x + g.w * 0.33} y2={plankY + 9} stroke="#6E4420" strokeWidth="1" />
              <line x1={g.x + g.w * 0.66} y1={plankY} x2={g.x + g.w * 0.66} y2={plankY + 9} stroke="#6E4420" strokeWidth="1" />
              <rect x={g.x + 4} y={plankY + 9} width="8" height="6" fill="#6E4420" />
              <rect x={g.x + g.w - 12} y={plankY + 9} width="8" height="6" fill="#6E4420" />
              <text x={g.x + g.w / 2} y={plankY + 27} textAnchor="middle" fontSize="9" fontWeight="600" fill="#1C1C1A">Tarima {i + 1}</text>
              <text id={`pallet-lbl-${i}`} x={g.x + g.w / 2} y={plankY + 38} textAnchor="middle" fontSize="9" fill="#5F5E5A">0/{PALLET_SIZE}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
