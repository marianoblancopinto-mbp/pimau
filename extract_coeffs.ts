const { PriceModeler } = require('./lib/core/modeler');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'market_data.json');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const modeler = new PriceModeler();

function getCoeffs(modelName, type) {
    const items = rawData.filter(d => d.brand_model === modelName);

    if (type === 'LINEAR') {
        const res = modeler.trainModel(items);
        return res.coefficients;
    } else {
        const res = modeler.trainExponentialModel(items);
        return res.coefficients;
    }
}

console.log('--- Coefficients Extraction ---');

// 1. FORD ECOSPORT (Linear)
const eco = getCoeffs('FORD ECOSPORT', 'LINEAR');
console.log('\nFORD ECOSPORT (Linear):');
console.table(eco);

// 2. RENAULT DUSTER (Exponential)
const duster = getCoeffs('RENAULT DUSTER', 'EXPONENTIAL');
console.log('\nRENAULT DUSTER (Exponential):');
console.table(duster);

// 3. HYUNDAI TUCSON (Both)
const tucsonLin = getCoeffs('HYUNDAI TUCSON', 'LINEAR');
const tucsonExp = getCoeffs('HYUNDAI TUCSON', 'EXPONENTIAL');
console.log('\nHYUNDAI TUCSON (Linear):');
console.table(tucsonLin);
console.log('\nHYUNDAI TUCSON (Exponential):');
console.table(tucsonExp);
