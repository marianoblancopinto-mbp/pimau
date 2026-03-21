# PIMAU
### Plataforma de Inteligencia para el Mercado de Autos Usados

PIMAU es una plataforma de análisis avanzado y modelado econométrico diseñada para transformar datos dispersos del mercado automotor en información accionable para la toma de decisiones de inversión.

o.

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

## Ejecución Local

1.  **Instalar dependencias:**
    ```bash
    npm install
    ```
2.  **Correr servidor de desarrollo:**
    ```bash
    npm run dev
    ```
    *La plataforma estará disponible en el puerto 7000 por defecto.*

---
Desarrollado como una herramienta de alta precisión para el análisis de activos y desarrollo de aplicaciones de inteligencia de mercado.
