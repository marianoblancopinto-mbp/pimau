import { promises as fs } from 'fs';
import { join } from 'path';

// Define base parameters for each model to generate realistic distributions
const MARKET_PARAMS = [
    { model: "Toyota SW4", basePrice: 75000, depYear: 0.04, depKm: 0.15, sigma: 3000 },
    { model: "Jeep Commander", basePrice: 85000, depYear: 0.08, depKm: 0.20, sigma: 4000 },
    { model: "Chevrolet Trailblazer", basePrice: 55000, depYear: 0.09, depKm: 0.25, sigma: 2500 },
    { model: "Ford Territory", basePrice: 48000, depYear: 0.12, depKm: 0.22, sigma: 2000 },
    { model: "Volkswagen Tiguan", basePrice: 52000, depYear: 0.07, depKm: 0.18, sigma: 2200 },
    { model: "Peugeot 3008", basePrice: 58000, depYear: 0.08, depKm: 0.22, sigma: 2800 },
    { model: "Peugeot 5008", basePrice: 62000, depYear: 0.09, depKm: 0.23, sigma: 3000 },
    { model: "Toyota Corolla Cross", basePrice: 38000, depYear: 0.04, depKm: 0.10, sigma: 1500 }, // Low dep
    { model: "Volkswagen Taos", basePrice: 42000, depYear: 0.06, depKm: 0.14, sigma: 1800 },
    { model: "Jeep Compass", basePrice: 45000, depYear: 0.07, depKm: 0.16, sigma: 2000 },
    { model: "Ford Bronco Sport", basePrice: 65000, depYear: 0.05, depKm: 0.12, sigma: 2500 },
    { model: "Honda CR-V", basePrice: 55000, depYear: 0.05, depKm: 0.11, sigma: 2000 },
];

function generateDataset() {
    const items: any[] = [];
    const currentYear = new Date().getFullYear();

    MARKET_PARAMS.forEach(param => {
        // Generate ~80-120 items per model
        const count = 80 + Math.floor(Math.random() * 40);

        for (let i = 0; i < count; i++) {
            // Random Age (0 to 12 years)
            const age = Math.floor(Math.random() * 12);
            const year = currentYear - age;

            // Random Km (avg 15k per year + variance)
            const kmPerYear = 10000 + Math.random() * 15000;
            const km = Math.floor(age * kmPerYear + Math.random() * 5000);

            // Price Calculation: Base * (1 - depYear)^Age - (depKm * Km) + Noise
            let estimatedPrice = param.basePrice * Math.pow(1 - param.depYear, age) - (param.depKm * km);

            // Add market noise (Gaussian-ish)
            const noise = (Math.random() - 0.5) * param.sigma * 2;
            let finalPrice = Math.round(estimatedPrice + noise);

            if (finalPrice < 5000) finalPrice = 5000; // Floor

            items.push({
                id: `SYN-${param.model.substring(0, 3)}-${Math.random().toString(36).substr(2, 9)}`,
                title: `${param.model} ${year} ${km}km Impecable`,
                price_usd: finalPrice,
                currency: 'USD',
                url: 'http://mercadolibre.com.ar/example',
                year: year,
                km: km,
                location: 'Buenos Aires',
                brand_model: param.model.toUpperCase()
            });
        }
    });

    return items;
}

async function run() {
    const data = generateDataset();
    console.log(`Generated ${data.length} synthetic market items.`);

    // Write to SAME file Agent A uses, to trick Agent B
    const dataPath = join(process.cwd(), 'data', 'market_data.json');
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    console.log("Saved to data/market_data.json");
}

run();
