"use client";

import { Station, GlobalParams, SimulationResult, ProductionLine, requiredPeople } from "@/lib/simulation";

interface Props {
  line: ProductionLine;
  stations: Station[];
  params: GlobalParams;
  result: SimulationResult;
}

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  small?: boolean; // valor de texto largo (p.ej. nombre del cuello): tipografía menor con ajuste
}

export function KpiStrip({ line, stations, params, result }: Props) {
  const totalPeople = stations.reduce((sum, s) => sum + s.people, 0);

  // Personal sugerido = operadores que el ritmo de cada estacion requiere.
  // Si se asignan mas de los necesarios, el sugerido queda por debajo del
  // actual, evidenciando la sobre-dotacion.
  const suggestedPeople = stations.reduce((sum, s) => sum + requiredPeople(line, s), 0);

  const kpis: Kpi[] = [
    {
      label: "Capacidad / turno",
      value: Math.round(result.effectiveCapacity).toLocaleString("es-MX"),
      unit: line.unit,
    },
    {
      label: "Proyección mensual",
      value: Math.round(result.monthlyCapacity).toLocaleString("es-MX"),
      unit: `${line.unit} · ${params.workingDays} días`,
    },
    {
      label: "Cuello de botella",
      value: result.bottleneck.name,
      small: true,
      unit: `${Math.round(
        result.stationResults.find((r) => r.isBottleneck)!.capacity
      ).toLocaleString("es-MX")} máx`,
    },
    {
      label: "Personal en línea",
      value: String(totalPeople),
      unit: "actual",
    },
    {
      label: "Personal sugerido",
      value: String(suggestedPeople),
      unit: "necesario por ritmo",
    },
    {
      label: "Estaciones",
      value: String(stations.length),
      unit: "serie y paralelo",
    },
    line.assembly === "and"
      ? {
          label: "Componentes",
          value: String(line.pieceTypes.length),
          unit: line.pieceTypes.join(" + "),
        }
      : {
          label: "Flujo dividido",
          value: `${line.pieceTypes.length} vías`,
          unit: "50 / 50 en paralelo",
        },
  ];

  return (
    <div className="hud-panel hud-bracket mb-4 overflow-hidden">
      {/* Cabecera de telemetría */}
      <div className="flex items-center justify-between border-b border-mimsa-green/15 px-5 py-1.5">
        <span className="hud-label text-[9px] text-mimsa-greenDark/70">
          MIMSA · Telemetría de línea
        </span>
        <span className="flex items-center gap-1.5 hud-label text-[9px] text-mimsa-gray">
          <span className="h-1.5 w-1.5 rounded-full bg-mimsa-green shadow-glow-sm animate-pulse" />
          En vivo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-5 px-5 py-5 sm:grid-cols-3 lg:grid-cols-7">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`relative flex min-w-0 flex-col items-center justify-center px-2 text-center ${
              i > 0 ? "lg:border-l lg:border-mimsa-green/15" : ""
            }`}
          >
            <span className="mb-1.5 hud-label text-[9.5px] font-semibold text-mimsa-gray">
              {k.label}
            </span>
            <span
              className={`hud-glow w-full font-mono font-bold text-mimsa-greenDark ${
                k.small
                  ? "text-sm leading-tight break-words hyphens-auto"
                  : "text-[26px] leading-none"
              }`}
            >
              {k.value}
            </span>
            {k.unit && (
              <span className="mt-1.5 text-[10px] leading-tight text-mimsa-greenDark/60">
                {k.unit}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
