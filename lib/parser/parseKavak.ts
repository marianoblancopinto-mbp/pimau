import { ParsedCar } from './parseMeli';

// Helper to extract known configurations (e.g. "XEI" from "2.0 XEI • Manual")
function extractTrimFromKavakInfo(infoSegment: string, datasetName: string): string {
    let cleanInfo = infoSegment.toUpperCase()
        .replace(datasetName.toUpperCase(), '') 
        // Remove engine sizes like 2.0, 1.8, 1.5T
        .replace(/\b\d\.\d[A-Z]?\b/g, '')
        // Transmissions
        .replace(/\b(?:MANUAL|AUTOMATICA|AUTOMÁTICO|CVT|X-TRONIC)\b/gi, '')
        // Special Kavak words
        .replace(/\b(?:HYBRID|HIBRIDO)\b/gi, 'HYBRID')
        // Non letters
        .replace(/[^A-Z\s\-]/g, ' ')
        .trim();

    return cleanInfo.split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(' ').trim();
}

export function parseKavakText(rawText: string, datasetName: string): ParsedCar[] {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const cars: ParsedCar[] = [];
    let currentCar: Partial<ParsedCar> = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Kavak sets "$" on one line and the number down below
        if ((line === '$' || line === 'US$') && /^[\d\.]+$/.test(lines[i+1] || '')) {
            // First price captured is the defining price ("Precio desde:" usually comes first and is ignored since it contains the number on the same line "$ 33.160.000")
            // The actual real final price is split "$ \n 32.500.000"
            if (!currentCar.price) {
                let rawPrice = parseFloat(lines[i+1].replace(/\./g, ''));
                if (line === '$') {
                    rawPrice = rawPrice / 1050; // Approximated ARS to USD
                }
                currentCar.price = rawPrice;
                currentCar.currency = 'US$';
                
                // Backtrack deeply to find the defining info line ("2020 • 32.193 km • 2.0 XEI • Manual")
                let foundTrim = '';
                for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
                    const infoMatch = lines[j].match(/^(20[0-2]\d)\s*•\s*([\d\.]+)\s*km\s*•\s*(.+)$/i);
                    if (infoMatch) {
                        currentCar.year = parseInt(infoMatch[1]);
                        currentCar.km = parseInt(infoMatch[2].replace(/\./g, ''));
                        foundTrim = extractTrimFromKavakInfo(infoMatch[3], datasetName);
                        break;
                    }
                }
                
                currentCar.title = foundTrim ? `${datasetName} ${foundTrim}` : datasetName;
                currentCar.model = currentCar.title;
                
                if (currentCar.year && currentCar.km) {
                    cars.push({...currentCar} as ParsedCar);
                }
                currentCar = {};
            }
        }
    }

    return cars;
}
