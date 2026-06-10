export interface CarData {
    brand_model: string;
    year: number;
    km: number;
    price_usd: number;
    version?: string;
    url?: string;
    title?: string;
}

export type ModelType = 'LINEAR' | 'EXPONENTIAL' | 'ENSEMBLE';

export interface ModelResult {
    coefficients: {
        intercept: number;
        year: number;
        km: number;
    };
    depreciation: {
        per_year_usd: number;
        per_10k_km_usd: number;
    };
    predict: (year: number, km: number) => number;
    r2: number;
    modelType: ModelType;
    weights?: {
        linear: number;
        exponential: number;
    };
}

export class PriceModeler {

    trainModel(data: CarData[]): ModelResult {
        const currentYear = new Date().getFullYear();

        // 1. Initial Basic Filter
        const basicData = data.filter(d => d.year > 1990 && d.price_usd > 2000 && d.km >= 0); // Include 0km

        if (basicData.length < 2) {
            console.log(`[Modeler FAIL] Not enough data for ${data[0]?.brand_model} (Found ${basicData.length}, needed 2)`);
            return this.getEmptyModel();
        }

        // 2. Outlier Removal 🧹
        const validData = this.filterOutliers(basicData);

        if (validData.length < 2) {
            console.log(`[Modeler WARN] Outlier removal left too few items for ${data[0]?.brand_model}. Using basic data.`);
            // Fallback to basic data if aggressive filtering kills everything
            // This happens if sample size is tiny but noisy
            return this.trainLinearCore(basicData);
        }

        return this.trainLinearCore(validData);
    }

    // Extracted core logic to reuse for fallback
    private trainLinearCore(validData: CarData[]): ModelResult {
        const currentYear = new Date().getFullYear();

        // 3. Prepare Vectors (X1=Age, X2=Km, Y=Price)
        const N = validData.length;
        const X1 = validData.map(d => currentYear - d.year);

        const X2 = validData.map(d => d.km);
        const Y = validData.map(d => d.price_usd);

        // 3. Means
        const meanX1 = X1.reduce((a, b) => a + b, 0) / N;
        const meanX2 = X2.reduce((a, b) => a + b, 0) / N;
        const meanY = Y.reduce((a, b) => a + b, 0) / N;

        // 4. Sums of Squares/Products (Deviations)
        let S11 = 0, S22 = 0, S12 = 0, S1Y = 0, S2Y = 0;
        let SST = 0; // Total Sum of Squares for R2

        for (let i = 0; i < N; i++) {
            const x1 = X1[i] - meanX1;
            const x2 = X2[i] - meanX2;
            const y = Y[i] - meanY;

            S11 += x1 * x1;
            S22 += x2 * x2;
            S12 += x1 * x2;
            S1Y += x1 * y;
            S2Y += x2 * y;
            SST += y * y;
        }

        // 5. Solve OLS (Cramer's Rule for 2 vars)
        const Denom = S11 * S22 - S12 * S12;

        if (Math.abs(Denom) < 1e-9) {
            console.log("[Modeler FAIL] Features perfectly collinear.");
            return this.getEmptyModel();
        }

        const b1 = (S22 * S1Y - S12 * S2Y) / Denom; // Slope Age ($/year)
        const b2 = (S11 * S2Y - S12 * S1Y) / Denom; // Slope Km ($/km)
        const b0 = meanY - b1 * meanX1 - b2 * meanX2; // Intercept

        // 6. R2
        let SSE = 0;
        for (let i = 0; i < N; i++) {
            const pred = b0 + b1 * X1[i] + b2 * X2[i];
            const resid = Y[i] - pred;
            SSE += resid * resid;
        }
        const r2 = 1 - (SSE / SST);

        return {
            coefficients: {
                intercept: b0,
                year: b1,
                km: b2
            },
            depreciation: {
                per_year_usd: b1,
                per_10k_km_usd: b2 * 10000
            },
            predict: (year, km) => {
                const age = currentYear - year;
                return b0 + (b1 * age) + (b2 * km);
            },
            r2: r2,
            modelType: 'LINEAR'
        };
    }

