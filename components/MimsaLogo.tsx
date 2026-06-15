export function MimsaLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      role="img"
      aria-label="MIMSA"
      style={{ background: "white", borderRadius: 6, padding: 4 }}
    >
      <polygon points="8,12 8,68 26,68 26,42 40,56 40,30 26,16" fill="#1C1C1A" />
      <polygon
        points="40,30 40,56 54,42 54,68 72,68 72,12 54,16"
        fill="#94C11C"
      />
      <polygon points="40,30 54,16 40,30 26,16" fill="#94C11C" />
      <text
        x="40"
        y="78"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="#1C1C1A"
        fontFamily="Arial, sans-serif"
      >
        MIMSA
      </text>
    </svg>
  );
}
