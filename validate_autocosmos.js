
const fs = require('fs');
const path = require('path');
const regression = require('regression'); // Assuming regression package exists or I reuse logic

// Re-using simplified modeler logic for standalone validation
// (Using regression package or basic math if not available, usually locally implemented)
// To stay robust, I'll implement simple OLS here to match the typescript logic roughly.

const trainDataPath = path.join(__dirname, 'data', 'market_data.json');
const testDataPath = path.join(__dirname, 'scraped_data_autocosmos.json');

const trainData = JSON.parse(fs.readFileSync(trainDataPath, 'utf8'));
const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));

// Group by Model
const models = [...new Set(testData.map(d => d.brand_model))];

console.log("--- Autocosmos Validation (External Test) ---");
console.log(`Train Set: ${trainData.length} items (MeLi + Kavak + CarOne)`);
console.log(`Test Set: ${testData.length} items (Autocosmos)`);
console.log(`Exchange Rate Used: 1450 ARS/USD\n`);

const results = [];

models.forEach(model => {
    // 1. Get Train Set for this model
    const trainSet = trainData.filter(d => d.brand_model === model && d.price_usd > 2000 && d.year > 1990);

    // 2. Get Test Set
    const testSet = testData.filter(d => d.brand_model === model && d.price_usd > 2000 && d.year > 1990);

    if (trainSet.length < 5 || testSet.length < 3) return; // Skip insufficient data

    // 3. Train Model (Age + Km)
    // Using simple linear regression for validation approximation: Price = A + B*Age + C*Km
    // Solving via Normal Equations or simplification. 
    // For JS simplicity, let's use a very basic estimator or the 'regression' lib if available.
    // Assuming regression lib handles 2D? No, it handles 1D.
    // Let's implement basic Linear Regression for Multi-variable (Closed Form)

    // X matrix: [1, age, km]
    // Y vector: [price]

    function solveOLS(data) {
        let n = data.length;
        let sumY = 0, sumX1 = 0, sumX2 = 0;
        let sumX1Y = 0, sumX2Y = 0, sumX1X2 = 0;
        let sumX1Sq = 0, sumX2Sq = 0;

        data.forEach(d => {
            const age = 2026 - d.year;
            const km = d.km;
            const y = d.price_usd;

            sumY += y;
            sumX1 += age;
            sumX2 += km;
            sumX1Y += age * y;
            sumX2Y += km * y;
            sumX1X2 += age * km;
            sumX1Sq += age * age;
            sumX2Sq += km * km;
        });

        // Simple Mean normalization to avoid matrix complexity in raw JS script
        // Actually, let's just use average depreciation rates derived from previous steps to validate general fit?
        // No, user wants specific validation.
        // Let's use a simpler heuristic: Price = Base * (dep_year)^Age * (dep_km)^Km
        // Or just Linear: coeff = (X'X)^-1 X'Y. 
        // I will write a mini-solver.

        return {
            predict: (year, km) => {
                const age = 2026 - year;
                // Fallback to simple averages for robust script execution without mathjs
                // Filter similar items (+- 2 years, +- 30k km) and averge
                const similar = data.filter(d => Math.abs(d.year - year) <= 2 && Math.abs(d.km - km) < 40000);
                if (similar.length > 0) {
                    return similar.reduce((a, b) => a + b.price_usd, 0) / similar.length;
                }
                // Fallback to global avg
                return data.reduce((a, b) => a + b.price_usd, 0) / data.length;
            }
        };
    }

    // Better Solver using the "regression" dependency mentioned in package.json?
    // It's usually for 2D. 
    // Let's use the actual Agent B code approach: Logic approximation.
    // Actually, I can just use the 'intelligence_report.json' which HAS the coefficients already trained!
    // This is much smarter. Use the EXISTING TRAINED AGENT B models to predict Test Set.


});

// REVISED APPROACH: Load Intelligence Report (Pre-trained on Train Set)
const reportPath = path.join(__dirname, 'data', 'intelligence_report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('Using pre-trained models from intelligence_report.json...');

models.forEach(model => {
    const modelInfo = report.find(m => m.model === model);
    const testSet = testData.filter(d => d.brand_model === model && d.price_usd > 2000);

    if (!modelInfo || testSet.length < 3) return;

    let totalAPE = 0;
    let totalError = 0;
    let n = 0;

    // Calculate R2 features
    let ssRes = 0;
    let ssTot = 0;
    const meanY = testSet.reduce((a, b) => a + b.price_usd, 0) / testSet.length;

    testSet.forEach(item => {
        const age = 2026 - item.year;
        const km = item.km;

        // Prediction using Coefficients from Report
        // Linear: Intercept + year*age_val + km*km_val? 
        // Note: Report coeffs are year (slope), km (slope).
        // Check report format: "year" is coefficient for Age or Year literal?
        // Typically my code uses Age. Let's assume Age or check intercept magnitude.
        // Intercept ~25000 means Age based. If Intercept ~ -2000000 means Year based.
        // Report sample: Intercept = 24899. Year Coeff = -1175. This implies AGE (negative slope).

        // However, standard linear equation: price = intercept + (coeff * val).
        // Let's try Age.

        let pred = 0;

        // Use Exponential if weights favor it, or just use Linear as baseline
        // Report has "exponential_coefficients".

        // Simple Linear for robustness check
        const lin = modelInfo.coefficients;
        pred = lin.intercept + (lin.year * age) + (lin.km * km);

        if (pred < 0) pred = 1000;

        const error = Math.abs(item.price_usd - pred);
        const ape = error / item.price_usd;

        totalError += error;
        totalAPE += ape;
        ssRes += Math.pow(item.price_usd - pred, 2);
        ssTot += Math.pow(item.price_usd - meanY, 2);
        n++;
    });

    const mae = totalError / n;
    const mape = (totalAPE / n) * 100;
    const r2 = 1 - (ssRes / ssTot);

    results.push({
        Model: model,
        Count: n,
        MAE: Math.round(mae),
        MAPE: mape.toFixed(1) + '%',
        R2: r2.toFixed(3)
    });
});

console.table(results);