    trainExponentialModel(data: CarData[]): ModelResult {
        const currentYear = new Date().getFullYear();

        // 1. Filter (Exclude prices <= 0 for log)
        const validData = data.filter(d => d.year > 1990 && d.price_usd > 2000 && d.km >= 0); // Include 0km

        if (validData.length < 2) {
            return this.getEmptyModel();
        }

        // 2. Prepare Vectors (Y = ln(Price))
        const N = validData.length;
        const X1 = validData.map(d => currentYear - d.year);
        const X2 = validData.map(d => d.km);
        const Y_real = validData.map(d => d.price_usd);
        const Y_log = validData.map(d => Math.log(d.price_usd));

        // 3. Means (of Log Y)
        const meanX1 = X1.reduce((a, b) => a + b, 0) / N;
        const meanX2 = X2.reduce((a, b) => a + b, 0) / N;
        const meanYLog = Y_log.reduce((a, b) => a + b, 0) / N;

        // 4. Sums of Squares/Products (Deviations)
        let S11 = 0, S22 = 0, S12 = 0, S1Y = 0, S2Y = 0;

        for (let i = 0; i < N; i++) {
            const x1 = X1[i] - meanX1;
            const x2 = X2[i] - meanX2;
            const y = Y_log[i] - meanYLog;

            S11 += x1 * x1;
            S22 += x2 * x2;
            S12 += x1 * x2;
            S1Y += x1 * y;
            S2Y += x2 * y;
        }

        // 5. Solve OLS (Cramer's Rule for 2 vars)
        const Denom = S11 * S22 - S12 * S12;

        if (Math.abs(Denom) < 1e-9) {
            return this.getEmptyModel();
        }

        const b1 = (S22 * S1Y - S12 * S2Y) / Denom; // Coeff Age (Percentage Decay)
        const b2 = (S11 * S2Y - S12 * S1Y) / Denom; // Coeff Km (Percentage Decay)
        const b0 = meanYLog - b1 * meanX1 - b2 * meanX2; // Log-Intercept

        // 6. R2 on ORIGINAL SCALE (Crucial for comparison)
        // We compare Sum of Squared Errors of Real Price vs Exp(Predicted Log Price)
        let SSE_real = 0;
        let SST_real = 0;
        const meanY_real = Y_real.reduce((a, b) => a + b, 0) / N;

        for (let i = 0; i < N; i++) {
            const predLog = b0 + b1 * X1[i] + b2 * X2[i];
            const predReal = Math.exp(predLog);
            const resid = Y_real[i] - predReal;

            SSE_real += resid * resid;
            SST_real += Math.pow(Y_real[i] - meanY_real, 2);
        }

        const r2 = 1 - (SSE_real / SST_real);

        return {
            coefficients: {
                intercept: b0,
                year: b1,
                km: b2
            },
            depreciation: {
                // Approximate percentage loss for display purposes
                // For exponential: 1 - e^b1 approx -b1
                per_year_usd: (Math.exp(b1) - 1) * 100, // Percentage per year
                per_10k_km_usd: (Math.exp(b2 * 10000) - 1) * 100 // Percentage per 10k km
            },
            predict: (year, km) => {
                const age = currentYear - year;
                return Math.exp(b0 + (b1 * age) + (b2 * km));
            },
            r2: r2,
            modelType: 'EXPONENTIAL'
        };
    }

