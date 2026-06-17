import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Simulador de Producción · MIMSA Marcos Metálicos",
  description:
    "Simulador interactivo de la línea de Marcos Metálicos de MIMSA. Ajusta personas, horas, ritmo y materia prima por estación para encontrar cuellos de botella.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable} ${chakra.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
