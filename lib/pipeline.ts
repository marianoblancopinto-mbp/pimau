const { PriceModeler } = require('./core/modeler');
const { readFile, writeFile } = require('fs/promises');
const { join } = require('path');
const { EMERGENT_RULES } = require('./core/emergent_rules');


async function runAgentB() {
    console.log("--- 🧠 Agent B: Starting Intelligence Analysis (Dual Depreciation) ---");

    // 1. Load Data
    const dataPath = join(__dirname, '../../data', 'market_data.json');
    let rawData = [];
    try {
        const content = await readFile(dataPath, 'utf-8');
        rawData = JSON.parse(content);
    } catch (e) {
        console.error("❌ Critical: No market data found. Run Agent A first.");
        return;
    }

    console.log(`📊 Loaded ${rawData.length} data points.`);

    // 2. Group by Model
    const grouped: Record<string, any> = {};
    rawData.forEach((item: any) => {
        // Normalization 🛠️
        if (item.brand_model === 'VOLKSWAGEN TIGUAN ALLSPACE') {
            item.brand_model = 'VOLKSWAGEN TIGUAN';
            item.version = (item.version || '') + ' ALLSPACE';
        }

        if (!grouped[item.brand_model]) grouped[item.brand_model] = [];
        grouped[item.brand_model].push(item);
    });

    // 2b. Apply Emergent Version Splitting ✂️
    Object.keys(EMERGENT_RULES).forEach(parentModel => {
        if (grouped[parentModel]) {
            const parentData = grouped[parentModel];
            const rules = EMERGENT_RULES[parentModel];

            console.log(`🔍 Splitting ${parentModel} (${parentData.length} items)...`);

            // Distribute items into new keys
            parentData.forEach((item: any) => {
                // Combine Title + Version for full context
                const textToSearch = (item.title + ' ' + (item.version || '')).toUpperCase();

                // Find first matching rule
                const match = rules.find((r: any) => r.match(textToSearch));

                if (match) {
                    const newKey = `${parentModel} ${match.versionName}`;
                    if (!grouped[newKey]) grouped[newKey] = [];

                    // Simple deduplication based on URL if possible, otherwise just push
                    // We assume iteration is unique per item
                    grouped[newKey].push(item);
                }
            });

            // Log results
            rules.forEach((r: any) => {
                const key = `${parentModel} ${r.versionName}`;
                if (grouped[key]) {
                    console.log(`  -> Created ${key}: ${grouped[key].length} items`);
                }
            });
        }
    });

    // 3. Train Models & Bucket Analysis
    const modeler = new PriceModeler();
    const BENCHMARK_MODEL = 'TOYOTA SW4';

    const results = Object.keys(grouped).map(modelName => {
        const dataset = grouped[modelName];
        if (dataset.length < 10) return null;

        // A. Regression Model Competition & Ensemble 🏁
        const linear = modeler.trainModel(dataset);
        const exponential = modeler.trainExponentialModel(dataset);
        const ensemble = modeler.trainEnsembleModel(dataset, linear, exponential);

        // We always return the Ensemble (which contains weights for L and E)
        const trained = ensemble;

        // B. Mileage Buckets Analysis
        // 0-50k, 50-100k, 100-150k, 150-200k, 200k+
        const buckets = [
            { label: '0-50k km', min: 0, max: 50000, count: 0, sumPrice: 0 },
            { label: '50k-100k km', min: 50000, max: 100000, count: 0, sumPrice: 0 },
            { label: '100k-150k km', min: 100000, max: 150000, count: 0, sumPrice: 0 },
            { label: '150k-200k km', min: 150000, max: 200000, count: 0, sumPrice: 0 },
            { label: '200k+ km', min: 200000, max: 9999999, count: 0, sumPrice: 0 },
        ];

        dataset.forEach((d: any) => {
            const bucket = buckets.find(b => d.km >= b.min && d.km < b.max);
            if (bucket) {
                bucket.count++;
                bucket.sumPrice += d.price_usd;
            }
        });

        const bucketStats = buckets.map(b => ({
            range: b.label,
            count: b.count,
            avg_price: b.count > 0 ? Math.round(b.sumPrice / b.count) : 0
        }));

        // C. Calculate Data Ranges
        const years = dataset.map((d: any) => d.year);
        const kms = dataset.map((d: any) => d.km);
        const yearRange = { min: Math.min(...years), max: Math.max(...years) };
        const kmRange = { min: Math.min(...kms), max: Math.max(...kms) };

        return {
            model: modelName,
            count: dataset.length,
            // Dual metrics
            depreciation_per_year: trained.depreciation.per_year_usd,
            depreciation_per_10k_km: trained.depreciation.per_10k_km_usd,
            coefficients: linear.coefficients, // Linear coeffs (Legacy/Primary)
            exponential_coefficients: exponential.coefficients, // Exp coeffs for Ensemble calc
            r2: trained.r2,
            modelType: trained.modelType,
            weights: trained.weights,
            buckets: bucketStats,
            // Data Ranges
            yearRange,
            kmRange,
            // Predictions for quick validation
            fair_price_new: trained.predict(new Date().getFullYear(), 0),
            fair_price_5yo_100k: trained.predict(new Date().getFullYear() - 5, 100000)
        };
    }).filter(x => x !== null);

    // 4. Benchmark Comparison (vs SW4)
    const sw4Stats = results.find(r => r?.model === BENCHMARK_MODEL);

    if (!sw4Stats) {
        console.warn("⚠️ Warning: Benchmark (SW4) missing.");
    }

    const finalReport = results.map(r => {
        if (!r) return null;
        let resilience_score = 0;
        let stability_label = 'Unknown';

        if (sw4Stats) {
            // Compare TOTAL projected loss over 5 years & 100k km to normalize
            // Loss = (5 * DepYear) + (10 * Dep10k)
            const projectedLossMine = (5 * Math.abs(r.depreciation_per_year)) + (10 * Math.abs(r.depreciation_per_10k_km));
            const projectedLossSW4 = (5 * Math.abs(sw4Stats.depreciation_per_year)) + (10 * Math.abs(sw4Stats.depreciation_per_10k_km));

            // Avoid division by zero
            const lossRatio = projectedLossSW4 > 0 ? projectedLossMine / projectedLossSW4 : 1.0;

            // Lower loss ratio is better (e.g. 0.8 means I lose less than SW4)
            // Resilience Score: Higher is better. Base 100 = SW4.
            // If LossRatio = 2.0 (Lose twice as much), Score = 50.
            // If LossRatio = 0.5 (Lose half), Score = 200.

            resilience_score = (1 / lossRatio) * 100;

            if (resilience_score > 110) stability_label = '💎 Platinum';
            else if (resilience_score > 90) stability_label = '🥇 Gold';
            else if (resilience_score > 75) stability_label = '🥈 Silver';
            else stability_label = '🥉 Bronze';
        }

        return { ...r, resilience_score, stability_label };
    });

    // 5. Save Report
    const outPath = join(__dirname, '../../data', 'intelligence_report.json');
    await writeFile(outPath, JSON.stringify(finalReport, null, 2));

    console.log(`✅ Intelligence Generated.`);
    console.log("\n--- Dual Depreciation Analysis ---");
    finalReport.slice(0, 5).forEach(r => {
        if (!r) return;
        console.log(`\n🚗 ${r.model} [${r.stability_label}]`);
        console.log(`   📉 Wear: $${r.depreciation_per_10k_km.toFixed(0)} / 10k km`);
        console.log(`   ⏳ Time: $${r.depreciation_per_year.toFixed(0)} / year`);
        console.log(`   🎯 Fair Price (5yo, 100k): $${r.fair_price_5yo_100k.toFixed(0)}`);
    });
}

runAgentB().catch(console.error);
