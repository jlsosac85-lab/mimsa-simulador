"use client";

import { Station, GlobalParams, SimulationResult } from "@/lib/simulation";
import { FlagsBar } from "./FlagsBar";
import { WeatherWidget } from "./WeatherWidget";

interface Props {
  stations: Station[];
  params: GlobalParams;
  result: SimulationResult;
}

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  tone?: "green" | "white" | "amber";
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
      tone: "amber",
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
      unit: "serie y paralelo",
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
    <div className="mb-4 overflow-hidden rounded-xl border border-mimsa-green/25 bg-mimsa-black shadow-sm">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-stretch lg:gap-5">
        {/* Izquierda: banderas (mercados) */}
        <div className="flex shrink-0 items-center gap-3 lg:border-r lg:border-white/10 lg:pr-5">
          <FlagsBar />
        </div>

        {/* Centro: KPIs grandes y centrados */}
        <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="flex flex-col items-center justify-center text-center"
            >
              <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-mimsa-grayLight">
                {k.label}
              </span>
              <span
                className={`font-mono text-2xl font-bold leading-none ${
                  k.tone === "green"
                    ? "text-mimsa-green"
                    : k.tone === "amber"
                    ? "text-alert-amber"
                    : "text-white"
                }`}
              >
                {k.value}
              </span>
              {k.unit && (
                <span className="mt-1 text-[10px] text-mimsa-grayLight">
                  {k.unit}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Derecha: clima de Monterrey */}
        <div className="flex shrink-0 items-center lg:border-l lg:border-white/10 lg:pl-5">
          <WeatherWidget />
        </div>
      </div>
    </div>
  );
}
