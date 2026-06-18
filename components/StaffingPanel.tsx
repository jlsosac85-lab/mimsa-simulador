"use client";

import { Station, ProductionLine, peopleForTarget, stationRatePerHour } from "@/lib/simulation";

interface Props {
  line: ProductionLine;
  stations: Station[];
  /** Meta de producción del turno. Mueve la sugerencia de plantilla. */
  target: number;
  /** Aplica la plantilla sugerida: escribe las personas de cada estación. */
  onApply?: (assignments: { id: string; people: number }[]) => void;
  /** Restablece las personas a la plantilla base de la línea. */
  onResetBase?: () => void;
}

// Recomendador de plantilla: para el OBJETIVO fijado, sugiere las personas por
// estación que mantienen la línea eficiente durante el turno (la plantilla justa
// para procesar la demanda sin faltantes ni exceso) y la compara con lo que está
// seteado en las estaciones. La barra muestra qué parte del turno opera la
// estación (tiempo muerto del operador) a ese objetivo.
export function StaffingPanel({ line, stations, target, onApply, onResetBase }: Props) {
  const TURN = Math.max(11, ...stations.map((s) => s.hours));

  const rows = stations.map((s) => {
    const need = peopleForTarget(s, target); // plantilla sugerida p/ objetivo
    const share = s.flowShare && s.flowShare > 0 ? s.flowShare : 1;
    const rate = stationRatePerHour(s);
    const workingH = rate > 0 ? (target * share) / rate : 0;
    const util = TURN > 0 ? Math.min(1, workingH / TURN) : 0;
    const excess = Math.max(0, s.people - need); // operadores de más
    const missing = Math.max(0, need - s.people); // operadores que faltan
    return { id: s.id, name: s.name, people: s.people, need, util, excess, missing };
  });

  const totalActual = rows.reduce((a, r) => a + r.people, 0);
  const totalNeed = rows.reduce((a, r) => a + r.need, 0);
  const diff = totalActual - totalNeed; // + sobran, - faltan

  return (
    <div className="hud-card p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-mimsa-black">
          Plantilla sugerida para el objetivo — vs. lo asignado
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-mimsa-gray">turno de {TURN} h</span>
          {onResetBase && (
            <button
              type="button"
              onClick={onResetBase}
              className="hud-btn rounded-md px-2.5 py-1.5 text-[11px] font-medium"
            >
              ↺ Restablecer base
            </button>
          )}
          {onApply && (
            <button
              type="button"
              onClick={() =>
                onApply(rows.map((r) => ({ id: r.id, people: r.need })))
              }
              disabled={diff === 0}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold shadow-glow-sm transition-opacity ${
                diff === 0
                  ? "cursor-default bg-mimsa-bgAlt text-mimsa-gray"
                  : "bg-mimsa-green text-mimsa-black hover:opacity-90"
              }`}
            >
              {diff === 0 ? "✓ Plantilla óptima" : "⇩ Aplicar sugerencia"}
            </button>
          )}
        </div>
      </div>
      <p className="mb-3 text-[11px] text-mimsa-gray">
        Para el objetivo de <b className="text-mimsa-greenDark">{target.toLocaleString("es-MX")} {line.unit}/turno</b>,
        “sugeridas” es la plantilla por estación que cubre su demanda dentro del turno
        manteniendo la eficiencia (sin faltantes ni exceso). Se compara con lo seteado
        en cada estación; la barra indica qué parte del turno opera la estación.
      </p>

      <div className="space-y-2">
        {rows.map((r) => {
          const pct = Math.round(r.util * 100);
          const full = pct >= 95;
          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-md px-1.5 py-1 ${
                r.excess > 0 ? "bg-alert-redLight" : ""
              }`}
              style={r.missing > 0 ? { background: "rgba(239,159,39,0.12)" } : undefined}
            >
              <div className="w-28 shrink-0 truncate text-xs font-medium text-mimsa-black">
                {r.name}
              </div>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-mimsa-bgAlt">
                <div
                  className="h-full rounded"
                  style={{ width: `${pct}%`, background: full ? "#94C11C" : "#EF9F27" }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-mimsa-black">
                  {pct}% del turno
                </span>
              </div>
              <div className="w-12 shrink-0 text-center text-xs">
                <div className="font-semibold text-mimsa-black">{r.people}</div>
                <div className="text-[9px] text-mimsa-gray">asignadas</div>
              </div>
              <div className="w-12 shrink-0 text-center text-xs">
                <div className="font-semibold text-mimsa-greenDark">{r.need}</div>
                <div className="text-[9px] text-mimsa-gray">sugeridas</div>
              </div>
              <div className="w-28 shrink-0 text-right text-[10px]">
                {r.missing > 0 ? (
                  <span className="font-semibold" style={{ color: "#C77F12" }}>
                    + agrega {r.missing} op.
                  </span>
                ) : r.excess > 0 ? (
                  <span className="font-semibold text-alert-red">− quita {r.excess} op.</span>
                ) : (
                  <span className="text-mimsa-greenDark">óptimo ✓</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-mimsa-green/15 pt-3 text-xs">
        <span className="text-mimsa-black">
          Asignada: <b>{totalActual}</b> op.
        </span>
        <span className="text-mimsa-black">
          Sugerida p/ objetivo: <b className="text-mimsa-greenDark">{totalNeed}</b> op.
        </span>
        {diff === 0 ? (
          <span className="font-semibold text-mimsa-greenDark">
            Plantilla óptima para el objetivo ✓
          </span>
        ) : diff > 0 ? (
          <span className="font-semibold text-alert-red">
            Sobran {diff} operador{diff > 1 ? "es" : ""} — reasignables a otra línea
          </span>
        ) : (
          <span className="font-semibold" style={{ color: "#C77F12" }}>
            Faltan {-diff} operador{-diff > 1 ? "es" : ""} para sostener el objetivo
          </span>
        )}
      </div>
    </div>
  );
}
