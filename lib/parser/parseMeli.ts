export interface ParsedCar {
    title: string;
    model: string; // The dataset name
    currency: string;
    price: number;
    year: number;
    km: number;
    location: string;
}

function extractKnownVersions(lines: string[]): string[] {
    const versions: string[] = [];
    let inVersionesBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
        // Start looking when we hit the Versiones header
        if (lines[i] === 'Versiones') {
            inVersionesBlock = true;
            continue;
        }
        
        if (inVersionesBlock) {
            // Break out of the block when we hit the next typical section or a "Mostrar más"
            if (lines[i] === 'Mostrar más' || lines[i] === 'Tipo de combustible' || lines[i] === 'Categorías' || lines[i] === 'Año') {
                break;
            }
            
            // MercadoLibre filter items consist of the ItemName followed by its count: "(1.234)" on the next line
            if (/^\([\d\.]+\)$/.test(lines[i+1] || '') && lines[i].length > 2) {
                versions.push(lines[i].toUpperCase().trim());
            }
        }
    }
    
    // Return only the top 4 most populated versions to prevent over-fragmentation
    return versions.slice(0, 4);
}

function extractVersion(title: string, baseModel: string, knownVersions: string[] = []): string {
    let cleanTitle = title.toUpperCase();

    // 1. DYNAMIC MATCHING: Try to match against the natively extracted filter list first
    for (const known of knownVersions) {
        if (cleanTitle.includes(known)) {
            return known;
        }
    }

    // 2. If known versions were extracted from the sidebar, ONLY use those.
    // Do NOT fall back to heuristic guessing — it produces junk like "TOYOTA USADOS".
    // Instead, find the closest known version by word overlap so we never create a phantom "Base" group.
    if (knownVersions.length > 0) {
        const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
        let bestMatch = knownVersions[0]; // Default: most popular version (sidebar is ordered by count)
        let bestScore = 0;
        for (const known of knownVersions) {
            const knownWords = known.split(/\s+/).filter(w => w.length > 2);
            const overlap = knownWords.filter(kw => titleWords.some(tw => tw.includes(kw) || kw.includes(tw))).length;
            if (overlap > bestScore) {
                bestScore = overlap;
                bestMatch = known;
            }
        }
        return bestMatch;
    }

    // 3. HEURISTIC FALLBACK: Only used when NO known versions exist at all (no sidebar data)
    const noise = ['VW', 'VOLKSWAGEN', 'TOYOTA', 'VOLVO', 'RENAULT', 'PEUGEOT', 'CITROEN', 'FORD', 'CHEVROLET', 'NISSAN', 'JEEP', 'HYUNDAI', 'KIA'];
    
    // Remove base model words and common brand noise
    const wordsToRemove = [
        ...baseModel.toUpperCase().split(/\s+/),
        ...noise
    ];
    
    for (const word of wordsToRemove) {
        if (word.length > 1) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            cleanTitle = cleanTitle.replace(regex, '');
        }
    }

    cleanTitle = cleanTitle
        // Engine sizes (1.6, 2.0, 1.5T)
        .replace(/\b\d\.\d[A-Z]?\b/g, '')
        // HP/CV (110cv, 143cv)
        .replace(/\b\d{2,3}CV\b/gi, '')
        // Traction (4x2, 4x4, 4WD)
        .replace(/\b4X[24]\b/gi, '')
        .replace(/\b4WD\b/gi, '')
        // Phases (Ph1, Ph2, Phase 2)
        .replace(/\bPH\d\b/gi, '')
        .replace(/\bPHASE \d\b/gi, '')
        // Transmissions
        .replace(/\b(?:MT|AT|CVT|X-TRONIC|XTRONIC|MANUAL|AUTOMATICA)\b/gi, '')
        // Random tech words / noise
        .replace(/\b(?:ABS|NAV|TURBO|HR16|TCE|16V)\b/gi, '')
        // Remove non-letters
        .replace(/[^A-Z\s]/g, ' ')
        .trim();

    // Extract remaining valid words
    const words = cleanTitle.split(/\s+/).filter(w => w.length > 2);
    
    if (words.length > 0) {
        // Take up to 2 words for the version name (e.g. "CONFORT PLUS", "TECH ROAD")
        return words.slice(0, 2).join(' ').trim();
    }
    return ''; // Return empty string so model just stays the base model
}

export function parseMeliText(rawText: string, datasetName: string): ParsedCar[] {
    // 1. Clean and split by lines
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const cars: ParsedCar[] = [];
    let currentCar: Partial<ParsedCar> = {};

    // 1.5. Extract known versions from the copied sidebar (if present)
    const knownVersions = extractKnownVersions(lines);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 2. Detect Currency and Price ($ or US$, followed by a number)
        if ((line === '$' || line === 'US$') && /^[\d\.]+$/.test(lines[i+1] || '')) {
            // Only capture the first price to ignore 'Anticipo de'
            if (!currentCar.price) {
                currentCar.currency = 'US$'; // Force normalize to USD
                let rawPrice = parseFloat(lines[i+1].replace(/\./g, ''));
                if (line === '$') {
                    rawPrice = rawPrice / 1050; // Approximated ARS to USD rate
                }
                currentCar.price = rawPrice;
                
                // Look up for the real title (skipping ad tags and dealer names)
                let foundTitle = '';
                const baseWords = datasetName.toLowerCase().split(' ').filter(w => w.length > 2);
                
                for(let j = i - 1; j >= Math.max(0, i - 10); j--) {
                    const lineLower = lines[j].toLowerCase();
                    // If it contains the main brand/model words and is NOT the validation tag
                    if (baseWords.some(w => lineLower.includes(w)) && !lineLower.includes('validado')) {
                        foundTitle = lines[j];
                        break;
                    }
                }
                currentCar.title = foundTitle || lines[i-1];
            }
        }
        
        // 3. Detect Year and KM (Standard format: Year on one line, "X Km" on next)
        if (/^20[0-2]\d$/.test(line) && /^[\d\.]+\s+Km$/i.test(lines[i+1] || '')) {
            if (currentCar.price) {
                currentCar.year = parseInt(line);
                currentCar.km = parseInt(lines[i+1].replace(/[\.\sKm]/gi, ''));
                
                const version = extractVersion(currentCar.title || '', datasetName, knownVersions);
                currentCar.model = version ? `${datasetName} ${version}` : datasetName;
                
                if ((currentCar.km || 0) > 0) {
                    cars.push({...currentCar} as ParsedCar);
                }
                currentCar = {}; 
            }
        }
        // 4. Detect Alternative format (Grouped in one line: "2021 | 79.161 km | La Plata")
        else if (/^(20[0-2]\d)\s*\|\s*([\d\.]+)\s*km\s*\|\s*(.+)$/i.test(line)) {
            if (currentCar.price) {
                const match = line.match(/^(20[0-2]\d)\s*\|\s*([\d\.]+)\s*km\s*\|\s*(.+)$/i);
                if (match) {
                    currentCar.year = parseInt(match[1]);
                    currentCar.km = parseInt(match[2].replace(/\./g, ''));
                    
                    const version = extractVersion(currentCar.title || '', datasetName, knownVersions);
                    currentCar.model = version ? `${datasetName} ${version}` : datasetName;
                    
                    if ((currentCar.km || 0) > 0) {
                        cars.push({...currentCar} as ParsedCar);
                    }
                    currentCar = {};
                }
            }
        }
    }

    return cars;
}
