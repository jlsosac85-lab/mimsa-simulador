"use client";

import { Station } from "@/lib/simulation";

interface Props {
  stations: Station[];
}

// Comparativo de plantilla: personas asignadas (inputs) vs. personas
// recomendadas a tiempo completo, segun cuanto opera cada estacion en el
// turno. Sirve para detectar operadores con tiempo muerto (holgura).
export function StaffingPanel({ stations }: Props) {
  const TURN = Math.max(11, ...stations.map((s) => s.hours));

  const rows = stations.map((s) => {
    const util = Math.min(1, s.hours / TURN);
    const equiv = s.people * util; // operadores-turno equivalentes
    const recommended = s.people > 0 ? Math.max(1, Math.round(equiv)) : 0;
    const slack = s.people - recommended; // operadores liberables
    const idleH = Math.max(0, TURN - s.hours); // horas muertas por operador
    return {
      id: s.id,
      name: s.name,
      people: s.people,
      util,
      recommended,
      slack,
      idleH,
    };
  });

  const totalActual = rows.reduce((a, r) => a + r.people, 0);
  const totalRecom = rows.reduce((a, r) => a + r.recommended, 0);
  const personHours = stations.reduce((a, s) => a + s.people * s.hours, 0);
  const minSystem = Math.ceil(personHours / TURN);
  const liberables = Math.max(0, totalActual - minSystem);

  return (
    <div className="rounded-lg border border-mimsa-line bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-mimsa-black">
          Plantilla en turno — actual vs. recomendada
        </h3>
        <span className="text-[11px] text-mimsa-gray">turno de {TURN} h</span>
      </div>
      <p className="mb-3 text-[11px] text-mimsa-gray">
        La barra indica qué parte del turno realmente opera cada estación. Donde
        no llega al 100%, sus operadores tienen tiempo muerto que puede apoyar
        otras estaciones.
      </p>

      <div className="space-y-2">
        {rows.map((r) => {
          const pct = Math.round(r.util * 100);
          const full = pct >= 95;
          return (
            <div key={r.id} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs font-medium text-mimsa-black">
                {r.name}
              </div>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-mimsa-bgAlt">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${pct}%`,
                    background: full ? "#94C11C" : "#EF9F27",
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-mimsa-black">
                  {pct}% del turno
                </span>
              </div>
              <div className="w-12 shrink-0 text-center text-xs">
                <div className="font-semibold text-mimsa-black">{r.people}</div>
                <div className="text-[9px] text-mimsa-gray">actual</div>
              </div>
              <div className="w-12 shrink-0 text-center text-xs">
                <div className="font-semibold text-mimsa-greenDark">
                  {r.recommended}
                </div>
                <div className="text-[9px] text-mimsa-gray">recom.</div>
              </div>
              <div className="w-24 shrink-0 text-right text-[10px]">
                {r.slack > 0 ? (
                  <span style={{ color: "#B97400" }}>
                    libera {r.slack} op.
                  </span>
                ) : r.idleH > 0.1 ? (
                  <span className="text-mimsa-gray">
                    {r.idleH.toFixed(1)} h muertas/op
                  </span>
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
          Recomendada por estación:{" "}
          <b className="text-mimsa-greenDark">{totalRecom}</b>
        </span>
        <span className="text-mimsa-gray">
          Carga total {personHours.toFixed(1)} persona-h → mínimo teórico{" "}
          <b>{minSystem}</b> reasignando holguras
          {liberables > 0 ? ` (${liberables} liberable${liberables > 1 ? "s" : ""})` : ""}
        </span>
      </div>
    </div>
  );
}
