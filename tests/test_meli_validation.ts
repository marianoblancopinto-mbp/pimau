
import { MercadoLibreClient } from './agents/agent_a/mercadolibre_client';
import { PriceModeler } from './agents/agent_b/modeler';
import { readFile, writeFileSync } from 'fs';
import { join } from 'path';

interface CarData {
    brand_model: string;
    year: number;
    km: number;
    price_usd: number;
    source: string;
    url?: string;
}

class ValidationRunner {
    private scraper = new MercadoLibreClient();
    private modeler = new PriceModeler();

    async run() {
        // 1. Load Training Data (Unified: Kavak + Autocosmos)
        const trainPath = join(process.cwd(), 'vehicle-intelligence', 'data', 'unified_market_data.json');
        const trainContent = await new Promise<string>((resolve, reject) =>
            readFile(trainPath, 'utf-8', (e, d) => e ? reject(e) : resolve(d))
        );
        const trainData: CarData[] = JSON.parse(trainContent);

        // 2. Load Test Data (MercadoLibre - Pre-scraped)
        const testPath = join(process.cwd(), 'vehicle-intelligence', 'data', 'meli_validation_data.json');
        let testData: CarData[] = [];
        try {
            const testContent = await new Promise<string>((resolve, reject) =>
                readFile(testPath, 'utf-8', (e, d) => e ? reject(e) : resolve(d))
            );
            testData = JSON.parse(testContent);
            console.log(`Loaded ${testData.length} items from meli_validation_data.json`);
        } catch (e) {
            console.log("Validation data not found. Run parse_meli_local.ts first.");
            return;
        }

        const models = ["Toyota SW4", "Toyota Corolla", "Jeep Compass"];

        // 3. Validation Loop
        console.log("\nStarting Cross-Site Validation (Train: Kavak+Autocosmos -> Test: MercadoLibre)...\n");

        console.log("| Model | Train N | Test N | MAE ($) | MAPE (%) | RMSE ($) | R² (Ext) |");
        console.log("|---|---|---|---|---|---|---|");

        for (const model of models) {
            const trainSet = trainData.filter(d =>
                d.brand_model.toLowerCase().includes(model.toLowerCase()) &&
                d.price_usd > 2000 && d.year > 1990 && d.km > 100
            );

            const testSet = testData.filter(d =>
                d.brand_model.toLowerCase().includes(model.toLowerCase()) &&
                d.price_usd > 2000 && d.year > 1990 && d.km > 100
            );

            if (trainSet.length < 5 || testSet.length < 1) {
                console.log(`| ${model} | ${trainSet.length} | ${testSet.length} | N/A | N/A | N/A | N/A |`);
                continue;
            }

            // Train
            const linear = this.modeler.trainModel(trainSet);
            const exponential = this.modeler.trainExponentialModel(trainSet);
            const ensemble = this.modeler.trainEnsembleModel(trainSet, linear, exponential);

            // Test
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

                // Avoid skew from VERY low prices (miscategorized)
                if (actualPrice > 1000) {
                    percentageErrors.push((Math.abs(error) / actualPrice) * 100);
                }

                y_true.push(actualPrice);
                y_pred.push(predictedPrice);
            }

            const mae = absoluteErrors.reduce((a, b) => a + b, 0) / testSet.length;
            const mape = percentageErrors.reduce((a, b) => a + b, 0) / percentageErrors.length;
            const mse = squaredErrors.reduce((a, b) => a + b, 0) / testSet.length;
            const rmse = Math.sqrt(mse);

            // R2
            const yMean = y_true.reduce((a, b) => a + b, 0) / y_true.length;
            const ssTot = y_true.reduce((a, b) => a + Math.pow(b - yMean, 2), 0);
            const ssRes = y_true.reduce((a, b, i) => a + Math.pow(b - y_pred[i], 2), 0);
            const r2 = 1 - (ssRes / ssTot);

            console.log(`| ${model} | ${trainSet.length} | ${testSet.length} | $${mae.toFixed(0)} | ${mape.toFixed(2)}% | $${rmse.toFixed(0)} | ${r2.toFixed(3)} |`);
        }
    }
}

new ValidationRunner().run();
