"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Station,
  GlobalParams,
  ProductionLine,
  FibrexOptions,
  FIBREX_DEFAULTS,
  makeFibrexLine,
  evaluate,
  peopleForTarget,
  stationCapacity,
  stationRatePerHour,
} from "@/lib/simulation";
import { MimsaLogo } from "./MimsaLogo";
import { KpiStrip } from "./KpiStrip";
import { StationCard } from "./StationCard";
import { PlantLayout } from "./PlantLayout";
import { StaffingPanel } from "./StaffingPanel";
import { ResultsPanel } from "./ResultsPanel";
import { EfficiencyGauge } from "./EfficiencyGauge";

export function Simulator({ line }: { line: ProductionLine }) {
  const [fibrexOpts, setFibrexOpts] = useState<FibrexOptions>(FIBREX_DEFAULTS);

  // Linea efectiva: para Fibrex se reconstruye segun las opciones elegidas
  // (pegado / escuadradora / 2a pintura); las demas lineas pasan tal cual.
  const effLine = useMemo<ProductionLine>(
    () => (line.id === "fibrex" ? makeFibrexLine(fibrexOpts) : line),
    [line, fibrexOpts]
  );

  const [stations, setStations] = useState<Station[]>(() => effLine.makeStations());
  const [params, setParams] = useState<GlobalParams>(() => effLine.makeParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [startMode, setStartMode] = useState<"carga" | "transitorio">("carga");
  const [live, setLive] = useState({ hour: 0, completed: 0, wip: 0 });

  // Al cambiar las opciones de Fibrex (o la línea), regenera estaciones,
  // restablece el objetivo base de la línea y reinicia.
  useEffect(() => {
    setStations(effLine.makeStations());
    setParams(effLine.makeParams());
    setRunning(false);
    setLive({ hour: 0, completed: 0, wip: 0 });
    window.dispatchEvent(new Event("mimsa-reset"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effLine]);

  const result = useMemo(() => evaluate(stations, params), [stations, params]);

  // El objetivo es la variable que fija el usuario; la capacidad lo SIGUE al
  // ajustar personas, ritmo u horas (ahora la capacidad escala con las
  // personas). Por eso ya no se auto-igualan: mover el objetivo no toca la
  // capacidad, y aplicar la plantilla sugerida sube la capacidad hasta cubrir
  // el objetivo sin que éste se mueva.

  // --- Eficiencia de la línea ---
  // Combina dos factores:
  //   1) Producción: puertas reales vs. producción ideal a esta hora del turno
  //      (100% = capacidad base del turno, la línea a tope).
  //   2) Mano de obra: plantilla necesaria por ritmo vs. plantilla asignada
  //      (si hay operadores de más, este factor baja y penaliza el exceso).
  // Eficiencia global = producción × mano de obra. El 100% solo se logra
  // produciendo a tope Y con la plantilla justa.
  // El ideal crece con el turno pero NO supera la capacidad base: una vez
  // cumplidas las 11 h, el 100% es producir toda la capacidad del turno (si la
  // línea siguió vaciando WIP después del turno, no se penaliza por el tiempo
  // extra).
  const baseCapacity = result.effectiveCapacity;
  const turnProgress = Math.min(1, live.hour / 11);
  const idealNow = baseCapacity * turnProgress;
  const prodRatio =
    live.hour > 0.4 && idealNow > 0 ? Math.min(1, live.completed / idealNow) : 0;

  const totalPeople = stations.reduce((a, s) => a + s.people, 0);
  const neededPeople = stations.reduce(
    (a, s) => a + peopleForTarget(s, params.targetMarcos),
    0
  );
  const staffRatio = totalPeople > 0 ? Math.min(1, neededPeople / totalPeople) : 1;

  const measuring = running || live.hour > 0.4;
  const prodPct = prodRatio * 100;
  const staffPct = staffRatio * 100;
  const efficiency = Math.max(0, Math.min(100, prodRatio * staffRatio * 100));

  function patchStation(id: string, patch: Partial<Station>) {
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  // Aplica la plantilla sugerida: escribe en cada estación las personas
  // recomendadas para el objetivo actual (de un solo clic, sin editar a mano).
  function applyStaffing(assignments: { id: string; people: number }[]) {
    setStations((prev) =>
      prev.map((s) => {
        const a = assignments.find((x) => x.id === s.id);
        return a ? { ...s, people: a.people } : s;
      })
    );
  }

  // Restablece las personas a la plantilla base de la línea (sin tocar ritmo,
  // horas ni objetivo).
  function resetStaffingBase() {
    const base = effLine.makeStations();
    setStations((prev) =>
      prev.map((s) => {
        const b = base.find((x) => x.id === s.id);
        return b ? { ...s, people: b.people } : s;
      })
    );
  }

  function resetSim() {
    setRunning(false);
    setLive({ hour: 0, completed: 0, wip: 0 });
    window.dispatchEvent(new Event("mimsa-reset"));
  }

  function exportConfig() {
    const payload = {
      exportadoEl: new Date().toISOString(),
      parametros: params,
      estaciones: stations.map((s) => ({
        nombre: s.name,
        personas: s.people,
        ritmoPorPersona: s.ratePerPerson,
        marcosPorHora: Math.round(stationRatePerHour(s)),
        horas: s.hours,
        capacidadTurno: Math.round(stationCapacity(s)),
      })),
      resultado: {
        capacidadSistema: Math.round(result.systemCapacity),
        capacidadEfectiva: Math.round(result.effectiveCapacity),
        proyeccionMensual: Math.round(result.monthlyCapacity),
        cuelloDeBotella: result.bottleneck.name,
        objetivoFactible: result.feasible,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "escenario-mimsa.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full">
      {/* Header */}
      <header className="hud-panel hud-bracket hud-scan mb-4 flex items-center gap-4 px-6 py-3.5">
        <MimsaLogo size={46} />
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold leading-tight tracking-wide text-mimsa-black">
            Simulador de Producción
          </h1>
          <p className="hud-label text-[11px] text-mimsa-greenDark hud-glow">
            {effLine.name.toUpperCase()} · Análisis de cuellos de botella
          </p>
        </div>
      </header>

      {/* Cintilla de KPIs principales */}
      <KpiStrip line={effLine} stations={stations} params={params} result={result} />

      {/* Parametros globales */}
      <section className="hud-card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="hud-label text-[10px] text-mimsa-gray">
            Objetivo {effLine.unit}/turno
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={200}
              max={2500}
              step={20}
              value={params.targetMarcos}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  targetMarcos: parseInt(e.target.value),
                }))
              }
              className="flex-1"
            />
            <span className="w-14 text-right font-mono text-sm font-bold text-mimsa-greenDark hud-glow">
              {params.targetMarcos}
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="hud-label text-[10px] text-mimsa-gray">
            Materia prima disponible (0 = sin límite)
          </span>
          <input
            type="number"
            min={0}
            step={100}
            value={params.rawMaterial}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                rawMaterial: Math.max(0, parseInt(e.target.value) || 0),
              }))
            }
            className="hud-field rounded-md px-2 py-1.5 text-sm font-medium"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="hud-label text-[10px] text-mimsa-gray">
            Días hábiles (proyección mensual)
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={params.workingDays}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                workingDays: Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
            className="hud-field rounded-md px-2 py-1.5 text-sm font-medium"
          />
        </label>
      </section>

      {/* Plantilla sugerida por estacion para el objetivo (reactiva al slider) */}
      <section className="mb-4">
        <StaffingPanel
          line={effLine}
          stations={stations}
          target={params.targetMarcos}
          onApply={applyStaffing}
          onResetBase={resetStaffingBase}
        />
      </section>

      {/* Opciones especificas de la linea Fibrex */}
      {line.id === "fibrex" && (
        <section className="hud-card-green mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <div className="sm:col-span-3 -mb-1 flex items-center gap-2">
            <span className="hud-label rounded bg-mimsa-green px-2 py-0.5 text-[10px] font-bold text-mimsa-black">
              Configuración Fibrex
            </span>
            <span className="text-[11px] text-mimsa-gray">
              Cambia el tipo de proceso y observa cómo se mueve el cuello de botella
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="hud-label text-[10px] text-mimsa-gray">
              Pegado
            </span>
            <select
              value={fibrexOpts.pegado}
              onChange={(e) =>
                setFibrexOpts((o) => ({ ...o, pegado: e.target.value as FibrexOptions["pegado"] }))
              }
              className="hud-field rounded-md px-2 py-2 text-sm font-medium"
            >
              <option value="normal">Puerta Lisa Normal — 3 personas · 1,144/turno</option>
              <option value="bostoniano">Bostoniano (Extras) — 6 personas · 624/turno</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="hud-label text-[10px] text-mimsa-gray">
              Escuadradora
            </span>
            <select
              value={fibrexOpts.escuadra}
              onChange={(e) =>
                setFibrexOpts((o) => ({ ...o, escuadra: e.target.value as FibrexOptions["escuadra"] }))
              }
              className="hud-field rounded-md px-2 py-2 text-sm font-medium"
            >
              <option value="normal">Escuadradora — 4 personas · 780/turno</option>
              <option value="doble">Doble Paso (Extras) — 6 personas · 1,560/turno</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="hud-label text-[10px] text-mimsa-gray">
              Pintura de Cantos
            </span>
            <button
              type="button"
              onClick={() => setFibrexOpts((o) => ({ ...o, pintura2: !o.pintura2 }))}
              className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                fibrexOpts.pintura2
                  ? "border border-mimsa-green bg-mimsa-green text-mimsa-black"
                  : "hud-btn"
              }`}
            >
              {fibrexOpts.pintura2
                ? "● 2 líneas en paralelo (1,560/turno)"
                : "○ 1 línea (780/turno) — clic para 2ª"}
            </button>
          </label>
        </section>
      )}

      {/* Controles de animacion */}
      <section className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className="inline-flex items-center gap-2 rounded-md bg-mimsa-green px-4 py-2 text-sm font-semibold text-mimsa-black shadow-glow-sm transition-opacity hover:opacity-90"
        >
          {running ? "❚❚ Pausa" : "▶ Iniciar simulación"}
        </button>
        <label className="flex items-center gap-1.5">
          <span className="hud-label text-[10px] text-mimsa-gray">Arranque</span>
          <select
            value={startMode}
            onChange={(e) => {
              setStartMode(e.target.value as "carga" | "transitorio");
              resetSim();
            }}
            className="hud-field rounded-md px-2 py-2 text-sm font-medium"
          >
            <option value="carga">Carga 100% por estación</option>
            <option value="transitorio">Con transitorio (en cadena)</option>
          </select>
        </label>
        <button
          onClick={resetSim}
          className="hud-btn inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          ↻ Reiniciar
        </button>
        <div className="flex items-center gap-2">
          <span className="hud-label text-[10px] text-mimsa-gray">Velocidad</span>
          <input
            type="range"
            min={1}
            max={10}
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value))}
            className="w-24"
          />
        </div>
        <button
          onClick={exportConfig}
          className="hud-btn inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          ↓ Exportar escenario (JSON)
        </button>
        <div className="ml-auto inline-flex items-center gap-3 rounded-lg border border-mimsa-green/40 bg-white px-4 py-2 font-mono text-sm font-bold text-mimsa-greenDark shadow-glow-sm">
          <span>
            Hora <span className="text-mimsa-black">{live.hour.toFixed(1)}</span>
            <span className="text-mimsa-greenDark/60">/11</span>
          </span>
          <span className="text-mimsa-greenDark/40">·</span>
          <span>
            <span className="capitalize">{effLine.unit}</span>{" "}
            <span className="text-mimsa-black">{live.completed}</span>
          </span>
          <span className="text-mimsa-greenDark/40">·</span>
          <span>
            WIP <span className="text-mimsa-black">{live.wip}</span>
          </span>
        </div>
      </section>

      {/* Plano animado */}
      <section className="mb-4">
        <EfficiencyGauge
          efficiency={efficiency}
          measuring={measuring}
          unit={effLine.unit}
          baseCapacity={baseCapacity}
          prodPct={prodPct}
          staffPct={staffPct}
          totalPeople={totalPeople}
          neededPeople={neededPeople}
        />
        <PlantLayout
          line={effLine}
          stations={stations}
          target={params.targetMarcos}
          systemCapacity={result.effectiveCapacity}
          running={running}
          speed={speed}
          mode={startMode}
          onTick={setLive}
        />
      </section>

      {/* Resultados */}
      <section className="mb-4">
        <ResultsPanel
          line={effLine}
          result={result}
          params={params}
          liveCompleted={live.completed}
        />
      </section>

      {/* Estaciones editables */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="hud-label text-xs font-semibold text-mimsa-greenDark">
            Estaciones — edita personas, ritmo y horas
          </h2>
          <span className="text-[11px] text-mimsa-gray">
            Capacidad = personas × {effLine.unit}/h·persona × horas
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.stationResults.map((r) => (
            <StationCard
              key={r.station.id}
              station={r.station}
              isBottleneck={r.isBottleneck}
              unit={effLine.unit}
              onChange={patchStation}
            />
          ))}
        </div>
      </section>

      <footer className="mt-6 border-t border-mimsa-green/15 pt-4 text-center text-[11px] text-mimsa-gray">
        MIMSA · Manufactura Integral de Marcos y Soluciones de Acero — Simulador
        de {effLine.name}. Datos base del análisis de tiempos por estación.
      </footer>
    </div>
  );
}
