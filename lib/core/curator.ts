export class DataCurator {
    private readonly EXCLUDED_TYPES = ['Sedán', 'Hatchback', 'Pick-Up', 'Coupé', 'Convertible'];
    private readonly NAME_MAPPINGS: Record<string, string> = {
        'TOYOTA FORTUNER': 'TOYOTA SW4',
        'HYUNDAI H1': 'HYUNDAI H-1',
        'KIA CARNIVAL': 'KIA CARNIVAL'
    };

    normalizeName(brand: string, model: string): string {
        const fullName = `${brand} ${model}`.toUpperCase();
        return this.NAME_MAPPINGS[fullName] || fullName;
    }

    isValidVehicle(vehicle: any): boolean {
        // 1. Exclude unwanted body types
        if (this.EXCLUDED_TYPES.includes(vehicle.body_type)) return false;

        // 2. Keyword Filter (Safety net)
        const titleUpper = vehicle.title.toUpperCase();
        if (titleUpper.includes('SEDAN') || titleUpper.includes('HATCHBACK') || titleUpper.includes('CABINA SIMPLE')) {
            return false;
        }

        // Special check for Pickups vs SUVs
        // "Cabina Doble" usually implies Pickup, but we want SW4 (SUV).
        if (titleUpper.includes('CABINA DOBLE') && !titleUpper.includes('SW4')) {
            return false;
        }

        // 3. Price Noise Filter (Wrecked/Scam)
        // If price is too low (< $6000 USD), ignore it.
        // Also if price is insanely high (> $150k for normal cars), maybe ignore? keeping it for now.
        if (vehicle.price_usd < 6000) return false;

        return true;
    }

    curate(rawData: any[]) {
        return rawData
            .filter(item => this.isValidVehicle(item))
            .map(item => ({
                ...item,
                brand_model: (item.brand && item.model)
                    ? this.normalizeName(item.brand, item.model)
                    : (item.brand_model || 'UNKNOWN'),
                scraped_at: new Date().toISOString()
            }));
    }
}
