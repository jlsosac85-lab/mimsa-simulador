"use client";

import { useMemo, useState } from "react";
import {
  Station,
  GlobalParams,
  ProductionLine,
  evaluate,
} from "@/lib/simulation";
import { MimsaLogo } from "./MimsaLogo";
import { KpiStrip } from "./KpiStrip";
import { StationCard } from "./StationCard";
import { PlantLayout } from "./PlantLayout";
import { StaffingPanel } from "./StaffingPanel";
import { ResultsPanel } from "./ResultsPanel";

export function Simulator({ line }: { line: ProductionLine }) {
  const [stations, setStations] = useState<Station[]>(() => line.makeStations());
  const [params, setParams] = useState<GlobalParams>(() => line.makeParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [startMode, setStartMode] = useState<"carga" | "transitorio">("carga");
  const [live, setLive] = useState({ hour: 0, completed: 0, wip: 0 });

  const result = useMemo(() => evaluate(stations, params), [stations, params]);

  function patchStation(id: string, patch: Partial<Station>) {
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
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
        marcosPorHora: s.ratePerHour,
        horas: s.hours,
        capacidadTurno: Math.round(s.ratePerHour * s.hours),
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
      <header className="mb-4 flex items-center gap-4 rounded-lg bg-mimsa-black px-5 py-3">
        <MimsaLogo size={46} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight text-white">
            Simulador de Producción
          </h1>
          <p className="text-[11px] tracking-wide text-mimsa-green">
            {line.name.toUpperCase()} · ANÁLISIS DE CUELLOS DE BOTELLA
          </p>
        </div>
      </header>

      {/* Cintilla de KPIs principales */}
      <KpiStrip line={line} stations={stations} params={params} result={result} />

      {/* Parametros globales */}
      <section className="mb-4 grid gap-3 rounded-lg bg-mimsa-bgAlt p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-mimsa-gray">
            Objetivo marcos/turno
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
            <span className="w-14 text-right font-mono text-sm font-semibold text-mimsa-black">
              {params.targetMarcos}
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-mimsa-gray">
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
            className="rounded-md border border-mimsa-line bg-white px-2 py-1.5 text-sm font-medium outline-none focus:border-mimsa-green focus:ring-1 focus:ring-mimsa-green"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-mimsa-gray">
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
            className="rounded-md border border-mimsa-line bg-white px-2 py-1.5 text-sm font-medium outline-none focus:border-mimsa-green focus:ring-1 focus:ring-mimsa-green"
          />
        </label>
      </section>

      {/* Controles de animacion */}
      <section className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className="inline-flex items-center gap-2 rounded-md bg-mimsa-green px-4 py-2 text-sm font-semibold text-mimsa-black transition-opacity hover:opacity-90"
        >
          {running ? "❚❚ Pausa" : "▶ Iniciar simulación"}
        </button>
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] text-mimsa-gray">Arranque</span>
          <select
            value={startMode}
            onChange={(e) => {
              setStartMode(e.target.value as "carga" | "transitorio");
              resetSim();
            }}
            className="rounded-md border border-mimsa-line bg-white px-2 py-2 text-sm font-medium text-mimsa-black outline-none focus:border-mimsa-green"
          >
            <option value="carga">Carga 100% por estación</option>
            <option value="transitorio">Con transitorio (en cadena)</option>
          </select>
        </label>
        <button
          onClick={resetSim}
          className="inline-flex items-center gap-2 rounded-md border border-mimsa-line bg-white px-4 py-2 text-sm font-medium text-mimsa-black transition-opacity hover:opacity-90"
        >
          ↻ Reiniciar
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-mimsa-gray">Velocidad</span>
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
          className="inline-flex items-center gap-2 rounded-md border border-mimsa-line bg-white px-4 py-2 text-sm font-medium text-mimsa-black transition-opacity hover:opacity-90"
        >
          ↓ Exportar escenario (JSON)
        </button>
        <div className="ml-auto inline-flex items-center gap-3 rounded-lg border border-mimsa-green/40 bg-mimsa-black px-4 py-2 font-mono text-sm font-bold text-mimsa-green shadow-sm">
          <span>
            Hora <span className="text-white">{live.hour.toFixed(1)}</span>
            <span className="text-mimsa-green/60">/11</span>
          </span>
          <span className="text-mimsa-green/40">·</span>
          <span>
            Marcos <span className="text-white">{live.completed}</span>
          </span>
          <span className="text-mimsa-green/40">·</span>
          <span>
            WIP <span className="text-white">{live.wip}</span>
          </span>
        </div>
      </section>

      {/* Plano animado */}
      <section className="mb-4">
        <PlantLayout
          line={line}
          stations={stations}
          target={params.targetMarcos}
          running={running}
          speed={speed}
          mode={startMode}
          onTick={setLive}
        />
      </section>

      {/* Comparativo de plantilla */}
      <section className="mb-4">
        <StaffingPanel line={line} stations={stations} />
      </section>

      {/* Resultados */}
      <section className="mb-4">
        <ResultsPanel
          result={result}
          params={params}
          liveCompleted={live.completed}
        />
      </section>

      {/* Estaciones editables */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-mimsa-black">
            Estaciones — edita personas, ritmo y horas
          </h2>
          <span className="text-[11px] text-mimsa-gray">
            Capacidad = marcos/hora × horas
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.stationResults.map((r) => (
            <StationCard
              key={r.station.id}
              station={r.station}
              isBottleneck={r.isBottleneck}
              onChange={patchStation}
            />
          ))}
        </div>
      </section>

      <footer className="mt-6 border-t border-mimsa-line pt-4 text-center text-[11px] text-mimsa-gray">
        MIMSA · Manufactura Integral de Marcos y Soluciones de Acero — Simulador
        de línea de Marcos Metálicos. Datos base del análisis de tiempos por
        estación.
      </footer>
    </div>
  );
}
