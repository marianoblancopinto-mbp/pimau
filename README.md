# PIMAU
### Plataforma de Inteligencia para el Mercado de Autos Usados

PIMAU es una plataforma de análisis avanzado y modelado econométrico diseñada para transformar datos dispersos del mercado automotor en información accionable para la toma de decisiones de inversión.



---

## El Motor: Análisis de Depreciación Dual

A diferencia de las calculadoras tradicionales basadas en promedios, PIMAU implementa un **Motor de Depreciación Dual** que segrega los dos factores determinantes del valor de un activo:

1.  **Depreciación Temporal (Antigüedad):** La pérdida de valor intrínseca por el paso del tiempo.
2.  **Desgaste Operativo (Kilometraje):** La pérdida de valor variable por el uso acumulado.

### Modelado Matemático y Precisión
El sistema no se limita a un único modelo, sino que evalúa y combina diferentes aproximaciones para cada vehículo:
-   **Modelo Lineal:** Efectivo para vehículos con demanda inelástica.
-   **Modelo de Decaimiento Exponencial:** Captura la rápida pérdida de valor inicial y la estabilización asintótica.
-   **Optimización por Ensamble (Weighted Ensemble):** Un algoritmo que pondera ambos modelos minimizando el Error Cuadrático Medio (RMSE) para lograr el mejor ajuste histórico.

**Resultados:** El sistema ha validado una **Precisión Global del 89.44%**, alcanzando picos del 94% en modelos con alta representatividad estadística.

---

## Takeaways Técnicos y Procesamiento de Datos

La robustez de PIMAU se basa en un pipeline de procesamiento de datos masivos (*High-Throughput Data Processing*):

-   **Adquisición Automatizada:** Recolección multinodo de cientos de puntos de datos de múltiples marketplaces.
-   **Filtrado de Señal (Sigma Clipping):** Aplicación de filtros estadísticos (Z-Score > 1.5) para segregar *outliers* y ruidos de mercado (precios artificialmente bajos o fuera de rango), asegurando que los datos representen fielmente la realidad transaccional.
-   **Categorización Inteligente:** Agrupación por versiones y variantes para eliminar sesgos por equipamiento.

---

## Stack Tecnológico

-   **Frontend:** Next.js 15, TypeScript, Tailwind CSS.
-   **Visualización:** Dashboard industrial con **Recharts** (Scatterplots, Area Charts, Histogramas de distribución 0km).
-   **Motor Econométrico:** Lógica independiente en TypeScript utilizando **regression-js** para el cálculo de coeficientes de tendencia.
-   **Automatización:** Motores de scraping personalizados y pipelines de normalización de datos.

---

## Arquitectura y Workflow (Definitiva)

El proyecto está diseñado bajo un modelo de arquitectura asimétrica: la ingesta pesada de datos es un proceso administrativo privado, mientras que la visualización es pública y estática. Todo el ecosistema de código pesado está consolidado en el directorio `lib/`.

1. **`lib/parser/` y `lib/core/`**: El núcleo del sistema. Contiene los motores matemáticos (`modeler.ts`), las reglas emergentes para división de versiones (`emergent_rules.ts`) y los extractores regex de texto (`parseMeli.ts` y `parseKavak.ts`).
2. **Ingesta Privada (Administrador)**: El administrador utiliza `npm run importer` en su máquina local. Esto levanta un servidor privado que recibe volcados de texto crudo (Ctrl+A), extrae la información con las herramientas de `lib/`, procesa deduplicaciones y guarda la data **permanentemente** en `data/market_data.json`.
3. **Pipeline Analítico Central**: Con el comando `npm run pipeline`, el motor re-lee toda la base de datos histórica, ejecuta las regresiones de Ensamble de toda la flota a la vez, y califica cada modelo comparando su depreciación contra una línea base fuerte (Toyota SW4), guardando los resultados finales en `data/intelligence_report.json`.
4. **Frontend Público (GitHub Pages)**: La aplicación de visualización (`Next.js`) se compila de manera estática y se publica para los usuarios. Dado que no existe base de datos en producción:
   - **Simulador In-Situ**: Los usuarios finales pueden utilizar el botón de **Cargar Más Modelos** para probar data en tiempo real. La página procesará el texto ingresado directamente *en el navegador del usuario*, reentrenará la inteligencia localmente para mostrarles el análisis en vivo, y todos esos datos se evaporarán de manera segura al refrescar la página.

---

## Ejecución Local

1.  **Clonar el repo:**
    ```bash
    git clone https://github.com/marianoblancopinto-mbp/pimau.git
    ```
2.  **Instalar dependencias:**
    ```bash
    npm install
    ```
3.  **Correr servidor de desarrollo:**
    ```bash
    npm run dev
    ```
    *La plataforma estará disponible en el puerto 7000 por defecto.*

---
Desarrollado como una herramienta de alta precisión para el análisis de activos y desarrollo de aplicaciones de inteligencia de mercado.
