import { Simulator } from "@/components/Simulator";
import { FlagsBar } from "@/components/FlagsBar";
import { WeatherWidget } from "@/components/WeatherWidget";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1480px] items-start justify-center gap-5 px-4 py-6">
        {/* Margen izquierdo: banderas de mercados */}
        <aside className="sticky top-6 hidden shrink-0 xl:block">
          <FlagsBar />
        </aside>

        {/* Centro: simulador */}
        <div className="w-full max-w-5xl min-w-0">
          <Simulator />
        </div>

        {/* Margen derecho: clima de Monterrey */}
        <aside className="sticky top-6 hidden shrink-0 xl:block">
          <WeatherWidget />
        </aside>
      </div>
    </main>
  );
}
