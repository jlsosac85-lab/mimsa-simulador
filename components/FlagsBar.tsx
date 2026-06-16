"use client";

// Banderas dibujadas como SVG inline (sin dependencias externas).
// Representan los mercados de MIMSA: Mexico, Estados Unidos y Guatemala.
// Se muestra como columna lateral en el margen izquierdo.

function FlagMexico() {
  return (
    <svg viewBox="0 0 30 20" width="34" height="23" aria-label="México">
      <rect width="10" height="20" x="0" fill="#006847" />
      <rect width="10" height="20" x="10" fill="#ffffff" />
      <rect width="10" height="20" x="20" fill="#CE1126" />
      <circle cx="15" cy="10" r="2.4" fill="none" stroke="#8C6239" strokeWidth="0.8" />
    </svg>
  );
}

function FlagUSA() {
  return (
    <svg viewBox="0 0 30 20" width="34" height="23" aria-label="Estados Unidos">
      {Array.from({ length: 13 }).map((_, i) => (
        <rect
          key={i}
          x="0"
          y={(20 / 13) * i}
          width="30"
          height={20 / 13}
          fill={i % 2 === 0 ? "#B22234" : "#ffffff"}
        />
      ))}
      <rect x="0" y="0" width="12" height={(20 / 13) * 7} fill="#3C3B6E" />
    </svg>
  );
}

function FlagGuatemala() {
  return (
    <svg viewBox="0 0 30 20" width="34" height="23" aria-label="Guatemala">
      <rect width="10" height="20" x="0" fill="#4997D0" />
      <rect width="10" height="20" x="10" fill="#ffffff" />
      <rect width="10" height="20" x="20" fill="#4997D0" />
      <circle cx="15" cy="10" r="2.2" fill="none" stroke="#5C8A3A" strokeWidth="0.7" />
    </svg>
  );
}

const FLAGS = [
  { code: "MX", name: "México", Comp: FlagMexico },
  { code: "US", name: "EE.UU.", Comp: FlagUSA },
  { code: "GT", name: "Guatemala", Comp: FlagGuatemala },
];

export function FlagsBar() {
  return (
    <div className="w-[120px] rounded-xl border border-mimsa-green/30 bg-mimsa-black p-3 shadow-sm">
      <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wide text-mimsa-green">
        Mercados
      </div>
      <div className="flex flex-col gap-3">
        {FLAGS.map(({ code, name, Comp }) => (
          <div key={code} className="flex flex-col items-center gap-1">
            <span className="overflow-hidden rounded-[3px] shadow-sm ring-1 ring-white/15">
              <Comp />
            </span>
            <span className="font-mono text-[10px] font-medium text-mimsa-grayLight">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
