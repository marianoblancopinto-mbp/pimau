import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const { parentModel, newReports, newScatterData } = await request.json();

        if (!parentModel || !newReports || !newScatterData) {
            return NextResponse.json({ success: false, error: "Missing payload data" }, { status: 400 });
        }

        // 1. Update intelligence_report.json
        const reportPath = path.join(process.cwd(), 'data', 'intelligence_report.json');
        let reportData: any[] = JSON.parse(await fs.readFile(reportPath, 'utf8'));
        
        // Remove old entries related to this parentModel to prevent duplicates
        reportData = reportData.filter(item => 
            !(item.model === parentModel || item.model.startsWith(parentModel + ' '))
        );
        
        // Keep isManual flag so the frontend knows this is a high-quality manual dataset and always loads its scatter points.
        const cleanReports = newReports.map((r: any) => {
            return { ...r, isManual: r.isManual ?? false };
        });

        // Add new reports
        reportData.push(...cleanReports);
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

        // 2. Update market_data.json
        const marketPath = path.join(process.cwd(), 'data', 'market_data.json');
        let marketData: any[] = JSON.parse(await fs.readFile(marketPath, 'utf8'));
        
        // Remove old raw entries related to this parentModel
        marketData = marketData.filter(item => 
            !(item.brand_model === parentModel || item.brand_model.startsWith(parentModel + ' '))
        );

        // Map the new scatter data back to the flat market_data structure
        const newMarketEntries: any[] = [];
        Object.entries(newScatterData).forEach(([modelName, points]: [string, any]) => {
            points.forEach((p: any) => {
                newMarketEntries.push({
                    brand_model: modelName, 
                    year: p.year,
                    km: p.km,
                    price_usd: p.price
                });
            });
        });

        marketData.push(...newMarketEntries);
        await fs.writeFile(marketPath, JSON.stringify(marketData, null, 2));

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Failed to save dataset:", e);
        return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
    }
}
