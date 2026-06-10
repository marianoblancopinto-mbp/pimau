import express from 'express';
import { parseMeliText } from './parser/parseMeli';
import { parseKavakText } from './parser/parseKavak';
import { PriceModeler } from './core/modeler';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/paste', (req, res) => {
    // Leer modelos existentes
    const dataDir = path.join(process.cwd(), 'data');
    const reportPath = path.join(dataDir, 'intelligence_report.json');
    let existingModels: string[] = [];
    
    if (fs.existsSync(reportPath)) {
        try {
            const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            const rawModels = reportData.map((r: any) => r.parentModel || r.model).filter(Boolean);
            
            // Limpiamos las versiones comunes (trim levels) si en reportes viejos se guardaron con todo el nombre
            const trims = [
                ' SPORT', ' LONGITUDE', ' LIMITED', ' ALLURE PLUS', ' ADVANCE', 
                ' EXCLUSIVE', ' SEG', ' XEI', ' XLI', ' GRS', ' COMFORTLINE', 
                ' HIGHLINE', ' HERO', ' TRENDLINE', ' PREMIUM', ' EXTREME'
            ];
            
            const cleanModels = rawModels.map((m: string) => {
                let clean = m.toUpperCase().trim();
                for (const trim of trims) {
                    if (clean.endsWith(trim)) {
                        clean = clean.replace(trim, '').trim();
                    }
                }
                return clean;
            });
            
            existingModels = [...new Set(cleanModels)].sort() as string[];
        } catch (e) {}
    }

    const optionsHtml = existingModels.map(m => `<option value="${m}">${m}</option>`).join('');

    res.send(`
        <html>
        <head>
            <script>
                function toggleNewModel() {
                    var select = document.getElementById('modelSelect');
                    var input = document.getElementById('newModelInput');
                    if (select.value === 'NEW') {
                        input.style.display = 'block';
                        input.required = true;
                    } else {
                        input.style.display = 'none';
                        input.required = false;
                    }
                }
            </script>
        </head>
        <body>
        <h1>Pegar Texto Crudo (Ctrl+A)</h1>
        <form method="POST" action="/save">
            <label for="modelSelect">Modelo del Vehículo:</label><br>
            <select id="modelSelect" name="modelSelect" style="width:100%; padding: 5px;" onchange="toggleNewModel()">
                ${optionsHtml}
                <option value="NEW">➕ NUEVO MODELO (Escribir manualmente)</option>
            </select><br><br>
            
            <input type="text" id="newModelInput" name="newModelInput" placeholder="Ej: CHEVROLET TRACKER" style="width:100%; padding: 5px; display: ${existingModels.length === 0 ? 'block' : 'none'};"><br>
            
            <label for="source">Plataforma Origen:</label><br>
            <select id="source" name="source" style="width:100%; padding: 5px;">
                <option value="meli">MercadoLibre</option>
                <option value="kavak">Kavak</option>
            </select><br><br>

            <textarea id="rawtext" name="rawtext" style="width:100%; height:300px;" required></textarea><br><br>
            <button id="submit" type="submit" style="padding: 10px 20px;">Guardar Data</button>
        </form>
        ${existingModels.length === 0 ? '<script>document.getElementById("modelSelect").value = "NEW"; toggleNewModel();</script>' : ''}
        </body></html>
    `);
});

app.post('/save', async (req, res) => {
    const { modelSelect, newModelInput, rawtext, source } = req.body;
    let modelName = modelSelect === 'NEW' ? newModelInput : modelSelect;
    modelName = (modelName || '').toUpperCase().trim();
    
    console.log(`\n================================`);
    console.log(`📩 Recibido texto para modelo: ${modelName} desde ${source}`);
    
    try {
        let parsed = [];
        if (source === 'kavak') {
            parsed = parseKavakText(rawtext || '', modelName);
        } else {
            parsed = parseMeliText(rawtext || '', modelName);
        }
        
        console.log(`   ✅ Extraídos ${parsed.length} vehículos.`);
        
        if (parsed.length > 0) {
            await processAndSaveToDb(parsed, modelName);
        }
        res.send('<html><body><h1>✅ Guardado Exitoso</h1> <a href="/paste">Volver</a></body></html>');
    } catch (e) {
        console.error(e);
        res.send('<html><body><h1>❌ Error</h1> <a href="/paste">Volver</a></body></html>');
    }
});

