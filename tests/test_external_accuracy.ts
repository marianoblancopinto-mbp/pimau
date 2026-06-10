
import { PriceModeler, CarData } from './agents/agent_b/modeler';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface TestCase {
    modelName: string;
    year: number;
    km: number;
    priceUsd: number;
    source: 'User' | 'Scrape';
}

const EXCHANGE_RATE = 1450;

// Helper to parse potential text prices if needed, but here we hardcode the scraped values
const rawTestCases: TestCase[] = [
    // --- USER DATA (Base Truth) ---
    { modelName: 'Ford EcoSport', year: 2017, km: 58000, priceUsd: 20400000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Ford EcoSport', year: 2017, km: 51000, priceUsd: 19200000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Ford EcoSport', year: 2018, km: 103000, priceUsd: 22900000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Ford EcoSport', year: 2021, km: 99000, priceUsd: 23370000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Chevrolet Tracker', year: 2025, km: 1000, priceUsd: 39550000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Jeep Renegade', year: 2017, km: 91700, priceUsd: 22400000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Jeep Renegade', year: 2018, km: 70000, priceUsd: 25900000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Jeep Renegade', year: 2021, km: 70000, priceUsd: 26300000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Jeep Renegade', year: 2023, km: 50000, priceUsd: 31800000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Jeep Renegade', year: 2024, km: 21000, priceUsd: 33200000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Nissan Kicks', year: 2019, km: 103000, priceUsd: 25500000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Nissan Kicks', year: 2019, km: 72700, priceUsd: 28300000 / EXCHANGE_RATE, source: 'User' },
    { modelName: 'Nissan Kicks', year: 2021, km: 82000, priceUsd: 29100000 / EXCHANGE_RATE, source: 'User' },

    // --- BATCH 1: Duster, Corolla Cross, HR-V, Territory, Nivus ---
    // Renault Duster
    { modelName: 'Renault Duster', year: 2019, km: 105000, priceUsd: 21300000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Renault Duster', year: 2012, km: 155000, priceUsd: 13500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Renault Duster', year: 2016, km: 165000, priceUsd: 13000, source: 'Scrape' },
    { modelName: 'Renault Duster', year: 2013, km: 175000, priceUsd: 16500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Renault Duster', year: 2017, km: 112000, priceUsd: 14800, source: 'Scrape' },
    { modelName: 'Renault Duster', year: 2017, km: 80000, priceUsd: 16900, source: 'Scrape' },

    // Toyota Corolla Cross
    { modelName: 'Toyota Corolla Cross', year: 2023, km: 41400, priceUsd: 41000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Toyota Corolla Cross', year: 2025, km: 100, priceUsd: 41200, source: 'Scrape' },
    { modelName: 'Toyota Corolla Cross', year: 2023, km: 50000, priceUsd: 40000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Toyota Corolla Cross', year: 2021, km: 53000, priceUsd: 30800, source: 'Scrape' },
    { modelName: 'Toyota Corolla Cross', year: 2022, km: 45000, priceUsd: 43000000 / EXCHANGE_RATE, source: 'Scrape' },

    // Honda HR-V
    { modelName: 'Honda HR-V', year: 2018, km: 74000, priceUsd: 24000, source: 'Scrape' },
    { modelName: 'Honda HR-V', year: 2017, km: 120000, priceUsd: 25000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Honda HR-V', year: 2017, km: 89000, priceUsd: 25900000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Honda HR-V', year: 2020, km: 76000, priceUsd: 22900, source: 'Scrape' },
    { modelName: 'Honda HR-V', year: 2020, km: 154100, priceUsd: 20000, source: 'Scrape' },
    // Excluded the $240,000 outlier manually, but script would filter it anyway

    // Ford Territory
    { modelName: 'Ford Territory', year: 2025, km: 8000, priceUsd: 38500, source: 'Scrape' },
    { modelName: 'Ford Territory', year: 2021, km: 40000, priceUsd: 35000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford Territory', year: 2025, km: 1, priceUsd: 49000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford Territory', year: 2025, km: 8000, priceUsd: 53899000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford Territory', year: 2022, km: 48000, priceUsd: 30000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford Territory', year: 2023, km: 20000, priceUsd: 47900000 / EXCHANGE_RATE, source: 'Scrape' },

    // VW Nivus (FILTER ANTICIPOS LATER)
    { modelName: 'Volkswagen Nivus', year: 2022, km: 31800, priceUsd: 26500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Volkswagen Nivus', year: 2023, km: 20000, priceUsd: 1499999 / EXCHANGE_RATE, source: 'Scrape' }, // Low
    { modelName: 'Volkswagen Nivus', year: 2024, km: 15000, priceUsd: 5999999 / EXCHANGE_RATE, source: 'Scrape' }, // Low
    { modelName: 'Volkswagen Nivus', year: 2023, km: 27500, priceUsd: 6000000 / EXCHANGE_RATE, source: 'Scrape' }, // Low

    // --- BATCH 2: T-Cross, Taos, 2008, SW4, CR-V ---
    // VW T-Cross
    { modelName: 'Volkswagen T-Cross', year: 2020, km: 100000, priceUsd: 31500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Volkswagen T-Cross', year: 2021, km: 75000, priceUsd: 24000, source: 'Scrape' },
    { modelName: 'Volkswagen T-Cross', year: 2019, km: 43000, priceUsd: 27000000 / EXCHANGE_RATE, source: 'Scrape' },
    // Anticipos ignored

    // VW Taos
    // All scraped Taos were low anticipos (~$3-8M ARS). Skipping Taos test due to lack of full price data in sample.
    // Actually, I should probably check if I have valid Taos data in my User set? No.

    // Peugeot 2008
    { modelName: 'Peugeot 2008', year: 2018, km: 92000, priceUsd: 17000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Peugeot 2008', year: 2017, km: 86000, priceUsd: 17000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Peugeot 2008', year: 2020, km: 53000, priceUsd: 10000000 / EXCHANGE_RATE, source: 'Scrape' }, // Suspiciously low ($6.8k) but might be real or anticipo
    { modelName: 'Peugeot 2008', year: 2018, km: 115000, priceUsd: 14900, source: 'Scrape' },

    // Toyota SW4
    { modelName: 'Toyota SW4', year: 2020, km: 79539, priceUsd: 47000, source: 'Scrape' },
    { modelName: 'Toyota SW4', year: 2021, km: 136000, priceUsd: 40000, source: 'Scrape' },
    { modelName: 'Toyota SW4', year: 2024, km: 29600, priceUsd: 69500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Toyota SW4', year: 2023, km: 84000, priceUsd: 52000, source: 'Scrape' },
    { modelName: 'Toyota SW4', year: 2016, km: 206000, priceUsd: 32000, source: 'Scrape' },

    // Honda CR-V
    { modelName: 'Honda CR-V', year: 2016, km: 140000, priceUsd: 26000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Honda CR-V', year: 2014, km: 120000, priceUsd: 23900, source: 'Scrape' },
    { modelName: 'Honda CR-V', year: 2013, km: 153000, priceUsd: 16000, source: 'Scrape' },
    { modelName: 'Honda CR-V', year: 2011, km: 191000, priceUsd: 18899000 / EXCHANGE_RATE, source: 'Scrape' }, // 2011 < 2012 limit, might be dropped
    { modelName: 'Honda CR-V', year: 2012, km: 223480, priceUsd: 18000, source: 'Scrape' },

    // --- BATCH 3: Compass, Tucson, Sorento, Tiguan ---
    // Jeep Compass
    { modelName: 'Jeep Compass', year: 2018, km: 110000, priceUsd: 30000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Jeep Compass', year: 2021, km: 46500, priceUsd: 32000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Jeep Compass', year: 2022, km: 45000, priceUsd: 31500, source: 'Scrape' },
    { modelName: 'Jeep Compass', year: 2018, km: 140000, priceUsd: 30000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Jeep Compass', year: 2018, km: 145000, priceUsd: 22500, source: 'Scrape' },
    { modelName: 'Jeep Compass', year: 2020, km: 102000, priceUsd: 36000000 / EXCHANGE_RATE, source: 'Scrape' },

    // Hyundai Tucson
    { modelName: 'Hyundai Tucson', year: 2016, km: 125000, priceUsd: 22800, source: 'Scrape' },
    { modelName: 'Hyundai Tucson', year: 2013, km: 150000, priceUsd: 14000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Hyundai Tucson', year: 2013, km: 136000, priceUsd: 18500, source: 'Scrape' },
    { modelName: 'Hyundai Tucson', year: 2013, km: 63000, priceUsd: 19500, source: 'Scrape' },
    { modelName: 'Hyundai Tucson', year: 2018, km: 119500, priceUsd: 29900000 / EXCHANGE_RATE, source: 'Scrape' },

    // Kia Sorento
    { modelName: 'Kia Sorento', year: 2013, km: 340000, priceUsd: 16990, source: 'Scrape' },
    { modelName: 'Kia Sorento', year: 2019, km: 80300, priceUsd: 32900, source: 'Scrape' },
    { modelName: 'Kia Sorento', year: 2014, km: 150000, priceUsd: 21480, source: 'Scrape' },
    { modelName: 'Kia Sorento', year: 2013, km: 164000, priceUsd: 20000000 / EXCHANGE_RATE, source: 'Scrape' },

    // VW Tiguan
    { modelName: 'Volkswagen Tiguan', year: 2013, km: 181500, priceUsd: 21000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Volkswagen Tiguan', year: 2018, km: 180000, priceUsd: 23800, source: 'Scrape' },
    { modelName: 'Volkswagen Tiguan', year: 2019, km: 190000, priceUsd: 25000, source: 'Scrape' },
    { modelName: 'Volkswagen Tiguan', year: 2018, km: 132000, priceUsd: 34900000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Volkswagen Tiguan', year: 2019, km: 195000, priceUsd: 24500, source: 'Scrape' },
    { modelName: 'Volkswagen Tiguan', year: 2020, km: 85000, priceUsd: 39000000 / EXCHANGE_RATE, source: 'Scrape' },

    // --- PREVIOUSLY SCRAPED (Re-adding) ---
    // Ford EcoSport (Scraped)
    { modelName: 'Ford EcoSport', year: 2018, km: 83000, priceUsd: 19500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford EcoSport', year: 2020, km: 105000, priceUsd: 18000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford EcoSport', year: 2019, km: 101000, priceUsd: 20000000 / EXCHANGE_RATE, source: 'Scrape' },
    // Removed the 2007 EcoSport Outlier here
    { modelName: 'Ford EcoSport', year: 2015, km: 179000, priceUsd: 10500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Ford EcoSport', year: 2014, km: 172000, priceUsd: 14000000 / EXCHANGE_RATE, source: 'Scrape' },

    // Chevrolet Tracker (Scraped)
    { modelName: 'Chevrolet Tracker', year: 2023, km: 36500, priceUsd: 29900000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Chevrolet Tracker', year: 2016, km: 78000, priceUsd: 16000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Chevrolet Tracker', year: 2020, km: 155000, priceUsd: 24000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Chevrolet Tracker', year: 2016, km: 170000, priceUsd: 16000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Chevrolet Tracker', year: 2017, km: 94000, priceUsd: 18000000 / EXCHANGE_RATE, source: 'Scrape' },

    // Nissan Kicks (Scraped)
    { modelName: 'Nissan Kicks', year: 2018, km: 110000, priceUsd: 23500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Nissan Kicks', year: 2018, km: 100000, priceUsd: 26500000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Nissan Kicks', year: 2017, km: 90000, priceUsd: 18900, source: 'Scrape' },
    { modelName: 'Nissan Kicks', year: 2019, km: 115000, priceUsd: 24600000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Nissan Kicks', year: 2020, km: 50000, priceUsd: 26000000 / EXCHANGE_RATE, source: 'Scrape' },
    { modelName: 'Nissan Kicks', year: 2021, km: 80000, priceUsd: 31300000 / EXCHANGE_RATE, source: 'Scrape' },
];

function mean(numbers: number[]) {
    return numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
}

function stdDev(numbers: number[]) {
    const m = mean(numbers);
    const sqDiffs = numbers.map(n => Math.pow(n - m, 2));
    return Math.sqrt(mean(sqDiffs));
}

async function runValidation() {
    const modeler = new PriceModeler();

    // Load Training Data
    const content = await readFile(join(process.cwd(), 'vehicle-intelligence', 'data', 'market_data.json'), 'utf-8');
    const allData: CarData[] = JSON.parse(content);

    // Filter Logic
    // 1. Minimum Year: 2012
    // 2. Minimum Price: $7,000 USD (Removes anticipos)
    let filteredTests = rawTestCases.filter(t => t.year >= 2012 && t.priceUsd >= 7000);

    // 3. Statistical Group Filter
    const groups: { [key: string]: TestCase[] } = {};
    filteredTests.forEach(t => {
        if (!groups[t.modelName]) groups[t.modelName] = [];
        groups[t.modelName].push(t);
    });

    const finalTestCases: TestCase[] = [];
    const distinctModels = Object.keys(groups);

    console.log("Starting External Validity Test (All Models)");
    console.log(`Exchange Rate: $${EXCHANGE_RATE}`);
    console.log("Outlier Filtering: Year >= 2012, Price >= $7k, and Z-Score < 1.5");
    console.log("---------------------------------------------------");

    for (const model of distinctModels) {
        let items = groups[model];

        // Z-Score Filtering
        if (items.length >= 3) {
            const prices = items.map(i => i.priceUsd);
            const m = mean(prices);
            const s = stdDev(prices);

            // Filter if |Z| > 1.5 (Agressive for small samples)
            const countBefore = items.length;
            items = items.filter(i => {
                const z = Math.abs((i.priceUsd - m) / (s || 1));
                return z <= 1.5;
            });
            const removed = countBefore - items.length;
            if (removed > 0) {
                console.log(`[Filter] ${model}: Removed ${removed} outlier(s) via Z-Score.`);
            }
        }

        finalTestCases.push(...items);
    }

    // Run Tests
    let totalMape = 0;
    let totalCount = 0;
    const results: any[] = [];

    for (const model of distinctModels) {
        const modelTests = finalTestCases.filter(t => t.modelName === model);
        if (modelTests.length === 0) continue;

        const trainData = allData.filter(d =>
            d.brand_model.toLowerCase().includes(model.toLowerCase()) &&
            d.price_usd > 2000 &&
            d.year > 2005
        );

        if (trainData.length < 5) {
            console.log(`[Skip] ${model}: Insufficient training data (${trainData.length}).`);
            continue;
        }

        const linear = modeler.trainModel(trainData);
        const exponential = modeler.trainExponentialModel(trainData);
        const ensemble = modeler.trainEnsembleModel(trainData, linear, exponential);

        console.log(`\nEvaluating ${model} (N=${modelTests.length})...`);
        let mapeSum = 0;
        let maeSum = 0;

        for (const test of modelTests) {
            const predicted = ensemble.predict(test.year, test.km);
            const actual = test.priceUsd;
            const absDiff = Math.abs(predicted - actual);
            const pctDiff = (absDiff / actual) * 100;

            mapeSum += pctDiff;
            maeSum += absDiff;
            totalMape += pctDiff;
            totalCount++;

            console.log(`  ${test.year} (${test.km}km): Act $${actual.toFixed(0)} vs Preg $${predicted.toFixed(0)} => Diff ${pctDiff.toFixed(1)}%`);
        }

        const avgMape = mapeSum / modelTests.length;
        const avgMae = maeSum / modelTests.length;
        const accuracy = 100 - avgMape;

        results.push({
            model,
            accuracy,
            mape: avgMape,
            mae: avgMae,
            samples: modelTests.length
        });

        console.log(`  => Accuracy: ${accuracy.toFixed(2)}%`);
    }

    const globalMape = totalMape / totalCount;
    const globalAccuracy = 100 - globalMape;

    console.log("\n===================================================");
    console.log("FINAL REPORT SORTED BY ACCURACY");
    console.log("===================================================");

    results.sort((a, b) => b.accuracy - a.accuracy);

    console.log(`| Model | Accuracy | MAPE | MAE ($) | Samples |`);
    console.log(`|---|---|---|---|---|`);
    results.forEach(r => {
        console.log(`| ${r.model} | ${r.accuracy.toFixed(2)}% | ${r.mape.toFixed(2)}% | $${r.mae.toFixed(0)} | ${r.samples} |`);
    });

    console.log("---------------------------------------------------");
    console.log(`GLOBAL ACCURACY: ${globalAccuracy.toFixed(2)}%`);
    console.log("===================================================");
}

runValidation();
