"use client";

import { Station, stationCapacity } from "@/lib/simulation";

interface Props {
  station: Station;
  isBottleneck: boolean;
  unit: string;
  onChange: (id: string, patch: Partial<Station>) => void;
}

function NumberField({
  label,
  value,
  step = 1,
  min = 0,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-mimsa-gray">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? Math.max(min, v) : min);
          }}
          className="w-full rounded-md border border-mimsa-line bg-white px-2 py-1 text-sm font-medium text-mimsa-black outline-none focus:border-mimsa-green focus:ring-1 focus:ring-mimsa-green"
        />
        {suffix && (
          <span className="text-[10px] text-mimsa-grayLight">{suffix}</span>
        )}
      </div>
    </label>
  );
}

export function StationCard({ station, isBottleneck, unit, onChange }: Props) {
  const cap = Math.round(stationCapacity(station));

  return (
    <div
      className={`rounded-lg border bg-white p-3 transition-colors ${
        isBottleneck
          ? "border-alert-red ring-1 ring-alert-red/30"
          : "border-mimsa-line"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          type="text"
          value={station.name}
          onChange={(e) => onChange(station.id, { name: e.target.value })}
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-mimsa-black outline-none focus:underline"
        />
        {isBottleneck && (
          <span className="shrink-0 rounded-full bg-alert-red px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Cuello
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Personas"
          value={station.people}
          min={0}
          onChange={(v) => onChange(station.id, { people: v })}
        />
        <NumberField
          label={`${unit}/hora`}
          value={station.ratePerHour}
          min={0}
          step={10}
          onChange={(v) => onChange(station.id, { ratePerHour: v })}
        />
        <NumberField
          label="Horas"
          value={station.hours}
          min={0}
          step={0.5}
          onChange={(v) => onChange(station.id, { hours: v })}
        />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-mimsa-line pt-2">
        <span className="text-[10px] uppercase tracking-wide text-mimsa-gray">
          Capacidad
        </span>
        <span
          className={`font-mono text-sm font-semibold ${
            isBottleneck ? "text-alert-red" : "text-mimsa-greenDark"
          }`}
        >
          {cap.toLocaleString("es-MX")}{" "}
          <span className="text-[10px] font-normal text-mimsa-grayLight">
            {unit}/turno
          </span>
        </span>
      </div>
    </div>
  );
}
