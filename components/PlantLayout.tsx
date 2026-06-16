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

interface Props {
  stations: Station[];
  target: number;
  running: boolean;
  speed: number;
  onTick: (state: { hour: number; completed: number; wip: number }) => void;
}

interface Piece {
  id: number;
  type: PieceType;
  stage: number;
  x: number;
  y: number;
  t: number;
  state: "travel" | "queue" | "serve";
  serviceTime: number;
  el: SVGCircleElement;
}

interface StatBucket {
  busy: number;
  queue: Piece[];
  serving: Piece | null;
}

const TURN_HOURS = 11;
const BATCH = 5; // cada pieza visual representa 5 marcos

export function PlantLayout({
  stations,
  target,
  running,
  speed,
  onTick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);

  // Refs vivos para que el loop lea valores actuales sin re-montar.
  const stationsRef = useRef(stations);
  const targetRef = useRef(target);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);

  // Estado de simulacion (imperativo, fuera de React).
  const simRef = useRef({
    pieces: [] as Piece[],
    pieceId: 0,
    simTime: 0,
    completed: 0,
    nextArrival: 0,
    stats: {} as Record<string, StatBucket>,
    buffer: { cabezal: 0, bisagra: 0, embutido: 0 } as Record<PieceType, number>,
    lastTick: 0,
    rafId: 0,
  });

  stationsRef.current = stations;
  targetRef.current = target;
  speedRef.current = speed;

  function resetStats() {
    const stats: Record<string, StatBucket> = {};
    stationsRef.current.forEach((s) => {
      stats[s.id] = { busy: 0, queue: [], serving: null };
    });
    simRef.current.stats = stats;
  }

  // Inicializa estadisticas la primera vez.
  if (Object.keys(simRef.current.stats).length === 0) {
    resetStats();
  }

  function makePiece(type: PieceType): Piece {
    const sim = simRef.current;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", "3.5");
    c.setAttribute("fill", PIECE_COLORS[type]);
    if (type === "cabezal") c.setAttribute("stroke", "#1C1C1A");
    c.setAttribute("stroke-width", "0.6");
    layerRef.current?.appendChild(c);
    return {
      id: ++sim.pieceId,
      type,
      stage: 0,
      x: 40,
      y: 180,
      t: 0,
      state: "travel",
      serviceTime: 0,
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

  function step(dt: number) {
    const sim = simRef.current;
    sim.simTime += dt;
    const t = sim.simTime;
    const tgt = targetRef.current;

    // Llegadas
    const arrivalsPerHour = tgt / TURN_HOURS / BATCH;
    const arrivalInterval = arrivalsPerHour > 0 ? 1 / arrivalsPerHour : Infinity;
    while (t >= sim.nextArrival && t < TURN_HOURS) {
      (["cabezal", "bisagra", "embutido"] as PieceType[]).forEach((type, i) => {
        const p = makePiece(type);
        p.y = 180 + (i - 1) * 6;
        sim.pieces.push(p);
      });
      sim.nextArrival += arrivalInterval;
    }

    // Tiempo ocupado (solo dentro de la ventana operativa de cada estacion)
    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (st && st.serving && t <= s.hours) st.busy += dt;
    });

    for (let i = sim.pieces.length - 1; i >= 0; i--) {
      const p = sim.pieces[i];
      const route = ROUTES[p.type];

      if (p.stage >= route.length) {
        if (p.x < 760) {
          setPos(p, p.x + 100 * dt, 180);
        } else {
          sim.buffer[p.type]++;
          while (
            sim.buffer.cabezal > 0 &&
            sim.buffer.bisagra > 0 &&
            sim.buffer.embutido > 0
          ) {
            sim.buffer.cabezal--;
            sim.buffer.bisagra--;
            sim.buffer.embutido--;
            sim.completed += BATCH;
          }
          removePiece(p);
          sim.pieces.splice(i, 1);
        }
        continue;
      }

      const s = stationById(route[p.stage]);
      if (!s) continue;
      const st = sim.stats[s.id];
      if (!st) continue;
      const inWindow = t <= s.hours;

      if (p.state === "travel") {
        const tx = s.x - 18;
        const nx = p.x + 80 * dt;
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
        const offset =
          p.type === "cabezal" ? -2.5 : p.type === "embutido" ? 2.5 : 0;
        const dy = s.y + Math.floor(idx / 6) * 5 + offset;
        setPos(p, dx, dy);
        if (inWindow && !st.serving && st.queue[0] === p) {
          st.queue.shift();
          st.serving = p;
          p.state = "serve";
          p.t = 0;
          const ratePerHour = s.ratePerHour;
          p.serviceTime = ratePerHour > 0 ? BATCH / ratePerHour : 999;
        }
      } else if (p.state === "serve") {
        const offset =
          p.type === "cabezal" ? -2.5 : p.type === "embutido" ? 2.5 : 0;
        setPos(p, s.x, s.y + offset);
        p.t += dt;
        if (p.t >= p.serviceTime) {
          st.serving = null;
          p.stage++;
          p.state = "travel";
          setPos(p, s.x + 22, 180);
        }
      }
    }
  }

  function paint() {
    const sim = simRef.current;
    const svg = svgRef.current;
    if (!svg) return;

    let maxQueue = -1;
    let bnId: string | null = null;

    stationsRef.current.forEach((s) => {
      const st = sim.stats[s.id];
      if (!st) return;
      const elapsed = Math.min(sim.simTime, s.hours);
      const util = elapsed > 0 ? (st.busy / elapsed) * 100 : 0;
      const utilC = Math.min(100, Math.max(0, util));

      const qEl = svg.querySelector(`#q-${s.id}`);
      const uEl = svg.querySelector(`#u-${s.id}`);
      if (qEl) qEl.textContent = String(st.queue.length);
      if (uEl) uEl.textContent = `${Math.round(utilC)}%`;

      if (st.queue.length > maxQueue && sim.simTime > 1) {
        maxQueue = st.queue.length;
        bnId = s.id;
      }

      const rect = svg.querySelector(`#rect-${s.id}`) as SVGRectElement | null;
      if (rect && sim.simTime > 1) {
        if (utilC > 90 && st.queue.length > 3) {
          rect.setAttribute("stroke", "#A32D2D");
          rect.setAttribute("stroke-width", "2.5");
        } else if (utilC > 80) {
          rect.setAttribute("stroke", "#EF9F27");
          rect.setAttribute("stroke-width", "2");
        } else {
          rect.setAttribute(
            "stroke",
            s.fill === "#1C1C1A" ? "#94C11C" : "#1C1C1A"
          );
          rect.setAttribute("stroke-width", "1.5");
        }
      }
    });

    const badge = svg.querySelector("#bn-badge") as SVGGElement | null;
    if (badge) {
      if (bnId && maxQueue > 3 && sim.simTime > 1) {
        const s = stationById(bnId);
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

    onTick({
      hour: sim.simTime,
      completed: sim.completed,
      wip: sim.pieces.length,
    });
  }

  function loop(ts: number) {
    const sim = simRef.current;
    if (!runningRef.current) return;
    if (!sim.lastTick) sim.lastTick = ts;
    const real = (ts - sim.lastTick) / 1000;
    sim.lastTick = ts;
    const simDt = real * speedRef.current * 0.25;
    const sub = Math.max(1, Math.ceil(simDt / 0.05));
    for (let i = 0; i < sub; i++) step(simDt / sub);
    paint();
    if (sim.simTime >= TURN_HOURS && sim.pieces.length === 0) {
      runningRef.current = false;
    } else {
      sim.rafId = requestAnimationFrame(loop);
    }
  }

  // Arranca / detiene el loop cuando cambia `running`.
  useEffect(() => {
    runningRef.current = running;
    const sim = simRef.current;
    if (running) {
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

  // Expone un reset global por evento.
  useEffect(() => {
    function onReset() {
      const sim = simRef.current;
      runningRef.current = false;
      if (sim.rafId) cancelAnimationFrame(sim.rafId);
      sim.pieces.forEach(removePiece);
      sim.pieces = [];
      sim.pieceId = 0;
      sim.simTime = 0;
      sim.completed = 0;
      sim.nextArrival = 0;
      sim.buffer = { cabezal: 0, bisagra: 0, embutido: 0 };
      sim.lastTick = 0;
      resetStats();
      // limpia bordes
      stationsRef.current.forEach((s) => {
        const rect = svgRef.current?.querySelector(
          `#rect-${s.id}`
        ) as SVGRectElement | null;
        if (rect) {
          rect.setAttribute(
            "stroke",
            s.fill === "#1C1C1A" ? "#94C11C" : "#1C1C1A"
          );
          rect.setAttribute("stroke-width", "1.5");
        }
      });
      paint();
    }
    window.addEventListener("mimsa-reset", onReset);
    return () => window.removeEventListener("mimsa-reset", onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg border border-mimsa-line bg-mimsa-bg p-2">
      <svg
        ref={svgRef}
        viewBox="0 0 760 360"
        className="block h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#888780" />
          </marker>
        </defs>

        {/* Conexiones de flujo (derivadas de las rutas y posiciones reales) */}
        <g stroke="#888780" strokeWidth="1.5" fill="none">
          {/* Entrada -> primera estacion */}
          <path d="M 60 180 L 95 180" markerEnd="url(#arrow)" />
          {deriveEdges().map(({ from, to }) => {
            const a = stations.find((s) => s.id === from);
            const b = stations.find((s) => s.id === to);
            if (!a || !b) return null;
            const halfA = (a.id === "embolsado" ? 55 : 70) / 2;
            const halfB = (b.id === "embolsado" ? 55 : 70) / 2;
            const x1 = a.x + halfA;
            const y1 = a.y;
            const x2 = b.x - halfB - 7; // deja hueco para la punta de flecha
            const y2 = b.y;
            const c = Math.max(24, (x2 - x1) * 0.4);
            const d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
            return (
              <path key={`${from}-${to}`} d={d} markerEnd="url(#arrow)" />
            );
          })}
        </g>

        {/* Entrada */}
        <rect x="20" y="160" width="40" height="40" rx="4" fill="#D3D1C7" stroke="#888780" />
        <text x="40" y="218" textAnchor="middle" fontSize="10" fill="#5F5E5A">
          Entrada
        </text>

        {/* Estaciones (generadas) */}
        {stations.map((s) => {
          const isDark = s.fill === "#1C1C1A";
          const w = 70;
          const h = 50;
          return (
            <g key={s.id}>
              <rect
                id={`rect-${s.id}`}
                x={s.x - w / 2}
                y={s.y - h / 2}
                width={w}
                height={h}
                rx="4"
                fill={s.fill}
                stroke={isDark ? "#94C11C" : "#1C1C1A"}
                strokeWidth="1.5"
              />
              <text
                x={s.x}
                y={s.y - 2}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill={isDark ? "white" : "#1C1C1A"}
              >
                {s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name}
              </text>
              <text
                x={s.x}
                y={s.y + 10}
                textAnchor="middle"
                fontSize="8"
                fill={isDark ? "#94C11C" : "#1C1C1A"}
              >
                {Math.round(stationCapacity(s))}/t
              </text>
              <text
                x={s.x}
                y={s.y + h / 2 + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#5F5E5A"
              >
                Cola:{" "}
                <tspan id={`q-${s.id}`} fontWeight="600" fill="#1C1C1A">
                  0
                </tspan>{" "}
                ·{" "}
                <tspan id={`u-${s.id}`} fontWeight="600" fill="#1C1C1A">
                  0%
                </tspan>
              </text>
            </g>
          );
        })}

        {/* Capa de piezas animadas */}
        <g ref={layerRef} />

        {/* Badge de cuello de botella */}
        <g id="bn-badge" style={{ display: "none" }}>
          <rect x="0" y="0" width="120" height="20" rx="10" fill="#A32D2D" />
          <text
            x="60"
            y="13"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="white"
          >
            CUELLO DE BOTELLA
          </text>
        </g>

        {/* Leyenda */}
        <text x="40" y="335" fontSize="9" fill="#5F5E5A">
          Cabezal
        </text>
        <circle cx="80" cy="332" r="4" fill="#94C11C" stroke="#1C1C1A" strokeWidth="0.8" />
        <text x="100" y="335" fontSize="9" fill="#5F5E5A">
          Larguero bisagra
        </text>
        <circle cx="178" cy="332" r="4" fill="#1C1C1A" />
        <text x="198" y="335" fontSize="9" fill="#5F5E5A">
          Larguero embutido
        </text>
        <circle cx="288" cy="332" r="4" fill="#888780" />
        <text x="308" y="335" fontSize="9" fill="#5F5E5A">
          Cada marca = 5 marcos
        </text>
      </svg>
    </div>
  );
}
