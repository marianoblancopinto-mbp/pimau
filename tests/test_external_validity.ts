
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PriceModeler } from './agents/agent_b/modeler';

// Use same interfaces
interface CarData {
    brand_model: string;
    year: number;
    km: number;
    price_usd: number;
    source: string;
    url?: string;
}

interface ValidationResult {
    model: string;
    trainSize: number;
    testSize: number;
    metrics: {
        mae: number;
        mape: number;
        rmse: number;
        r2_test: number;
    }
}

class ExternalValidator {
    private modeler = new PriceModeler();

    async runTest(targetModel: string): Promise<ValidationResult | null> {
        // 1. Load Train Data (MeLi)
        const trainContent = await readFile(join(process.cwd(), 'vehicle-intelligence', 'data', 'market_data.json'), 'utf-8');
        let trainData: CarData[] = JSON.parse(trainContent);

        // 2. Load Test Data (Autocosmos)
        const testContent = await readFile(join(process.cwd(), 'vehicle-intelligence', 'data', 'external_validation.json'), 'utf-8');
        let testData: CarData[] = JSON.parse(testContent);

        // 3. Filter for target model
        const trainSet = trainData.filter(d =>
            d.brand_model.toLowerCase().includes(targetModel.toLowerCase()) &&
            d.price_usd > 2000 && d.year > 1990 && d.km > 100
        );

        const testSet = testData.filter(d =>
            d.brand_model.toLowerCase().includes(targetModel.toLowerCase()) &&
            d.price_usd > 2000 && d.year > 1990 && d.km > 100
        );

        if (trainSet.length < 10 || testSet.length < 1) {
            console.log(`[Skipping] Not enough data for ${targetModel} (Train: ${trainSet.length}, Test: ${testSet.length})`);
            return null;
        }

        // 4. Train Model on MeLi
        const linear = this.modeler.trainModel(trainSet);
        const exponential = this.modeler.trainExponentialModel(trainSet);
        const ensemble = this.modeler.trainEnsembleModel(trainSet, linear, exponential);

        // 5. Evaluate on Autocosmos
        let absoluteErrors: number[] = [];
        let squaredErrors: number[] = [];
        let percentageErrors: number[] = [];
        let y_true: number[] = [];
        let y_pred: number[] = [];

        for (const car of testSet) {
            const predictedPrice = ensemble.predict(car.year, car.km);
            const actualPrice = car.price_usd;

            const error = actualPrice - predictedPrice;
            absoluteErrors.push(Math.abs(error));
            squaredErrors.push(error * error);
            percentageErrors.push((Math.abs(error) / actualPrice) * 100);

            y_true.push(actualPrice);
            y_pred.push(predictedPrice);
        }

        // Calculate Metrics
        const mae = absoluteErrors.reduce((a, b) => a + b, 0) / testSet.length;
        const mape = percentageErrors.reduce((a, b) => a + b, 0) / testSet.length;
        const mse = squaredErrors.reduce((a, b) => a + b, 0) / testSet.length;
        const rmse = Math.sqrt(mse);

        // R2 on Test Set
        const yMean = y_true.reduce((a, b) => a + b, 0) / y_true.length;
        const ssTot = y_true.reduce((a, b) => a + Math.pow(b - yMean, 2), 0);
        const ssRes = y_true.reduce((a, b, i) => a + Math.pow(b - y_pred[i], 2), 0);
        const r2 = 1 - (ssRes / ssTot);

        return {
            model: targetModel,
            trainSize: trainSet.length,
            testSize: testSet.length,
            metrics: { mae, mape, rmse, r2_test: r2 }
        };
    }
}

async function main() {
    const validator = new ExternalValidator();

    const modelsToTest = [
        "Toyota SW4", "Toyota Corolla", "Jeep Compass"
    ];

    console.log("Starting External Validity Test (Train: MeLi -> Test: Autocosmos)...\n");
    console.log("| Model | Train (MeLi) | Test (Autocosmos) | MAE ($) | MAPE (%) | RMSE ($) | R² (Ext) |");
    console.log("|---|---|---|---|---|---|---|");

    for (const model of modelsToTest) {
        const result = await validator.runTest(model);
        if (result) {
            const m = result.metrics;
            console.log(`| ${result.model} | ${result.trainSize} | ${result.testSize} | $${m.mae.toFixed(0)} | ${m.mape.toFixed(2)}% | $${m.rmse.toFixed(0)} | ${m.r2_test.toFixed(3)} |`);
        }
    }
}

main();
