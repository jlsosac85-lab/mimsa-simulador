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
  tone?: "green" | "white" | "red";
}

export function KpiStrip({ stations, params, result }: Props) {
  const totalPeople = stations.reduce((sum, s) => sum + s.people, 0);

  const kpis: Kpi[] = [
    {
      label: "Capacidad / turno",
      value: Math.round(result.effectiveCapacity).toLocaleString("es-MX"),
      unit: "marcos",
      tone: "green",
    },
    {
      label: "Proyección mensual",
      value: Math.round(result.monthlyCapacity).toLocaleString("es-MX"),
      unit: `marcos · ${params.workingDays} días`,
      tone: "white",
    },
    {
      label: "Cuello de botella",
      value: result.bottleneck.name,
      unit: `${Math.round(
        result.stationResults.find((r) => r.isBottleneck)!.capacity
      ).toLocaleString("es-MX")} máx`,
      tone: "red",
    },
    {
      label: "Personal en línea",
      value: String(totalPeople),
      unit: "operarios",
      tone: "white",
    },
    {
      label: "Estaciones",
      value: String(stations.length),
      unit: "en serie y paralelo",
      tone: "white",
    },
    {
      label: "Piezas por marco",
      value: "3",
      unit: "1 cabezal + 2 largueros",
      tone: "white",
    },
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-mimsa-carbon bg-mimsa-carbon">
      <div className="flex items-stretch overflow-x-auto">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex min-w-[150px] flex-1 flex-col gap-0.5 px-4 py-3 ${
              i > 0 ? "border-l border-white/10" : ""
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-mimsa-grayLight">
              {k.label}
            </span>
            <span
              className={`font-mono text-lg font-semibold leading-tight ${
                k.tone === "green"
                  ? "text-mimsa-green"
                  : k.tone === "red"
                  ? "text-alert-amber"
                  : "text-white"
              }`}
            >
              {k.value}
            </span>
            {k.unit && (
              <span className="text-[10px] text-mimsa-grayLight">{k.unit}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
