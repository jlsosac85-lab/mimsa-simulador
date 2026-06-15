# Simulador de Producción · MIMSA Marcos Metálicos

Simulador interactivo de la línea de Marcos Metálicos de MIMSA. Permite ajustar
**personas, ritmo, horas y materia prima por estación** para encontrar cuellos
de botella y simular distintos escenarios de producción en tiempo real.

Construido con **Next.js 14** + **React** + **Tailwind CSS**. Listo para
desplegar en **Vercel** con un clic.

---

## ¿Qué hace?

- **Plano animado** de la línea: las piezas (cabezal, larguero-bisagra,
  larguero-embutido) fluyen por las 7 estaciones reales y se acumulan colas
  frente al cuello de botella.
- **Estaciones 100% editables**: cambia personas, ritmo (marcos por hora por
  persona) y horas. La capacidad se recalcula al instante.
- **Parámetros globales**: objetivo de marcos por turno, materia prima
  disponible y días hábiles para la proyección mensual.
- **Escenarios rápidos** con un clic, basados en las palancas del análisis:
  sprocket + cadena, pintura en turno noche, embutir solo 1 larguero, o todas
  juntas.
- **Detección automática del cuello de botella** y recomendaciones según la
  estación que limita.
- **Exportar escenario** a JSON para guardar o compartir una configuración.

---

## Modelo de cálculo

Cada estación calcula su capacidad así:

```
capacidad (marcos/turno) = personas × (marcos por hora por persona) × horas
```

La capacidad del **sistema** es la de la estación más lenta (el cuello de
botella). Los valores semilla salen del análisis de tiempos real de MIMSA:

| Estación          | Personas | Marcos/h·pers | Horas | Capacidad |
| ----------------- | -------- | ------------- | ----- | --------- |
| Roladora          | 1        | 90            | 9.5   | 855       |
| Troquel Cabezal   | 2        | 60            | 8     | 960       |
| Troquel Bisagra   | 1        | 240           | 4     | 960       |
| Troquel Embutido  | 1        | 120           | 8     | 960       |
| Remachadora       | 1        | 180           | 5     | 900       |
| **Pintura**       | **3**    | **40**        | **7** | **840** ← cuello |
| Embolsado         | 2        | 50            | 9     | 900       |

Con la configuración base, el cuello es **Pintura (840 marcos/turno)**, igual
que en el análisis original.

---

## Cómo correrlo en tu computadora (opcional)

Necesitas [Node.js 18 o superior](https://nodejs.org/).

```bash
npm install
npm run dev
```

Abre http://localhost:3000 en tu navegador.

---

## Desplegar en Vercel (paso a paso)

### 1. Subir el proyecto a GitHub

1. Crea una cuenta en [github.com](https://github.com) si no tienes una.
2. Crea un repositorio nuevo (botón **New** → nómbralo, por ejemplo,
   `mimsa-simulador` → **Create repository**).
3. Sube los archivos. La forma más simple desde la web:
   - En la página del repo vacío, haz clic en **uploading an existing file**.
   - Arrastra **todo el contenido de esta carpeta** (excepto `node_modules`,
     que no debe subirse).
   - Escribe un mensaje y haz clic en **Commit changes**.

   O desde la terminal, dentro de la carpeta del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Simulador MIMSA inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/mimsa-simulador.git
   git push -u origin main
   ```

### 2. Conectar con Vercel

1. Entra a [vercel.com](https://vercel.com) y regístrate con tu cuenta de
   GitHub (botón **Continue with GitHub**).
2. En el panel, haz clic en **Add New…** → **Project**.
3. Busca tu repositorio `mimsa-simulador` y haz clic en **Import**.
4. Vercel detecta automáticamente que es Next.js. **No cambies nada.**
5. Haz clic en **Deploy**.
6. Espera ~1 minuto. Vercel te dará una URL pública, por ejemplo:
   `https://mimsa-simulador.vercel.app`

¡Listo! Comparte esa URL con tu equipo. Cada vez que actualices el código en
GitHub, Vercel vuelve a desplegar automáticamente.

---

## Personalizar

- **Cambiar los valores base de las estaciones**: edita
  `lib/simulation.ts` → función `defaultStations()`.
- **Agregar o quitar estaciones**: agrega objetos al arreglo de
  `defaultStations()` y, si cambias el flujo, ajusta `ROUTES` en el mismo
  archivo.
- **Colores de marca**: están en `tailwind.config.ts` bajo `colors.mimsa`.

---

## Estructura del proyecto

```
mimsa-simulador/
├── app/
│   ├── layout.tsx        Estructura raíz y fuentes
│   ├── page.tsx          Página principal
│   └── globals.css       Estilos base
├── components/
│   ├── Simulator.tsx     Componente principal (estado y controles)
│   ├── PlantLayout.tsx   Plano animado de la planta
│   ├── StationCard.tsx   Tarjeta editable por estación
│   ├── ResultsPanel.tsx  Métricas y recomendaciones
│   └── MimsaLogo.tsx     Logo en SVG
├── lib/
│   └── simulation.ts     Motor de cálculo (capacidades, cuellos)
├── package.json
└── ...config de Next.js, Tailwind, TypeScript
```

---

MIMSA · Manufactura Integral de Marcos y Soluciones de Acero
