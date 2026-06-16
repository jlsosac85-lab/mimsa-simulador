"use client";

import { useEffect, useState } from "react";

// Pronostico de 7 dias para Monterrey usando Open-Meteo (gratis, sin API key).
const MTY_LAT = 25.6866;
const MTY_LON = -100.3161;

interface DayForecast {
  date: string;
  max: number;
  min: number;
  code: number;
}

// Mapea los codigos WMO a un icono simple.
function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WeatherWidget() {
  const [days, setDays] = useState<DayForecast[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${MTY_LAT}` +
      `&longitude=${MTY_LON}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=America/Monterrey&forecast_days=7`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const d = data?.daily;
        if (!d?.time) {
          setError(true);
          return;
        }
        const parsed: DayForecast[] = d.time.map((t: string, i: number) => ({
          date: t,
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
          code: d.weather_code[i],
        }));
        setDays(parsed);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div className="flex flex-col justify-center">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-mimsa-green">
          Monterrey
        </span>
        <span className="text-[10px] text-mimsa-grayLight">· 7 días</span>
      </div>

      {error ? (
        <div className="text-[11px] text-mimsa-grayLight">
          Clima no disponible
        </div>
      ) : !days ? (
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-7 animate-pulse rounded bg-white/10"
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5">
          {days.map((d) => {
            const day = new Date(d.date + "T00:00:00");
            const dow = DOW[day.getDay()];
            return (
              <div
                key={d.date}
                className="flex w-9 flex-col items-center gap-0.5 rounded-md bg-white/5 px-1 py-1"
                title={`${dow}: ${d.min}° / ${d.max}°`}
              >
                <span className="text-[9px] font-medium text-mimsa-grayLight">
                  {dow}
                </span>
                <span className="text-sm leading-none">
                  {weatherIcon(d.code)}
                </span>
                <span className="font-mono text-[10px] font-semibold text-white">
                  {d.max}°
                </span>
                <span className="font-mono text-[9px] text-mimsa-grayLight">
                  {d.min}°
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
