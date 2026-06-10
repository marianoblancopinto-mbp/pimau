'use client';
import { useState, useMemo, useEffect } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceLine, Cell, ScatterChart, Scatter, ZAxis, Legend } from 'recharts';
import { Activity, Clock, TrendingUp, BarChart3, ChevronRight, AlertTriangle, ClipboardList, Save } from 'lucide-react';
import { PriceModeler, CarData } from '../lib/core/modeler';
import { parseMeliText, ParsedCar } from '../lib/parser/parseMeli';
import { parseKavakText } from '../lib/parser/parseKavak';

// Utility for class names
function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
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

interface ScatterPoint {
    year: number;
    km: number;
    price: number;
    loaded_date?: string; // ISO date string (YYYY-MM-DD) for tracking data freshness
}

interface DashboardProps {
    data: ReportItem[];
    zeroKmData: ZeroKmData[];
    scatterData?: Record<string, ScatterPoint[]>;
}

export function Dashboard({ data, zeroKmData, scatterData }: DashboardProps) {
    const currentYear = new Date().getFullYear();

    const [localData, setLocalData] = useState<ReportItem[]>(data);
    const [localScatterData, setLocalScatterData] = useState<Record<string, ScatterPoint[]>>(scatterData || {});

    // Scraper Modal State
    const [isScraperOpen, setIsScraperOpen] = useState(false);
    const [scraperMode, setScraperMode] = useState<'NEW_MODEL' | 'APPEND'>('NEW_MODEL');
    const [rawText, setRawText] = useState('');
    const [ingestModel, setIngestModel] = useState('');
    const [ingestSource, setIngestSource] = useState<'MELI' | 'KAVAK'>('MELI');
    const [isProcessing, setIsProcessing] = useState(false);
    const handleProcessData = () => {
        if (!rawText.trim() || !ingestModel.trim()) return;
        setIsProcessing(true);
        try {
            let parsedCars: ParsedCar[] = [];
            if (ingestSource === 'MELI') {
                parsedCars = parseMeliText(rawText, ingestModel.trim().toUpperCase());
            } else if (ingestSource === 'KAVAK') {
                parsedCars = parseKavakText(rawText, ingestModel.trim().toUpperCase());
            }
            if (parsedCars.length === 0) {
                alert('No se detectaron vehículos. Revisa el texto y asegúrate de haber copiado precios y años.');
                setIsProcessing(false);
                return;
            }

            // VERSION REMAPPING SAFEGUARD:
            // Compare detected versions against versions already loaded in the page.
            // If a detected version matches an existing one (by word overlap), remap it.
            // Only create a new version category if truly unmatched.
            const safeParentName = ingestModel.trim().toUpperCase();
            const existingVersionNames = localData
                .filter(d => d.parentModel === safeParentName || d.model === safeParentName || d.model.startsWith(safeParentName + ' '))
                .map(d => d.model);

            if (existingVersionNames.length > 0) {
                parsedCars = parsedCars.map(car => {
                    // If the car's model already exactly matches a loaded version, keep it
                    if (existingVersionNames.includes(car.model)) return car;

                    // Otherwise, try to find the closest existing version by word overlap
                    const carWords = car.model.toUpperCase().split(/\s+/).filter(w => w.length > 2);
                    let bestMatch = '';
                    let bestScore = 0;

                    for (const existing of existingVersionNames) {
                        const existingWords = existing.toUpperCase().split(/\s+/).filter(w => w.length > 2);
                        const overlap = existingWords.filter(ew =>
                            carWords.some(cw => cw.includes(ew) || ew.includes(cw))
                        ).length;
                        if (overlap > bestScore) {
                            bestScore = overlap;
                            bestMatch = existing;
                        }
                    }

                    // Remap if we found a reasonable match (at least 2 words overlap, or >50% of existing words)
                    if (bestMatch && bestScore >= 2) {
                        return { ...car, model: bestMatch };
                    }

                    // No good match found — this is a genuinely new version, keep it as-is
                    return car;
                });
            }

            const groupedParsedCars = parsedCars.reduce((acc, car) => {
                if (!acc[car.model]) acc[car.model] = [];
                acc[car.model].push(car);
                return acc;
            }, {} as Record<string, ParsedCar[]>);

            let newReportItems: ReportItem[] = [];
            let newScatterMap: Record<string, ScatterPoint[]> = {};
            const modeler = new PriceModeler();

            let totalInjected = 0;
            let variantsDetected = 0;

            Object.entries(groupedParsedCars).forEach(([modelName, cars]) => {

                // Convert new cars to CarData
                const newCarData: CarData[] = cars.map(c => ({
                    brand_model: c.model,
                    year: c.year,
                    km: c.km,
                    price_usd: c.price,
                    loaded_date: new Date().toISOString().split('T')[0]
                } as any));

                // Retrieve existing cars from state to merge them
                const existingPoints = localScatterData[modelName] || [];
                const oldCarData: CarData[] = existingPoints.map(sp => ({
                    brand_model: modelName,
                    year: sp.year,
                    km: sp.km,
                    price_usd: sp.price,
                    loaded_date: sp.loaded_date || '2026-03-22'
                } as any));

                // AGGRESSIVE DEDUPLICATION: No false negatives (if it looks like a duplicate, drop it)
                const filteredNewCarData = newCarData.filter(newCar => {
                    const isDuplicate = oldCarData.some(oldCar =>
                        oldCar.year === newCar.year &&
                        Math.abs(oldCar.price_usd - newCar.price_usd) < 5 && // Price within $5
                        (Math.abs(oldCar.km - newCar.km) < 10) // Km within 10km (covers slight variations)
                    );
                    return !isDuplicate;
                });

                const combinedCarData = [...oldCarData, ...filteredNewCarData];

                if (combinedCarData.length < 5) return; // Ignore noise clusters

                // We effectively appended new data! Calculate stats on the combined cluster.
                variantsDetected++;
                totalInjected += cars.length; // Only count the newly injected ones for the alert

                const linearModel = modeler.trainModel(combinedCarData);
                const expModel = modeler.trainExponentialModel(combinedCarData);
                const finalModel = modeler.trainEnsembleModel(combinedCarData, linearModel, expModel);

                const prices = combinedCarData.map(c => c.price_usd);
                const years = combinedCarData.map(c => c.year);
                const kms = combinedCarData.map(c => c.km);

                const newItem: ReportItem = {
                    model: modelName,
                    count: combinedCarData.length,
                    depreciation_per_year: finalModel.depreciation.per_year_usd,
                    depreciation_per_10k_km: finalModel.depreciation.per_10k_km_usd,
                    coefficients: finalModel.coefficients,
                    buckets: [],
                    resilience_score: finalModel.r2 * 100,
                    stability_label: finalModel.r2 > 0.8 ? 'Platinum' : finalModel.r2 > 0.6 ? 'Gold' : cars.length < 3 ? 'Unrated' : 'Silver',
                    r2: finalModel.r2,
                    yearRange: { min: Math.min(...years) || currentYear - 10, max: Math.max(...years) || currentYear },
                    kmRange: { min: Math.min(...kms) || 0, max: Math.max(...kms) || 100000 },
                    modelType: finalModel.modelType,
                    weights: finalModel.weights,
                    exponential_coefficients: expModel.coefficients,
                    isManual: true
                };

                newReportItems.push(newItem);

                const validCarData = modeler.filterOutliers(combinedCarData);

                newScatterMap[modelName] = validCarData.map(c => ({
                    year: c.year,
                    km: c.km,
                    price: c.price_usd,
                    loaded_date: (c as any).loaded_date || new Date().toISOString().split('T')[0]
                }));
            });

            // Make sure the ingestModel name is completely clean
            const safeModelName = ingestModel.trim().toUpperCase();

            let newData = [...localData];
            newReportItems.forEach(newItem => {
                newItem.parentModel = safeModelName; // Inject parent model for grouping

                const existingIndex = newData.findIndex(d => d.model === newItem.model);
                if (existingIndex >= 0) {
                    newData[existingIndex] = newItem;
                } else {
                    newData.push(newItem);
                }
            });
            setLocalData(newData);

            setLocalScatterData(prev => ({
                ...prev,
                ...newScatterMap
            }));

            // Jump to the newly ingested parent group and default to global view
            setSelectedOption(safeModelName);
            setSelectedVariant('__GLOBAL__');

            setIsScraperOpen(false);
            setRawText('');

            if (totalInjected === 0) {
                alert(`¡Atención! Todas las versiones aisladas tenían menos de 5 vehículos y fueron descartadas por ruido.`);
            } else {
                alert(`¡Éxito! Se detectaron ${variantsDetected} versiones firmes. Inyectamos ${totalInjected} vehículos al modelo.`);
            }
        } catch (e) {
            console.error(e);
            alert('Error procesando datos. Revisa la consola para más detalles.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Hybrid grouping mapping
    const dropdownOptions = useMemo(() => {
        const options = new Set<string>();
        localData.forEach(item => {
            if (item.parentModel) {
                options.add(item.parentModel);
            } else {
                // If native JSON forgot parent, deduce it by matching with the known ZeroKm base taxonomy
                const baseModel = zeroKmData.find(z => item.model.startsWith(z.model));
                options.add(baseModel ? baseModel.model : item.model);
            }
        });
        return Array.from(options).sort((a, b) => {
            const aIsManual = localData.some(d => d.isManual && (d.parentModel === a || d.model === a));
            const bIsManual = localData.some(d => d.isManual && (d.parentModel === b || d.model === b));
            // Manual datasets always at the top of the list
            if (aIsManual && !bIsManual) return -1;
            if (!aIsManual && bIsManual) return 1;
            return a.localeCompare(b);
        });
    }, [localData, zeroKmData]);

    const [selectedOption, setSelectedOption] = useState(dropdownOptions[0] || '');
    const [selectedVariant, setSelectedVariant] = useState('__GLOBAL__');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Sync state robustly if local data changes
    useEffect(() => {
        if (!dropdownOptions.includes(selectedOption) && dropdownOptions.length > 0) {
            setSelectedOption(dropdownOptions[0]);
        }
    }, [dropdownOptions, selectedOption]);

    const activeVariants = useMemo(() => {
        return localData.filter(item => {
            if (item.parentModel) {
                return item.parentModel === selectedOption;
            } else {
                const baseModel = zeroKmData.find(z => item.model.startsWith(z.model))?.model || item.model;
                return baseModel === selectedOption;
            }
        });
    }, [localData, selectedOption, zeroKmData]);

    const isGlobalView = selectedVariant === '__GLOBAL__';

    const [calcYear, setCalcYear] = useState(2022);
    const [calcKm, setCalcKm] = useState(50000);
    const [chartFixedYear, setChartFixedYear] = useState(currentYear - 3);
    const [chartFixedKm, setChartFixedKm] = useState(50000);

    // --- GLOBAL CONSOLIDATION LOGIC ---
    const globalReportItem = useMemo((): ReportItem | null => {
        if (!isGlobalView || activeVariants.length <= 1) return null;
        const totalCount = activeVariants.reduce((sum, v) => sum + v.count, 0);
        if (totalCount === 0) return activeVariants[0];

        const weightedAvg = (getKey: (v: ReportItem) => number) => {
            return activeVariants.reduce((sum, v) => sum + (getKey(v) * v.count), 0) / totalCount;
        };

        return {
            model: selectedOption, // Display name
            count: totalCount,
            r2: weightedAvg(v => v.r2),
            depreciation_per_year: weightedAvg(v => v.depreciation_per_year),
            depreciation_per_10k_km: weightedAvg(v => v.depreciation_per_10k_km),
            coefficients: {
                intercept: weightedAvg(v => v.coefficients.intercept),
                year: weightedAvg(v => v.coefficients.year),
                km: weightedAvg(v => v.coefficients.km)
            },
            resilience_score: weightedAvg(v => v.resilience_score),
            stability_label: [...activeVariants].sort((a, b) => b.count - a.count)[0].stability_label,
            yearRange: {
                min: Math.min(...activeVariants.map(v => v.yearRange.min)),
                max: Math.max(...activeVariants.map(v => v.yearRange.max))
            },
            kmRange: {
                min: Math.min(...activeVariants.map(v => v.kmRange.min)),
                max: Math.max(...activeVariants.map(v => v.kmRange.max))
            },
            buckets: [],
            modelType: 'LINEAR',
            weights: undefined,
            exponential_coefficients: undefined,
            isManual: true,
            parentModel: selectedOption
        } as ReportItem;
    }, [isGlobalView, activeVariants, selectedOption]);

    // SELECT THE RIGHT DATA
    const selected = isGlobalView
        ? globalReportItem || activeVariants[0] || localData[0]
        : activeVariants.find(d => d.model === selectedVariant) || activeVariants[0] || localData[0];

    // Get 0km data
    const selectedZeroKm = useMemo(() => {
        if (isGlobalView && activeVariants.length > 1) {
            const allPrices: number[] = [];
            activeVariants.forEach(v => {
                const zkm = zeroKmData.find(z => z.model === v.model);
                if (zkm) allPrices.push(...zkm.prices);
            });
            return { model: selectedOption, prices: allPrices };
        }
        return zeroKmData.find(z => z.model === selected.model);
    }, [isGlobalView, activeVariants, selectedOption, zeroKmData, selected.model]);

    // Calculate mean
    const calculateMean = (prices: number[]) => {
        if (prices.length === 0) return 0;
        return prices.reduce((sum, p) => sum + p, 0) / prices.length;
    };

    // Calculate sample standard deviation
    const calculateStdDev = (prices: number[]) => {
        if (prices.length <= 1) return 0;
        const mean = calculateMean(prices);
        const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
        const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (prices.length - 1);
        return Math.sqrt(variance);
    };

    // Generate histogram data with fixed range 0-70k USD
    const generateHistogramData = (prices: number[]) => {
        if (prices.length === 0) return [];

        const fixedMin = 0;
        const fixedMax = 70000;
        const binSize = 2500; // Increased bin size for cleaner presentation
        const binCount = Math.ceil((fixedMax - fixedMin) / binSize);

        const bins = Array(binCount).fill(0).map((_, i) => ({
            range: `$${Math.round((fixedMin + i * binSize) / 1000)}k`,
            rangeStart: fixedMin + i * binSize,
            rangeEnd: fixedMin + (i + 1) * binSize,
            count: 0
        }));

        const total = prices.length;
        prices.forEach(price => {
            const binIndex = Math.min(Math.floor((price - fixedMin) / binSize), binCount - 1);
            if (binIndex >= 0 && binIndex < binCount) {
                bins[binIndex].count++;
            }
        });

        // Filter out empty tail bins for better scaling
        let lastNonZero = bins.length - 1;
        while (lastNonZero > 0 && bins[lastNonZero].count === 0) lastNonZero--;

        return bins.slice(0, lastNonZero + 1).map(b => ({
            ...b,
            percentage: total > 0 ? (b.count / total) * 100 : 0
        }));
    };

    const zeroKmPrices = selectedZeroKm?.prices || [];
    const zeroKmMean = calculateMean(zeroKmPrices);
    const zeroKmStdDev = calculateStdDev(zeroKmPrices);
    const histogramData = generateHistogramData(zeroKmPrices);

    if (!selected) return <div className="text-zinc-500 text-center py-20">Sin datos disponibles</div>;

    const { intercept, year: slopeYear, km: slopeKm } = selected.coefficients;

    const calculateFairPrice = (y: number, k: number) => {
        const age = currentYear - y;

        // Linear Calculation
        const valLinear = Math.max(0, intercept + (slopeYear * age) + (slopeKm * k));

        // Exponential Calculation (if coeffs available, otherwise fallback to linear)
        let valExponential = 0;
        if (selected.exponential_coefficients) {
            const { intercept: i2, year: y2, km: k2 } = selected.exponential_coefficients;
            valExponential = Math.max(0, Math.exp(i2 + (y2 * age) + (k2 * k)));
        } else {
            valExponential = valLinear; // Fallback
        }

        // Ensemble Weighting
        if (selected.weights) {
            return Math.round(selected.weights.linear * valLinear + selected.weights.exponential * valExponential);
        } else if (selected.modelType === 'EXPONENTIAL') {
            return Math.round(valExponential);
        } else {
            return Math.round(valLinear);
        }
    };

    const predictedPrice = calculateFairPrice(calcYear, calcKm);

    // Generate km range - always extend to 350k for projection visibility
    const kmMin = 0;
    const kmMax = 350000;
    const kmStep = 25000;
    const dataKmMax = selected.kmRange?.max || 150000;
    const kmPoints: number[] = [];
    for (let k = kmMin; k <= kmMax; k += kmStep) kmPoints.push(k);

    const usageChartData = kmPoints.map(k => ({
        km: `${k / 1000}k`,
        kmValue: k,
        precio: calculateFairPrice(chartFixedYear, k),
        isExtrapolation: k > dataKmMax
    }));

    // Generate year range based on actual data
    // Only extend to current year if we have data from 2024+ (still manufactured)
    const yearMin = selected.yearRange?.min || 2010;
    const dataMaxYear = selected.yearRange?.max || currentYear;
    const yearMax = dataMaxYear >= currentYear - 1 ? currentYear : Math.min(dataMaxYear + 1, currentYear - 1);
    const yearsRange = [];
    for (let y = yearMax; y >= yearMin; y--) yearsRange.push(y);
    const timeChartData = yearsRange.map(year => ({
        año: year,
        precio: calculateFairPrice(year, chartFixedKm)
    }));

    const getBadgeStyle = (label: string) => {
        if (!label) return 'border-muted text-muted';
        if (label.includes('Gold') || label.includes('Benchmark'))
            return 'border-secondary/40 text-secondary bg-secondary/5';
        if (label.includes('Silver'))
            return 'border-muted/40 text-muted';
        if (label.includes('Platinum'))
            return 'border-primary text-primary bg-primary/5';
        return 'border-red-500/40 text-red-500';
    };

    const showLowConfidence = selected.r2 < 0.6;

    // For scatter plot, logic handles global aggregation or individual
    const modelScatterData = useMemo(() => {
        if (isGlobalView && activeVariants.length > 1) {
            const combined: ScatterPoint[] = [];
            activeVariants.forEach(v => {
                if (localScatterData?.[v.model]) combined.push(...localScatterData[v.model]);
            });
            return combined;
        }
        return localScatterData?.[selected.model] || [];
    }, [isGlobalView, activeVariants, selected.model, localScatterData]);


    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 flex flex-col">
            {/* Simple Header - Compact */}
            <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md text-foreground border-b border-border h-16 flex-none">
                <div className="h-full px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-primary/10 p-1.5 border border-primary/20">
                            <span className="font-black text-lg tracking-tighter text-primary">PIMAU</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight uppercase leading-none">
                                PIMAU
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Dataset:</span>
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="bg-background text-foreground text-sm font-black focus:outline-none cursor-pointer min-w-[200px] text-right border border-border px-2 py-1 rounded-sm flex items-center justify-end gap-2"
                                >
                                    {selectedOption}
                                    {localData.some(d => d.isManual && (d.parentModel === selectedOption || d.model === selectedOption)) && (
                                        <ClipboardList size={14} className="text-blue-600" />
                                    )}
                                    <ChevronRight size={14} className={cn("transition-transform opacity-50", isDropdownOpen ? "rotate-90" : "")} />
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute top-full right-0 mt-1 w-full min-w-[200px] max-h-64 overflow-y-auto bg-white border border-border shadow-xl z-50 flex flex-col">
                                        {dropdownOptions.map(opt => {
                                            const isManualGroup = localData.some(d => d.isManual && (d.parentModel === opt || d.model === opt));
                                            return (
                                                <button
                                                    key={opt}
                                                    onClick={() => {
                                                        setSelectedOption(opt);
                                                        setSelectedVariant('__GLOBAL__');
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "px-3 py-2 text-sm font-black text-right flex items-center justify-end gap-2 hover:bg-zinc-100 transition-colors border-b border-zinc-100 last:border-0",
                                                        isManualGroup ? "text-blue-600 bg-blue-50/50" : "text-black"
                                                    )}
                                                >
                                                    {opt}
                                                    {isManualGroup && <ClipboardList size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setScraperMode('NEW_MODEL');
                                setIngestModel('');
                                setIsScraperOpen(true);
                            }}
                            className="bg-primary hover:bg-white hover:text-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-transparent hover:border-primary transition-all flex items-center gap-2"
                        >
                            <ClipboardList size={14} /> Cargar Más Modelos
                        </button>
                    </div>
                </div>
            </header>

            {/* Manual Scraper Modal */}
            {isScraperOpen && (
                <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white text-black p-8 max-w-2xl w-full flex flex-col shadow-2xl border-4 border-black">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-3xl font-black uppercase tracking-tight">
                                {scraperMode === 'APPEND' ? 'Cargar Más Publicaciones' : 'Simulador In-Situ'}
                            </h2>
                            <button onClick={() => setIsScraperOpen(false)} className="text-muted hover:text-black font-black uppercase text-xs">Cerrar ✕</button>
                        </div>
                        <p className="text-sm text-zinc-600 mb-6 font-medium">
                            Selecioná y copiá (Ctrl+A, Ctrl+C) el listado de vehículos directo desde Mercado Libre o Kavak y pégalo (Ctrl+V) abajo.
                            Tu navegador extraerá los precios, reentrenará la inteligencia matemática in-situ y te mostrará los nuevos resultados.
                            AL CERRAR LA PÁGINA ESTOS DATOS DESAPARECERÁN
                        </p>

                        <label className="text-xs font-black uppercase tracking-widest mb-2 block">Fuente de Datos</label>
                        <select
                            value={ingestSource}
                            onChange={e => setIngestSource(e.target.value as 'MELI' | 'KAVAK')}
                            className="border-2 border-black p-3 mb-4 font-black uppercase w-full bg-zinc-100 focus:bg-white focus:outline-none cursor-pointer"
                        >
                            <option value="MELI">MERCADO LIBRE</option>
                            <option value="KAVAK">KAVAK</option>
                        </select>

                        <label className="text-xs font-black uppercase tracking-widest mb-2 block">Nombre del Modelo / Dataset</label>
                        {scraperMode === 'APPEND' ? (
                            <div className="border-2 border-black p-3 mb-6 font-black uppercase w-full bg-zinc-200 text-zinc-500 cursor-not-allowed">
                                {ingestModel}
                            </div>
                        ) : (
                            <input
                                type="text"
                                placeholder="Ej: RENAULT DUSTER"
                                value={ingestModel}
                                onChange={e => setIngestModel(e.target.value)}
                                className="border-2 border-black p-3 mb-6 font-black uppercase w-full bg-zinc-100 focus:bg-white focus:outline-none"
                            />
                        )}

                        <label className="text-xs font-black uppercase tracking-widest mb-2 block">Texto Crudo (Raw Clipboard)</label>
                        <textarea
                            className="border-2 border-black p-4 w-full h-48 font-mono text-xs bg-zinc-100 focus:bg-white focus:outline-none mb-6 resize-none"
                            placeholder="Pega el texto crudo aquí..."
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        />

                        <div className="flex justify-end mt-auto">
                            <button
                                onClick={handleProcessData}
                                disabled={isProcessing || !rawText || !ingestModel}
                                className="bg-primary text-white px-8 py-3 font-black uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? 'Procesando...' : 'Procesar Datos'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content - 2x2 Grid */}
            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2">

                {/* QUADRANT I: IDENTITY & VALUATOR (Top-Left) */}
                <div className="p-8 lg:p-12 border-b lg:border-r border-border relative flex flex-col">

                    {/* Top: Identity + Buttons */}
                    <div className="mb-8">
                        <div className="flex justify-between items-start mb-6">
                            <h2 className="text-5xl lg:text-6xl font-black text-primary leading-[0.8] tracking-[-0.04em] uppercase">
                                {selectedOption}
                            </h2>

                            <div className="flex flex-col items-end gap-3 ml-4 flex-shrink-0">
                                <div className={cn("badge-industrial", getBadgeStyle(selected.stability_label))}>
                                    {selected.stability_label}
                                </div>
                                <div className="flex flex-col gap-2 items-stretch">
                                    <button
                                        onClick={() => {
                                            setScraperMode('APPEND');
                                            setIngestModel(selectedOption);
                                            setIsScraperOpen(true);
                                        }}
                                        className="text-[10px] uppercase font-black tracking-widest bg-[#75aadb] text-white border-2 border-transparent px-4 py-2 hover:bg-white hover:text-[#75aadb] hover:border-[#75aadb] transition-all flex items-center gap-2 whitespace-nowrap"
                                    >
                                        <ClipboardList size={14} /> Cargar Más Publicaciones
                                    </button>
                                </div>
                            </div>
                        </div>

                        {activeVariants.length > 1 ? (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedVariant('__GLOBAL__')}
                                    className={cn(
                                        "px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all border",
                                        isGlobalView
                                            ? "bg-primary text-white border-primary"
                                            : "bg-transparent text-muted hover:text-foreground border-border"
                                    )}
                                >
                                    Vista Global
                                </button>
                                {activeVariants.map((variant) => {
                                    const isActive = !isGlobalView && variant.model === selectedVariant;
                                    const rawShortName = variant.model.replace(selectedOption, '').trim();
                                    const shortName = rawShortName || variant.model;

                                    return (
                                        <button
                                            key={variant.model}
                                            onClick={() => setSelectedVariant(variant.model)}
                                            className={cn(
                                                "px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-1",
                                                isActive
                                                    ? "bg-primary text-white border-primary"
                                                    : variant.isManual
                                                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-300"
                                                        : "bg-transparent text-muted hover:text-foreground border-border"
                                            )}
                                        >
                                            {shortName} {variant.isManual && <ClipboardList size={10} />}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mb-4"></div>
                        )}
                    </div>

                    {/* Compact Metrics Grid */}
                    <div className="grid grid-cols-4 gap-4 pb-8 border-b border-border/50">
                        <div>
                            <div className="text-muted text-[10px] font-black uppercase tracking-widest mb-0.5">Confianza (R²)</div>
                            <div className="text-2xl font-black text-foreground">
                                {(selected.r2 * 100).toFixed(0)}<span className="text-sm text-muted opacity-50">%</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-muted text-[10px] font-black uppercase tracking-widest mb-0.5">Ensemble Weights</div>
                            <div className="text-xs font-black text-foreground flex flex-col justify-center h-8">
                                {selected.weights ? (
                                    <>
                                        <span>Lin: {(selected.weights.linear).toFixed(2)}</span>
                                        <span>Exp: {(selected.weights.exponential).toFixed(2)}</span>
                                    </>
                                ) : (
                                    <span className="text-muted/50">N/A</span>
                                )}
                            </div>
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-muted text-[9px] font-black uppercase tracking-widest mb-0.5 whitespace-nowrap">Depreciación Temporal</div>
                                <div className="text-xl font-black text-foreground whitespace-nowrap">
                                    -${Math.abs(Math.round(selected.depreciation_per_year)).toLocaleString()}<span className="text-[10px] text-muted ml-1">USD/año</span>
                                </div>
                            </div>
                            <div>
                                <div className="text-muted text-[9px] font-black uppercase tracking-widest mb-0.5 whitespace-nowrap">Desgaste Operativo</div>
                                <div className="text-xl font-black text-foreground whitespace-nowrap">
                                    -${Math.abs(Math.round(selected.depreciation_per_10k_km)).toLocaleString()}<span className="text-[10px] text-muted ml-1">USD/10k KM</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom: Calculator/Valuator */}
                    <div className="flex-1 flex flex-col justify-center">
                        <div className="text-[10px] text-muted/40 font-black uppercase tracking-widest mb-4">Calculadora</div>

                        <div className="flex gap-6 items-end">
                            <div className="flex-1 grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Año</label>
                                    <input
                                        type="number"
                                        value={calcYear}
                                        onChange={(e) => setCalcYear(Number(e.target.value))}
                                        className="w-full bg-secondary/10 border-b-2 border-primary/20 px-0 py-2 text-foreground text-2xl font-black focus:border-primary transition-all outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Kilometraje</label>
                                    <input
                                        type="number"
                                        value={calcKm}
                                        onChange={(e) => setCalcKm(Number(e.target.value))}
                                        className="w-full bg-secondary/10 border-b-2 border-primary/20 px-0 py-2 text-foreground text-2xl font-black focus:border-primary transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 text-right">
                                <div className="text-[9px] text-muted font-black uppercase tracking-widest mb-1">Valor Estimado</div>
                                <div className="text-5xl font-black text-primary leading-none tracking-tight">
                                    <span className="text-3xl align-top opacity-50 mr-1">$</span>
                                    {predictedPrice.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* QUADRANT II: REALITY (Top-Right) */}
                <div className="p-8 lg:p-12 border-b border-border relative">

                    <div className="h-full flex flex-col">
                        <div className="mb-6 flex justify-between items-end">
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">
                                {showLowConfidence ? 'Dispersión de Mercado' : 'Devaluación Temporal'}
                            </h3>
                            {!showLowConfidence && (
                                <div className="text-right">
                                    <div className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Odómetro Fijo</div>
                                    <input
                                        type="number"
                                        value={chartFixedKm}
                                        onChange={(e) => setChartFixedKm(Number(e.target.value))}
                                        className="bg-secondary text-foreground font-black w-24 text-center py-1 px-2 text-sm focus:bg-primary focus:text-white outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                {showLowConfidence ? (
                                    <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                                        <XAxis type="number" dataKey="km" stroke="#71717a" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} domain={[0, 'auto']} tick={{ fontWeight: 900, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                        <YAxis type="number" dataKey="price" stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} domain={[0, 'auto']} tick={{ fontWeight: 900, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                        <ZAxis type="number" dataKey="year" range={[60, 60]} />
                                        <Tooltip
                                            cursor={{ strokeDasharray: '4 4', stroke: '#ffffff' }}
                                            contentStyle={{ backgroundColor: '#fff', border: '2px solid #111', borderRadius: '0px' }}
                                            itemStyle={{ color: '#111', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                                        />
                                        <Legend
                                            iconType="circle"
                                            verticalAlign="bottom"
                                            height={36}
                                            wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingTop: '10px' }}
                                        />
                                        {Object.entries((modelScatterData || []).reduce((acc, item) => {
                                            if (!acc[item.year]) acc[item.year] = [];
                                            acc[item.year].push(item);
                                            return acc;
                                        }, {} as Record<number, any[]>))
                                            .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
                                            .map(([year, items]) => {
                                                const y = Number(year);
                                                const colors = ['#75aadb', '#fcbf45', '#111', '#71717a', '#e4e4e7'];
                                                const color = colors[y % colors.length];

                                                return (
                                                    <Scatter key={year} name={`${year}`} data={items} fill={color} />
                                                );
                                            })}
                                    </ScatterChart>
                                ) : (
                                    <AreaChart data={timeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <XAxis dataKey="año" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 900, fill: '#71717a' }} />
                                        <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontWeight: 900, fill: '#71717a' }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#fff', border: '2px solid #111', borderRadius: '0px' }}
                                            itemStyle={{ color: '#111', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                                        />
                                        <Area type="monotone" dataKey="precio" stroke="#fcbf45" strokeWidth={3} fillOpacity={0.15} fill="#fcbf45" />
                                    </AreaChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* QUADRANT III: MARKET BENCHMARK (Bottom-Left) */}
                <div className="p-8 lg:p-12 border-r border-border relative bg-primary text-white">

                    <div className="h-full flex flex-col">
                        <div className="flex justify-between items-end mb-8 mt-6">
                            <div>
                                <div className="text-[10px] text-white/60 font-black uppercase tracking-widest mb-1">Precio Promedio 0km</div>
                                <div className="text-4xl font-black text-white">
                                    ${Math.round(zeroKmMean).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-white/60 font-black uppercase tracking-widest mb-1">Desviación Estándar</div>
                                <div className="text-2xl font-black text-white/80">
                                    ±${Math.round(zeroKmStdDev).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Full Q3 Histogram */}
                        <div className="flex-1 w-full min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={histogramData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                                    <XAxis
                                        dataKey="range"
                                        stroke="rgba(255,255,255,0.5)"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontWeight: 700, fill: 'rgba(255,255,255,0.7)' }}
                                        interval={1} // Skip labels if crowded
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid #fff', borderRadius: '0px', color: '#fff' }}
                                        itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}
                                        cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                                        labelStyle={{ color: '#aaa', fontWeight: 700, marginBottom: '0.25rem' }}
                                    />
                                    <Bar dataKey="count" fill="#ffffff" fillOpacity={0.9} radius={[2, 2, 0, 0]}>
                                        {histogramData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.rangeStart <= zeroKmMean && entry.rangeEnd >= zeroKmMean ? '#fcbf45' : '#ffffff'} />
                                        ))}
                                    </Bar>
                                    <ReferenceLine x={histogramData.find(b => b.rangeStart <= zeroKmMean && b.rangeEnd >= zeroKmMean)?.range} stroke="#fcbf45" strokeDasharray="3 3" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="text-center mt-2">
                            <div className="text-[9px] text-white/40 font-black uppercase tracking-widest">
                                Distribución de Precios 0km
                            </div>
                        </div>
                    </div>
                </div>

                {/* QUADRANT IV: PROJECTION (Bottom-Right) */}
                <div className="p-8 lg:p-12 relative bg-background flex flex-col">

                    <div className="h-full flex flex-col">
                        <div className="mb-6 flex justify-between items-end">
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">Intensidad de Uso</h3>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Año Base</div>
                                    <input
                                        type="number"
                                        value={chartFixedYear}
                                        onChange={(e) => setChartFixedYear(Number(e.target.value))}
                                        className="bg-primary text-white font-black w-24 text-center py-1 px-2 text-sm focus:bg-secondary focus:text-foreground outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={usageChartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="km" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 900, fill: '#71717a' }} />
                                    <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontWeight: 900, fill: '#71717a' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', border: '2px solid #38bdf8', borderRadius: '0px' }}
                                        itemStyle={{ color: '#111', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                                    />
                                    <ReferenceLine
                                        x={usageChartData.find(d => d.kmValue > dataKmMax)?.km}
                                        stroke="#fcbf45"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        label={({ viewBox }) => {
                                            const x = viewBox.x + 10;
                                            const y = viewBox.y + 10;
                                            return (
                                                <text x={x} y={y} fill="#fcbf45" fontSize={10} fontWeight={900} style={{ textTransform: 'uppercase' }}>
                                                    <tspan x={x} dy="0">Proyección</tspan>
                                                    <tspan x={x} dy="1.2em">→</tspan>
                                                </text>
                                            );
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="precio"
                                        stroke="#38bdf8"
                                        strokeWidth={3}
                                        fillOpacity={0.15}
                                        fill="#38bdf8"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

            </main>

            {/* Close dropdowns when clicking outside roughly */}
            {isDropdownOpen && (
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsDropdownOpen(false)}
                />
            )}
        </div>
    );
}
