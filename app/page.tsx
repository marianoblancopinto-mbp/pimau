import { promises as fs } from 'fs';
import path from 'path';
import { Dashboard } from '@/components/Dashboard';
import { EMERGENT_RULES } from '@/lib/core/emergent_rules';

export interface ScatterPoint {
  year: number;
  km: number;
  price: number;
}

interface ReportItem {
  model: string;
  count: number;
  depreciation_per_year: number;
  depreciation_per_10k_km: number;
  coefficients: { intercept: number; year: number; km: number };
  buckets: { range: string; avg_price: number; count: number }[];
  resilience_score: number;
  stability_label: string;
  r2: number;
  yearRange: { min: number; max: number };
  kmRange: { min: number; max: number };
  modelType?: 'LINEAR' | 'EXPONENTIAL' | 'ENSEMBLE';
  weights?: { linear: number; exponential: number };
  exponential_coefficients?: { intercept: number; year: number; km: number };
  isManual?: boolean;
  parentModel?: string;
}

interface ZeroKmData {
  model: string;
  prices: number[];
}

const ARS_TO_USD = 1495;

const FILE_MAPPINGS = [
  // Existing mappings
  { file: 'scraped_data_kicks_0km.json', brand_model: 'NISSAN KICKS' },
  { file: 'scraped_data_taos_0km.json', brand_model: 'VOLKSWAGEN TAOS' },
  { file: 'scraped_data_tcross_0km.json', brand_model: 'VOLKSWAGEN T-CROSS' },
  { file: 'scraped_data_corollacross_0km.json', brand_model: 'TOYOTA COROLLA CROSS' },
  { file: 'scraped_data_nivus_0km.json', brand_model: 'VOLKSWAGEN NIVUS' },
  { file: 'scraped_data_tucson_0km.json', brand_model: 'HYUNDAI TUCSON' },
  { file: 'scraped_data_kardian_0km.json', brand_model: 'RENAULT KARDIAN' },
  // New mappings for missing models
  { file: 'scraped_data_compass_0km.json', brand_model: 'JEEP COMPASS' },
  { file: 'scraped_data_renegade_0km.json', brand_model: 'JEEP RENEGADE' },
  { file: 'scraped_data_hrv_0km.json', brand_model: 'HONDA HR-V' },
  { file: 'scraped_data_territory_0km.json', brand_model: 'FORD TERRITORY' },
  { file: 'scraped_data_sw4_0km.json', brand_model: 'TOYOTA SW4' },
  { file: 'scraped_data_tiguanallspace_0km.json', brand_model: 'VOLKSWAGEN TIGUAN ALLSPACE' },
  { file: 'scraped_data_tiguan_0km.json', brand_model: 'VOLKSWAGEN TIGUAN' },
  { file: 'scraped_data_peugeot2008_0km.json', brand_model: 'PEUGEOT 2008' },
  { file: 'scraped_data_crv_0km.json', brand_model: 'HONDA CR-V' },
  { file: 'scraped_data_sorento_0km.json', brand_model: 'KIA SORENTO' },
  { file: 'scraped_data_tracker_0km.json', brand_model: 'CHEVROLET TRACKER' },
  { file: 'scraped_data_duster_0km.json', brand_model: 'RENAULT DUSTER' },
  { file: 'scraped_data_peugeot5008_0km.json', brand_model: 'PEUGEOT 5008' }
];

// Helper to match raw items to report model names
function getRefinedModelName(item: any): string {
  const brandModel = item.brand_model;
  const rules = EMERGENT_RULES[brandModel];

  if (rules) {
    const title = (item.title || item.version || '').toUpperCase();
    for (const rule of rules) {
      if (rule.match(title)) {
        return `${brandModel} ${rule.versionName}`;
      }
    }
    // If has rules but no match, usually falls to "Other" in science script
    // Let's assume generic for simplicity or append (Other) if we see it in report
    return `${brandModel} (Other)`;
  }

  return brandModel;
}

async function getScatterData(lowR2Models: string[]): Promise<Record<string, ScatterPoint[]>> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'market_data.json');
    const rawData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

    const result: Record<string, ScatterPoint[]> = {};
    const targetSet = new Set(lowR2Models);

    rawData.forEach((item: any) => {
      const refinedName = getRefinedModelName(item);
      const parentName = item.brand_model;

      const point = {
        year: item.year,
        km: item.km,
        price: item.price_usd
      };

      // 1. Add to specific Variant if it's a low R2 model
      if (targetSet.has(refinedName)) {
        if (!result[refinedName]) result[refinedName] = [];
        result[refinedName].push(point);
      }

      // 2. Add to Global Parent if it's a low R2 model
      // (This ensures 'Global' view works by aggregating all its sub-variants)
      if (parentName && parentName !== refinedName && targetSet.has(parentName)) {
        if (!result[parentName]) result[parentName] = [];
        result[parentName].push(point);
      }
    });

    return result;
  } catch (e) {
    console.error("Error getting scatter data", e);
    return {};
  }
}

async function getReport(): Promise<ReportItem[]> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'intelligence_report.json');
    const fileContents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch {
    return [];
  }
}

async function getZeroKmData(): Promise<ZeroKmData[]> {
  const results: ZeroKmData[] = [];

  for (const mapping of FILE_MAPPINGS) {
    try {
      const filePath = path.join(process.cwd(), mapping.file);
      const fileContents = await fs.readFile(filePath, 'utf8');
      const rawData = JSON.parse(fileContents);

      const prices = rawData.map((item: { price: number; currency: string }) => {
        if (item.currency === 'ARS') {
          return Math.round(item.price / ARS_TO_USD);
        }
        return item.price;
      });

      results.push({
        model: mapping.brand_model,
        prices
      });
    } catch {
      // File not found, skip
    }
  }

  return results;
}

export default async function Home() {
  const report = await getReport();
  const sortedReport = report.sort((a, b) => b.resilience_score - a.resilience_score);
  const zeroKmData = await getZeroKmData();

  // Identify Low R2 Models (< 0.6) and manually ingested models
  const targetModels = report.filter(r => r.r2 < 0.6 || r.isManual).map(r => r.model);
  const scatterData = await getScatterData(targetModels);

  return <Dashboard data={sortedReport} zeroKmData={zeroKmData} scatterData={scatterData} />;
}
