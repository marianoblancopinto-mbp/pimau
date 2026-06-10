
export interface VersionRule {
    versionName: string; // The clean name to assign (e.g. "SEG HYBRID")
    match: (title: string) => boolean; // Logic to match it
}

export const EMERGENT_RULES: Record<string, VersionRule[]> = {
    'TOYOTA COROLLA CROSS': [
        {
            versionName: 'SEG HYBRID',
            match: (t) => t.includes('SEG') && (t.includes('HYBRID') || t.includes('HEV') || t.includes('1.8') || t.includes('HV'))
        },
        {
            versionName: 'SEG',
            match: (t) => t.includes('SEG') && !t.includes('HYBRID') && !t.includes('HEV') && !t.includes('1.8') && !t.includes('HV')
        },
        {
            versionName: 'XEI HYBRID',
            match: (t) => t.includes('XEI') && (t.includes('HYBRID') || t.includes('HEV') || t.includes('1.8') || t.includes('HV'))
        },
        {
            versionName: 'XEI',
            match: (t) => t.includes('XEI') && !t.includes('HYBRID') && !t.includes('HEV') && !t.includes('1.8') && !t.includes('HV')
        },
        {
            versionName: 'GR-SPORT',
            match: (t) => t.includes('GR-SPORT') || t.includes('GR SPORT')
        },
        {
            versionName: 'XLI',
            match: (t) => t.includes('XLI')
        }
    ],
    'PEUGEOT 5008': [
        { versionName: 'GT', match: (t) => t.includes('GT') || t.includes('GT-LINE') },
        { versionName: 'ALLURE PLUS', match: (t) => t.includes('ALLURE PLUS') },
        { versionName: 'ALLURE', match: (t) => t.includes('ALLURE') },
        { versionName: 'FELINE', match: (t) => t.includes('FELINE') }
    ],
    'VOLKSWAGEN TAOS': [
        {
            versionName: 'HIGHLINE',
            match: (t) => t.includes('HIGHLINE') || t.includes('HERO') // Hero is a launch edition based on Highline
        },
        {
            versionName: 'COMFORTLINE',
            match: (t) => t.includes('COMFORTLINE')
        }
    ],
    'NISSAN KICKS': [
        { versionName: 'EXCLUSIVE', match: (t) => t.includes('EXCLUSIVE') },
        { versionName: 'ADVANCE', match: (t) => t.includes('ADVANCE') },
        { versionName: 'SENSE', match: (t) => t.includes('SENSE') }
    ],
    'VOLKSWAGEN TIGUAN': [
        // Handling both Normal Tiguan and Allspace under same logic
        { versionName: 'HIGHLINE', match: (t) => t.includes('HIGHLINE') },
        { versionName: 'COMFORTLINE', match: (t) => t.includes('COMFORTLINE') },
        { versionName: 'TRENDLINE', match: (t) => t.includes('TRENDLINE') },
        { versionName: 'SPORT', match: (t) => t.includes('SPORT') },
        { versionName: 'ELEGANCE', match: (t) => t.includes('ELEGANCE') }
    ]
};
