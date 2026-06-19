"use client";

interface Props {
  /** Eficiencia global 0–100 (producción × aprovechamiento de personal). */
  efficiency: number;
  /** La simulación está corriendo o ya avanzó. */
  measuring: boolean;
  /** Unidad de la línea (puertas, marcos…). */
  unit: string;
  /** Capacidad base del turno (100% de eficiencia). */
  baseCapacity: number;
  /** Factor de producción (0–100): real vs. capacidad base. */
  prodPct: number;
  /** Factor de mano de obra (0–100): plantilla necesaria vs. asignada. */
  staffPct: number;
  /** Operadores asignados. */
  totalPeople: number;
  /** Operadores necesarios por ritmo. */
  neededPeople: number;
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

export function EfficiencyGauge({
  efficiency,
  measuring,
  unit,
  baseCapacity,
  prodPct,
  staffPct,
  totalPeople,
  neededPeople,
}: Props) {
  const pct = Math.max(0, Math.min(100, efficiency));
  const stage = STAGES.find((s) => pct >= s.min) || STAGES[STAGES.length - 1];
  const exceso = totalPeople - neededPeople;

  return (
    <div className="hud-card mb-3 px-4 py-3">
      <div className="hud-head mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="hud-label text-[11px] font-bold text-white">
            Eficiencia de la línea
          </span>
          <span className="text-[10px] text-mimsa-green/70">
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

      {/* Desglose de los dos factores */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mimsa-green/15 pt-2 text-[11px]">
        <span className="text-mimsa-gray">
          Producción{" "}
          <span className="font-mono font-semibold text-mimsa-black">
            {measuring ? `${prodPct.toFixed(0)}%` : "—"}
          </span>
        </span>
        <span className="text-mimsa-gray/50">×</span>
        <span className="text-mimsa-gray">
          Mano de obra{" "}
          <span
            className="font-mono font-semibold"
            style={{ color: staffPct < 99 ? "#A32D2D" : "#1C1C1A" }}
          >
            {staffPct.toFixed(0)}%
          </span>
        </span>
        <span className="text-mimsa-gray/60">
          ({totalPeople} asignados · {neededPeople} necesarios
          {exceso > 0 ? ` · ${exceso} de más` : ""})
        </span>
      </div>

      {!measuring && (
        <p className="mt-1.5 text-[10px] text-mimsa-gray">
          Inicia la simulación para medir el ritmo real contra la capacidad base.
        </p>
      )}
    </div>
  );
}