async function processAndSaveToDb(parsedCars: any[], parentModel: string) {
    const cleanParentModel = parentModel.trim().toUpperCase();

    const grouped = parsedCars.reduce((acc: any, car: any) => {
        const carModelFull = car.model.trim().toUpperCase();
        
        if (carModelFull === cleanParentModel) {
            return acc; 
        }
        
        // Simple deduplication based on signature (year, km, price)
        const signature = `${car.year}_${car.km}_${car.price}`;
        car.signature = signature;

        if (!acc[car.model]) acc[car.model] = [];
        
        const isDuplicate = acc[car.model].some((existingCar: any) => existingCar.signature === signature);
        if (!isDuplicate) {
            acc[car.model].push(car);
        }
        
        return acc;
    }, {});
    
    const newReports: any[] = [];
    const newScatterData: any = {};
    const modeler = new PriceModeler();
    
    console.log(`   📦 Variantes encontradas después de filtrar: ${Object.keys(grouped).join(', ')}`);

    Object.entries(grouped).forEach(([variantName, cars]: [string, any]) => {
        if (cars.length < 5) {
            console.log(`   ⚠️ Variante "${variantName}" tiene pocas muestras (${cars.length}), ignorando...`);
            return;
        }
        
        const carData = cars.map((c: any) => ({
            brand_model: c.model,
            year: c.year,
            km: c.km,
            price_usd: c.price
        }));
        
        const linearModel = modeler.trainModel(carData);
        const expModel = modeler.trainExponentialModel(carData);
        const finalModel = modeler.trainEnsembleModel(carData, linearModel, expModel);
        
        const prices = carData.map((c: any) => c.price_usd);
        const years = carData.map((c: any) => c.year);
        const kms = carData.map((c: any) => c.km);
        
        newReports.push({
            model: variantName,
            parentModel: parentModel,
            isManual: true,
            count: carData.length,
            depreciation_per_year: finalModel.depreciation.per_year_usd,
            depreciation_per_10k_km: finalModel.depreciation.per_10k_km_usd,
            coefficients: finalModel.coefficients,
            resilience_score: finalModel.r2 * 100,
            stability_label: finalModel.r2 > 0.8 ? 'Platinum' : finalModel.r2 > 0.6 ? 'Gold' : 'Silver',
            r2: finalModel.r2,
            yearRange: { min: Math.min(...years), max: Math.max(...years) },
            kmRange: { min: Math.min(...kms), max: Math.max(...kms) },
            modelType: finalModel.modelType,
            weights: finalModel.weights,
            exponential_coefficients: expModel.coefficients,
            buckets: []
        });
        
        const validCars = modeler.filterOutliers(carData);
        newScatterData[variantName] = validCars.map(c => ({
            year: c.year,
            km: c.km,
            price: c.price_usd
        }));
    });
    
    saveDatasetLocally(parentModel, newReports, newScatterData);
}

function saveDatasetLocally(parentModel: string, newReports: any[], newScatterData: any) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // 1. Update intelligence_report.json
    const reportPath = path.join(dataDir, 'intelligence_report.json');
    let reportData: any[] = [];
    if (fs.existsSync(reportPath)) {
        reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }
    
    reportData = reportData.filter((item: any) =>
        !(item.model === parentModel || item.model.startsWith(parentModel + ' '))
    );

    const cleanReports = newReports.map((r: any) => ({ ...r, isManual: true }));
    reportData.push(...cleanReports);
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    // 2. Update market_data.json
    const marketPath = path.join(dataDir, 'market_data.json');
    let marketData: any[] = [];
    if (fs.existsSync(marketPath)) {
        marketData = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
    }

    marketData = marketData.filter((item: any) =>
        !(item.brand_model === parentModel || item.brand_model.startsWith(parentModel + ' '))
    );
    
    const newMarketEntries: any[] = [];
    Object.entries(newScatterData).forEach(([modelName, points]: [string, any]) => {
        points.forEach((p: any) => {
            newMarketEntries.push({
                brand_model: modelName,
                year: p.year,
                km: p.km,
                price_usd: p.price,
                source: 'Ctrl+A Import',
                added_at: new Date().toISOString()
            });
        });
    });
    
    marketData.push(...newMarketEntries);
    fs.writeFileSync(marketPath, JSON.stringify(marketData, null, 2));

    console.log(`   💾 DB local actualizada con ${newReports.length} variantes guardadas.`);
}

app.listen(9999, () => {
    console.log('📡 Servidor importador corriendo en http://localhost:9999/paste');
});
