"use client";

import { Station, GlobalParams, SimulationResult } from "@/lib/simulation";

interface Props {
  stations: Station[];
  params: GlobalParams;
  result: SimulationResult;
}

interface Kpi {
  label: string;
  value: string;
  unit?: string;
}

export function KpiStrip({ stations, params, result }: Props) {
  const totalPeople = stations.reduce((sum, s) => sum + s.people, 0);

  const kpis: Kpi[] = [
    {
      label: "Capacidad / turno",
      value: Math.round(result.effectiveCapacity).toLocaleString("es-MX"),
      unit: "marcos",
    },
    {
      label: "Proyección mensual",
      value: Math.round(result.monthlyCapacity).toLocaleString("es-MX"),
      unit: `marcos · ${params.workingDays} días`,
    },
    {
      label: "Cuello de botella",
      value: result.bottleneck.name,
      unit: `${Math.round(
        result.stationResults.find((r) => r.isBottleneck)!.capacity
      ).toLocaleString("es-MX")} máx`,
    },
    {
      label: "Personal en línea",
      value: String(totalPeople),
      unit: "operarios",
    },
    {
      label: "Estaciones",
      value: String(stations.length),
      unit: "serie y paralelo",
    },
    {
      label: "Piezas por marco",
      value: "2",
      unit: "bisagra + embutido",
    },
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-mimsa-green/30 bg-mimsa-black shadow-sm">
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex flex-col items-center justify-center text-center ${
              i > 0 ? "lg:border-l lg:border-white/10" : ""
            }`}
          >
            <span className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-mimsa-grayLight">
              {k.label}
            </span>
            <span className="font-mono text-2xl font-bold leading-none text-mimsa-green">
              {k.value}
            </span>
            {k.unit && (
              <span className="mt-1.5 text-[10px] text-mimsa-green/70">
                {k.unit}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
