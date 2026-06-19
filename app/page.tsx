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
          <div className="hud-card mb-4 p-2.5">
            <div className="hud-head mb-2.5">
              <span className="hud-label text-[10px] font-bold text-white">
                Línea de producción a simular
              </span>
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
                        ? "border-mimsa-green bg-mimsa-black shadow-glow-sm"
                        : "border-mimsa-green/20 bg-mimsa-carbon hover:border-mimsa-green/60"
                    }`}
                  >
                    <div
                      className={`font-display text-sm font-bold leading-tight tracking-wide ${
                        active ? "text-mimsa-green" : "text-white/85"
                      }`}
                    >
                      {l.shortName}
                    </div>
                    <div
                      className={`mt-0.5 text-[10px] leading-snug ${
                        active ? "text-mimsa-green/70" : "text-white/45"
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
