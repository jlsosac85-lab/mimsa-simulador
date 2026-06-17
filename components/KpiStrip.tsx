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
    <div className="mb-4 overflow-hidden rounded-xl border border-mimsa-green/30 bg-mimsa-black shadow-sm">
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 p-4 sm:grid-cols-3 lg:grid-cols-7">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex min-w-0 flex-col items-center justify-center px-1 text-center ${
              i > 0 ? "lg:border-l lg:border-white/10" : ""
            }`}
          >
            <span className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-mimsa-grayLight">
              {k.label}
            </span>
            <span
              className={`w-full font-mono font-bold text-mimsa-green ${
                k.small
                  ? "text-sm leading-tight break-words hyphens-auto"
                  : "text-2xl leading-none"
              }`}
            >
              {k.value}
            </span>
            {k.unit && (
              <span className="mt-1.5 text-[10px] leading-tight text-mimsa-green/70">
                {k.unit}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
