"use client";

interface Props {
  /** Eficiencia 0–100 (producción real vs capacidad base del turno). */
  efficiency: number;
  /** La simulación está corriendo o ya avanzó. */
  measuring: boolean;
  /** Unidad de la línea (puertas, marcos…). */
  unit: string;
  /** Capacidad base del turno (100% de eficiencia). */
  baseCapacity: number;
}

// Estados por rango, de mayor a menor.
const STAGES = [
  { min: 90, label: "Óptima", color: "#5A9E12" },
  { min: 70, label: "Buena", color: "#94C11C" },
  { min: 50, label: "Media", color: "#D9A400" },
  { min: 25, label: "Baja", color: "#EF9F27" },
  { min: 0, label: "Crítica", color: "#A32D2D" },
];

const GRADIENT =
  "linear-gradient(to right, #A32D2D 0%, #EF9F27 27%, #E6B800 50%, #94C11C 76%, #5A9E12 100%)";

export function EfficiencyGauge({ efficiency, measuring, unit, baseCapacity }: Props) {
  const pct = Math.max(0, Math.min(100, efficiency));
  const stage = STAGES.find((s) => pct >= s.min) || STAGES[STAGES.length - 1];

  return (
    <div className="mb-3 rounded-lg border border-mimsa-line bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-mimsa-gray">
            Eficiencia de la línea
          </span>
          <span className="text-[10px] text-mimsa-gray/80">
            100% = {Math.round(baseCapacity).toLocaleString("es-MX")} {unit}/turno
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-2xl font-bold leading-none"
            style={{ color: measuring ? stage.color : "#888780" }}
          >
            {measuring ? `${pct.toFixed(0)}%` : "—"}
          </span>
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: measuring ? stage.color : "#888780" }}
          >
            {measuring ? stage.label : "en espera"}
          </span>
        </div>
      </div>

      {/* Cilindro horizontal con escala de color */}
      <div className="relative">
        <div className="relative h-7 w-full overflow-hidden rounded-full" style={{ background: GRADIENT }}>
          {/* atenúa la zona aún no alcanzada */}
          {measuring && (
            <div
              className="absolute inset-y-0 right-0 rounded-r-full bg-mimsa-black/55 transition-all duration-300"
              style={{ left: `${pct}%` }}
            />
          )}
          {/* brillo para dar volumen de cilindro */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.45), rgba(255,255,255,0) 48%, rgba(0,0,0,0.22))",
            }}
          />
        </div>

        {/* Aguja en la posición de la eficiencia */}
        {measuring && (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${pct}%` }}
          >
            <div className="h-9 w-[3px] rounded-full bg-white shadow-[0_0_5px_rgba(0,0,0,0.55)] ring-1 ring-mimsa-black/30" />
          </div>
        )}

        {/* Escala */}
        <div className="mt-1 flex justify-between text-[9px] font-medium text-mimsa-gray">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      {!measuring && (
        <p className="mt-1.5 text-[10px] text-mimsa-gray">
          Inicia la simulación para medir el ritmo real contra la capacidad base.
        </p>
      )}
    </div>
  );
}
