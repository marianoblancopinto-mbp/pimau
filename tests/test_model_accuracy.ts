
import { PriceModeler, CarData } from './agents/agent_b/modeler';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface ValidationResult {
    model: string;
    sampleSize: number;
    trainSize: number;
    testSize: number;
    metrics: {
        mae: number;   // Mean Absolute Error ($)
        mape: number;  // Mean Absolute Percentage Error (%)
        rmse: number;  // Root Mean Square Error ($)
        r2_test: number; // R2 on Test Set
    };
    modelType: string;
}

class AccuracyTester {
    private modeler = new PriceModeler();

    async runTest(targetModel: string): Promise<ValidationResult | null> {
        // 1. Load Data
        const content = await readFile(join(process.cwd(), 'vehicle-intelligence', 'data', 'market_data.json'), 'utf-8');
        const allData: CarData[] = JSON.parse(content);

        // 2. Filter target
        // Simple filter: Check if brand_model contains the target string
        const modelData = allData.filter(d =>
            d.brand_model.toLowerCase().includes(targetModel.toLowerCase()) &&
            d.price_usd > 2000 &&
            d.year > 1990 &&
            d.km > 100
        );

        if (modelData.length < 10) {
            console.log(`[Skipping] Not enough data for ${targetModel} (Found: ${modelData.length})`);
            return null;
        }

        // 3. Split Train/Test (80/20)
        // Shuffle first
        const shuffled = modelData.sort(() => 0.5 - Math.random());
        const splitIdx = Math.floor(modelData.length * 0.8);
        const trainSet = shuffled.slice(0, splitIdx);
        const testSet = shuffled.slice(splitIdx);

        if (testSet.length === 0) return null;

        // 4. Train Model
        // We test the ENSEMBLE model as it's the production standard
        const linear = this.modeler.trainModel(trainSet);
        const exponential = this.modeler.trainExponentialModel(trainSet);
        const ensemble = this.modeler.trainEnsembleModel(trainSet, linear, exponential);

        // 5. Evaluate on Test Set
        let sumAbsError = 0;
        let sumAbsPctError = 0;
        let sumSqError = 0;
        let ssTot = 0;
        let ssRes = 0;

        // Calculate Mean of Test Y for R2
        const meanYTest = testSet.reduce((sum, d) => sum + d.price_usd, 0) / testSet.length;

        testSet.forEach(item => {
            const prediction = ensemble.predict(item.year, item.km);
            const actual = item.price_usd;

            const error = actual - prediction;
            const absError = Math.abs(error);

            sumAbsError += absError;
            sumAbsPctError += (absError / actual);
            sumSqError += (error * error);

            ssTot += Math.pow(actual - meanYTest, 2);
            ssRes += (error * error);
        });

        const n = testSet.length;
        const mae = sumAbsError / n;
        const mape = (sumAbsPctError / n) * 100;
        const rmse = Math.sqrt(sumSqError / n);
        const r2_test = 1 - (ssRes / ssTot);

        return {
            model: targetModel,
            sampleSize: modelData.length,
            trainSize: trainSet.length,
            testSize: testSet.length,
            metrics: {
                mae,
                mape,
                rmse,
                r2_test
            },
            modelType: ensemble.modelType
        };
    }
}

async function main() {
    const tester = new AccuracyTester();

    const modelsToTest = [
        "Toyota SW4",
        "Toyota Corolla",
        "Ford Ranger",
        "Jeep Compass",
        "Volkswagen Amarok",
        "Peugeot 208",
        "Fiat Cronos"
    ];

    console.log("Starting Model Accuracy Validation...\n");
    console.log("| Model | N (Test) | MAE ($) | MAPE (%) | RMSE ($) | R² (Test) |");
    console.log("|---|---|---|---|---|---|");

    for (const model of modelsToTest) {
        const result = await tester.runTest(model);
        if (result) {
            const m = result.metrics;
            console.log(`| ${result.model} | ${result.testSize} | $${m.mae.toFixed(0)} | ${m.mape.toFixed(2)}% | $${m.rmse.toFixed(0)} | ${m.r2_test.toFixed(3)} |`);
        }
    }
}

main();
