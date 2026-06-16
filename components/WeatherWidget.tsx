"use client";

import { useEffect, useState } from "react";

// Clima actual + pronostico de 7 dias para Monterrey (Open-Meteo, sin API key).
// Se muestra como columna lateral en el margen derecho.
const MTY_LAT = 25.6866;
const MTY_LON = -100.3161;

interface DayForecast {
  date: string;
  max: number;
  min: number;
  code: number;
}

interface CurrentWeather {
  temp: number;
  code: number;
}

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

function weatherText(code: number): string {
  if (code === 0) return "Despejado";
  if (code <= 3) return "Parc. nublado";
  if (code <= 48) return "Niebla";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Nieve";
  if (code <= 82) return "Chubascos";
  if (code <= 86) return "Aguanieve";
  return "Tormenta";
}

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WeatherWidget() {
  const [days, setDays] = useState<DayForecast[] | null>(null);
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${MTY_LAT}` +
      `&longitude=${MTY_LON}` +
      `&current=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=America/Monterrey&forecast_days=7`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const d = data?.daily;
        const c = data?.current;
        if (!d?.time) {
          setError(true);
          return;
        }
        setDays(
          d.time.map((t: string, i: number) => ({
            date: t,
            max: Math.round(d.temperature_2m_max[i]),
            min: Math.round(d.temperature_2m_min[i]),
            code: d.weather_code[i],
          }))
        );
        if (c) {
          setCurrent({
            temp: Math.round(c.temperature_2m),
            code: c.weather_code,
          });
        }
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div className="w-[170px] rounded-xl border border-mimsa-green/30 bg-mimsa-black p-3 shadow-sm">
      <div className="mb-2 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-mimsa-green">
          Monterrey
        </div>
        <div className="text-[9px] text-mimsa-grayLight">Clima · 7 días</div>
      </div>

      {error ? (
        <div className="py-2 text-center text-[11px] text-mimsa-grayLight">
          Clima no disponible
        </div>
      ) : !days ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-white/10" />
          ))}
        </div>
      ) : (
        <>
          {/* Bloque "ahora" destacado */}
          {current && (
            <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-mimsa-green/10 px-2 py-2 ring-1 ring-mimsa-green/30">
              <span className="text-3xl leading-none">
                {weatherIcon(current.code)}
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-bold leading-none text-white">
                  {current.temp}°
                </span>
                <span className="text-[9px] leading-tight text-mimsa-green">
                  ahora
                </span>
                <span className="text-[9px] leading-tight text-mimsa-grayLight">
                  {weatherText(current.code)}
                </span>
              </div>
            </div>
          )}

          {/* Pronostico de 7 dias (filas) */}
          <div className="flex flex-col gap-1">
            {days.map((d, idx) => {
              const day = new Date(d.date + "T00:00:00");
              const dow = idx === 0 ? "Hoy" : DOW[day.getDay()];
              return (
                <div
                  key={d.date}
                  className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1"
                >
                  <span className="w-8 text-[10px] font-medium text-mimsa-grayLight">
                    {dow}
                  </span>
                  <span className="text-sm leading-none">
                    {weatherIcon(d.code)}
                  </span>
                  <span className="font-mono text-[11px]">
                    <span className="font-semibold text-white">{d.max}°</span>
                    <span className="text-mimsa-grayLight"> {d.min}°</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
