"use client";

import { useState } from "react";
import { Simulator } from "@/components/Simulator";
import { FlagsBar } from "@/components/FlagsBar";
import { WeatherWidget } from "@/components/WeatherWidget";
import { LINES, getLine } from "@/lib/simulation";

export default function Home() {
  const [lineId, setLineId] = useState<string>("marcos");
  const line = getLine(lineId);

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1480px] items-start justify-center gap-5 px-4 py-6">
        {/* Margen izquierdo: banderas de mercados */}
        <aside className="sticky top-6 hidden shrink-0 xl:block">
          <FlagsBar />
        </aside>

        {/* Centro: selector de linea + simulador */}
        <div className="w-full max-w-5xl min-w-0">
          {/* Selector de linea de produccion */}
          <div className="mb-4 rounded-lg border border-mimsa-line bg-white p-2.5">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-mimsa-gray">
              Línea de producción a simular
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LINES.map((l) => {
                const active = l.id === lineId;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLineId(l.id)}
                    className={`rounded-md border px-3 py-2 text-left transition ${
                      active
                        ? "border-mimsa-green bg-mimsa-black"
                        : "border-mimsa-line bg-mimsa-bgAlt hover:border-mimsa-green/60"
                    }`}
                  >
                    <div
                      className={`text-sm font-bold leading-tight ${
                        active ? "text-mimsa-green" : "text-mimsa-black"
                      }`}
                    >
                      {l.shortName}
                    </div>
                    <div
                      className={`mt-0.5 text-[10px] leading-snug ${
                        active ? "text-white/70" : "text-mimsa-gray"
                      }`}
                    >
                      {l.tagline}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* key fuerza el reinicio del simulador al cambiar de linea */}
          <Simulator key={line.id} line={line} />
        </div>

        {/* Margen derecho: clima de Monterrey */}
        <aside className="sticky top-6 hidden shrink-0 xl:block">
          <WeatherWidget />
        </aside>
      </div>
    </main>
  );
}
