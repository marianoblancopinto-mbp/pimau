const fs = require('fs');
const path = require('path');

const ARS_TO_USD = 1300;

// Load raw scraped data
const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, 'compass_raw_scraped.json'), 'utf8'));
console.log('📊 Raw items loaded:', rawData.length);

// Excluded versions
const EXCLUDED = ['trailhawk', 'blackhawk', 'serie-s', 'serie s', 'hurricane'];

// Process and categorize
const processed = {
    sport: [],
    longitude: [],
    limited: []
};

rawData.forEach(item => {
    const titleLower = item.title.toLowerCase();

    // Skip excluded versions
    if (EXCLUDED.some(ex => titleLower.includes(ex))) return;

    // Parse year
    let year = 0;
    item.attrs.forEach(attr => {
        if (/^20\d{2}$/.test(attr)) year = parseInt(attr);
    });

    // Parse km
    let km = 0;
    item.attrs.forEach(attr => {
        if (attr.toLowerCase().includes('km')) {
            km = parseInt(attr.replace(/\D/g, '')) || 0;
        }
    });

    // Skip 0km cars
    if (km === 0) return;

    // Skip invalid years (pre-2017 new generation Compass)
    if (year < 2017 || year > 2025) return;

    // Parse price
    let price = parseInt(item.price) || 0;
    const isUSD = item.currency.includes('US');
    let priceUSD = isUSD ? price : Math.round(price / ARS_TO_USD);

    // Filter invalid prices
    if (priceUSD < 10000 || priceUSD > 50000) return;

    // Categorize by version
    let category = null;
    if (titleLower.includes('limited')) {
        category = 'limited';
    } else if (titleLower.includes('longitude')) {
        category = 'longitude';
    } else if (titleLower.includes('sport')) {
        category = 'sport';
    }

    if (!category) return;

    processed[category].push({
        brand_model: `JEEP COMPASS ${category.toUpperCase()}`,
        year,
        km,
        price_usd: priceUSD,
        source: 'mercadolibre_scrape',
        version: item.title
    });
});

console.log('\n📊 Processed items by category:');
console.log(`   SPORT: ${processed.sport.length}`);
console.log(`   LONGITUDE: ${processed.longitude.length}`);
console.log(`   LIMITED: ${processed.limited.length}`);

// Stats per category
Object.entries(processed).forEach(([cat, items]) => {
    if (items.length > 0) {
        const prices = items.map(i => i.price_usd);
        const years = items.map(i => i.year);
        const kms = items.map(i => i.km);
        console.log(`\n   ${cat.toUpperCase()} details:`);
        console.log(`      Price USD: ${Math.min(...prices)} - ${Math.max(...prices)}`);
        console.log(`      Years: ${Math.min(...years)} - ${Math.max(...years)}`);
        console.log(`      Km: ${Math.min(...kms)} - ${Math.max(...kms)}`);
    }
});

// Load existing market_data and remove old Compass
const marketDataPath = path.join(__dirname, 'data', 'market_data.json');
const marketData = JSON.parse(fs.readFileSync(marketDataPath, 'utf8'));
const withoutCompass = marketData.filter(e => !e.brand_model?.includes('COMPASS'));
console.log(`\n🧹 Removed ${marketData.length - withoutCompass.length} old Compass entries`);

// Add new data
const allNew = [...processed.sport, ...processed.longitude, ...processed.limited];
const final = [...withoutCompass, ...allNew];

fs.writeFileSync(marketDataPath, JSON.stringify(final, null, 2));
console.log(`\n✅ Saved to market_data.json`);
console.log(`   Total entries: ${final.length}`);
console.log(`   New Compass entries: ${allNew.length}`);