    trainEnsembleModel(data: CarData[], linear: ModelResult, exponential: ModelResult): ModelResult {
        const currentYear = new Date().getFullYear();
        const validData = data.filter(d => d.year > 1990 && d.price_usd > 2000 && d.km >= 0); // Include 0km cars
        const N = validData.length;

        if (N < 2) return this.getEmptyModel();

        // Prepare Actual vs Predicted Vectors
        const Y = validData.map(d => d.price_usd);
        const L_pred = validData.map(d => linear.predict(d.year, d.km));
        const E_pred = validData.map(d => exponential.predict(d.year, d.km));

        // Optimize W: Minimize sum((Y - (w*L + (1-w)*E))^2)
        // Let Delta = L - E
        // Residual Pure Exp = R_e = Y - E
        // Target: R_e = w * Delta
        // OLS for w (no intercept) = sum(R_e * Delta) / sum(Delta^2)

        let sumNum = 0; // sum(R_e * Delta)
        let sumDen = 0; // sum(Delta^2)

        for (let i = 0; i < N; i++) {
            const delta = L_pred[i] - E_pred[i];
            const r_e = Y[i] - E_pred[i];
            sumNum += r_e * delta;
            sumDen += delta * delta;
        }

        // Avoid division by zero if models are identical
        let w = sumDen === 0 ? 0.5 : sumNum / sumDen;

        // Clamp w to [0, 1]
        w = Math.max(0, Math.min(1, w));

        // Calculate Ensemble R2
        let SSE = 0;
        let SST = 0;
        const meanY = Y.reduce((a, b) => a + b, 0) / N;

        for (let i = 0; i < N; i++) {
            const pred = w * L_pred[i] + (1 - w) * E_pred[i];
            const resid = Y[i] - pred;
            SSE += resid * resid;
            SST += Math.pow(Y[i] - meanY, 2);
        }

        const r2 = 1 - (SSE / SST);

        return {
            // We return Linear coefficients merely for basic info, but the real logic is in predict/weights
            coefficients: linear.coefficients,
            depreciation: linear.depreciation,
            predict: (year, km) => {
                const l = linear.predict(year, km);
                const e = exponential.predict(year, km);
                return w * l + (1 - w) * e;
            },
            r2: r2,
            modelType: 'ENSEMBLE',
            weights: {
                linear: w,
                exponential: 1 - w
            }
        };
    }

    /**
     * Aggressive Outlier Removal Strategy 🛡️
     * 1. Median Deviation Filter: Per year, remove items that deviate too much from median.
     * 2. Sigma Clipping: Train a temp model, remove items with high residuals.
     */
    public filterOutliers(data: CarData[]): CarData[] {
        if (data.length < 5) return data; // Too small to filter safely

        // --- Stage 1: Median Deviation per Year ---
        const groupedByYear: Record<number, number[]> = {};
        data.forEach(d => {
            if (!groupedByYear[d.year]) groupedByYear[d.year] = [];
            groupedByYear[d.year].push(d.price_usd);
        });

        const medianLimits: Record<number, { min: number, max: number }> = {};

        Object.keys(groupedByYear).forEach(yStr => {
            const year = Number(yStr);
            const prices = groupedByYear[year].sort((a, b) => a - b);
            const mid = Math.floor(prices.length / 2);
            const median = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

            // Allow 50% deviation downwards (strict on "too cheap" errors)
            // Allow 70% deviation upwards (features like armor/"blindado" can be expensive)
            medianLimits[year] = {
                min: median * 0.5,
                max: median * 1.7
            };
        });

        let cleanData = data.filter(d => {
            const limit = medianLimits[d.year];
            if (!limit) return true;
            return d.price_usd >= limit.min && d.price_usd <= limit.max;
        });

        if (cleanData.length < 4) return data; // Abort if Stage 1 killed too many

        // --- Stage 2: Sigma Clipping (Iterative Residual Filter) ---
        // Train a temp model to find structural outliers
        try {
            const tempModel = this.trainLinearCore(cleanData);

            // Calculate residuals
            const residuals = cleanData.map(d => {
                const pred = tempModel.predict(d.year, d.km);
                return Math.abs(d.price_usd - pred);
            });

            // Calculate Std Dev of residuals
            const meanResid = residuals.reduce((a, b) => a + b, 0) / residuals.length;
            const variance = residuals.reduce((a, b) => a + Math.pow(b - meanResid, 2), 0) / residuals.length;
            const sigma = Math.sqrt(variance);

            // Filter out > 2.5 sigma
            const sigmaThreshold = 2.5 * sigma;
            const initialCount = cleanData.length;

            cleanData = cleanData.filter((d, i) => residuals[i] <= sigmaThreshold);

            const removedCount = initialCount - cleanData.length;
            if (removedCount > 0) {
                console.log(`[Outlier Cleanup] Removed ${removedCount} items via Sigma Clipping.`);
            } else {
                // console.log(`[Outlier Cleanup] Sigma Clipping removed nothing (Sigma: ${sigma.toFixed(0)})`);
            }

        } catch (e) {
            console.warn("Sigma clipping failed, skipping stage 2");
        }

        return cleanData;
    }

    private getEmptyModel(): ModelResult {
        return {
            coefficients: { intercept: 0, year: 0, km: 0 },
            depreciation: { per_year_usd: 0, per_10k_km_usd: 0 },
            predict: () => 0,
            r2: 0,
            modelType: 'LINEAR'
        };
    }
}
