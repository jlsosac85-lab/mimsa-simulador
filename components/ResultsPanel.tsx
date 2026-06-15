"use client";

import { SimulationResult, GlobalParams } from "@/lib/simulation";

interface Props {
  result: SimulationResult;
  params: GlobalParams;
  liveCompleted: number;
}

export function ResultsPanel({ result, params, liveCompleted }: Props) {
  const { bottleneck, effectiveCapacity, monthlyCapacity, feasible, deficit } =
    result;

  const fulfillment =
    params.targetMarcos > 0
      ? Math.min(100, Math.round((liveCompleted / params.targetMarcos) * 100))
      : 0;

  // Sugerencia segun el cuello detectado.
  const tips: string[] = [];
  if (!feasible) {
    const b = bottleneck.id;
    if (b === "pintura") {
      tips.push(
        "Sube personas en Pintura o instala el sprocket + cadena para duplicar su ritmo"
      );
      tips.push("Habilita pintura en el turno noche para sumar horas");
    } else if (b === "roladora") {
      tips.push(
        "Extiende horas de la Roladora o agrega una segunda para el larguero"
      );
    } else if (b === "troquel-embutido") {
      tips.push(
        "Embute solo 1 larguero por marco, o sube ritmo/horas del Troquel Embutido"
      );
    } else if (b === "embolsado") {
      tips.push("Agrega una persona más en Embolsado o extiende sus horas");
    } else if (b === "remachadora") {
      tips.push("Extiende horas de la Remachadora o suma una segunda estación");
    } else {
      tips.push(`Sube personas, ritmo u horas en ${bottleneck.name}`);
    }
  }

  return (
    <div className="rounded-lg border border-mimsa-line bg-white p-4">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Cumplimiento (vivo)"
          value={`${fulfillment}%`}
          tone="black"
        />
        <Metric
          label="Cuello de botella"
          value={bottleneck.name}
          tone="red"
          small
        />
        <Metric
          label="Capacidad / turno"
          value={Math.round(effectiveCapacity).toLocaleString("es-MX")}
          tone="green"
        />
        <Metric
          label="Proyección mensual"
          value={Math.round(monthlyCapacity).toLocaleString("es-MX")}
          tone="green"
        />
      </div>

      <div
        className={`rounded-md border-l-[3px] p-3 text-sm leading-relaxed ${
          feasible
            ? "border-mimsa-green bg-mimsa-greenLight text-mimsa-black"
            : "border-alert-red bg-alert-redLight text-mimsa-black"
        }`}
      >
        {feasible ? (
          <>
            <strong className="text-mimsa-greenDark">Objetivo factible.</strong>{" "}
            El sistema puede entregar{" "}
            {params.targetMarcos.toLocaleString("es-MX")} marcos en el turno. La
            estación más exigida es <strong>{bottleneck.name}</strong>, trabajando
            al{" "}
            {Math.round(
              (params.targetMarcos /
                result.stationResults.find((r) => r.isBottleneck)!.capacity) *
                100
            )}
            % de su capacidad.
          </>
        ) : (
          <>
            <strong className="text-alert-red">Objetivo no factible.</strong>{" "}
            Faltan {Math.round(deficit).toLocaleString("es-MX")} marcos. El cuello
            es <strong>{bottleneck.name}</strong> (máx{" "}
            {Math.round(
              result.stationResults.find((r) => r.isBottleneck)!.capacity
            ).toLocaleString("es-MX")}{" "}
            marcos/turno).{" "}
            {tips.length > 0 && (
              <span>
                Opciones: {tips.join(" · ")}.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone: "black" | "green" | "red";
  small?: boolean;
}) {
  const color =
    tone === "green"
      ? "text-mimsa-greenDark"
      : tone === "red"
      ? "text-alert-red"
      : "text-mimsa-black";
  return (
    <div className="rounded-md bg-mimsa-bg p-2.5">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-mimsa-gray">
        {label}
      </div>
      <div
        className={`font-mono font-semibold ${color} ${
          small ? "text-sm" : "text-xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
