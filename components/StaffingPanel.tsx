"use client";

import { Station, requiredPeople } from "@/lib/simulation";

interface Props {
  stations: Station[];
}

// Comparativo de plantilla: personas asignadas (inputs) vs. personas que el
// ritmo de cada estacion realmente requiere. Detecta sobre-dotacion (exceso)
// y, por separado, el tiempo muerto de los operadores necesarios.
export function StaffingPanel({ stations }: Props) {
  const TURN = Math.max(11, ...stations.map((s) => s.hours));

  const rows = stations.map((s) => {
    const need = requiredPeople(s); // operadores que pide el ritmo
    const util = Math.min(1, s.hours / TURN); // parte del turno que opera
    const excess = Math.max(0, s.people - need);
    const missing = Math.max(0, need - s.people);
    const idleH = Math.max(0, TURN - s.hours);
    return { id: s.id, name: s.name, people: s.people, need, util, excess, missing, idleH };
  });

  const totalActual = rows.reduce((a, r) => a + r.people, 0);
  const totalNeed = rows.reduce((a, r) => a + r.need, 0);
  const totalExcess = rows.reduce((a, r) => a + r.excess, 0);

  return (
    <div className="rounded-lg border border-mimsa-line bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-mimsa-black">
          Plantilla en turno — actual vs. necesaria
        </h3>
        <span className="text-[11px] text-mimsa-gray">turno de {TURN} h</span>
      </div>
      <p className="mb-3 text-[11px] text-mimsa-gray">
        “Necesarias” son los operadores que el ritmo de la estación justifica. Si
        asignas más, el resto aparece marcado como exceso. La barra indica qué
        parte del turno opera la estación (tiempo muerto de los operadores).
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
                <div className={`font-semibold ${r.excess > 0 ? "text-alert-red" : "text-mimsa-black"}`}>
                  {r.people}
                </div>
                <div className="text-[9px] text-mimsa-gray">actual</div>
              </div>
              <div className="w-12 shrink-0 text-center text-xs">
                <div className="font-semibold text-mimsa-greenDark">{r.need}</div>
                <div className="text-[9px] text-mimsa-gray">necesarias</div>
              </div>
              <div className="w-28 shrink-0 text-right text-[10px]">
                {r.excess > 0 ? (
                  <span className="font-semibold text-alert-red">
                    exceso {r.excess} op.
                  </span>
                ) : r.missing > 0 ? (
                  <span style={{ color: "#B97400" }}>faltan {r.missing} op.</span>
                ) : r.idleH > 0.1 ? (
                  <span className="text-mimsa-gray">{r.idleH.toFixed(1)} h muertas/op</span>
                ) : (
                  <span className="text-mimsa-greenDark">a tope</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-mimsa-line pt-3 text-xs">
        <span className="text-mimsa-black">
          Plantilla actual: <b>{totalActual}</b> operadores
        </span>
        <span className="text-mimsa-black">
          Necesaria por ritmo: <b className="text-mimsa-greenDark">{totalNeed}</b>
        </span>
        {totalExcess > 0 ? (
          <span className="font-semibold text-alert-red">
            Exceso de {totalExcess} operador{totalExcess > 1 ? "es" : ""} en la línea
          </span>
        ) : (
          <span className="text-mimsa-greenDark">Dotación balanceada · sin exceso</span>
        )}
      </div>
    </div>
  );
}
