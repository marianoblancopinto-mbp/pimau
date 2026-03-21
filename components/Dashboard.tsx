'use client';
import { useState, useMemo } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceLine, Cell, ScatterChart, Scatter, ZAxis, Legend } from 'recharts';
import { Activity, Clock, TrendingUp, BarChart3, ChevronRight, AlertTriangle } from 'lucide-react';

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
}

interface ZeroKmData {
    model: string;
    prices: number[];
}

interface ScatterPoint {
    year: number;
    km: number;
    price: number;
}

interface DashboardProps {
    data: ReportItem[];
    zeroKmData: ZeroKmData[];
    scatterData?: Record<string, ScatterPoint[]>;
}

export function Dashboard({ data, zeroKmData, scatterData }: DashboardProps) {
    const currentYear = new Date().getFullYear();

    // Group models by Parent 👨‍
    const groupedModels = useMemo(() => {
        const groups: Record<string, ReportItem[]> = {};
        const allModels = data.map(d => d.model);

        // First, find parents that exist as actual models
        const existingParents = allModels.filter(m =>
            allModels.some(other => other !== m && other.startsWith(m + ' '))
        );

        // Second, detect implicit parents (common prefixes like "JEEP COMPASS" when we have "JEEP COMPASS SPORT", "JEEP COMPASS LIMITED")
        const findCommonPrefix = (model: string): string | null => {
            // Check if this model shares a prefix with other models
            const parts = model.split(' ');
            for (let i = parts.length - 1; i >= 2; i--) {
                const prefix = parts.slice(0, i).join(' ');
                const siblings = allModels.filter(m => m !== model && m.startsWith(prefix + ' '));
                if (siblings.length >= 1) {
                    // Found at least one sibling with same prefix
                    return prefix;
                }
            }
            return null;
        };

        const findParent = (modelName: string) => {
            // First check if there's an existing parent
            const existingParent = existingParents.find(parent => modelName.startsWith(parent + ' '));
            if (existingParent) return existingParent;

            // Then check for implicit parent (common prefix)
            const implicitParent = findCommonPrefix(modelName);
            if (implicitParent) return implicitParent;

            return modelName; // Fallback to self (Orphan)
        };

        data.forEach(item => {
            const parent = findParent(item.model);
            if (!groups[parent]) groups[parent] = [];
            groups[parent].push(item);
        });

        return groups;
    }, [data]);

    const parentKeys = useMemo(() => Object.keys(groupedModels).sort(), [groupedModels]);

    const [selectedParent, setSelectedParent] = useState(parentKeys[0] || '');

    // We just track selected VARIANT MODEL string (or 'GLOBAL' for combined view)
    const [selectedModel, setSelectedModel] = useState(data[0]?.model || '');

    // Track if we're in "Global" view (combined data from all variants)
    const isGlobalView = selectedModel === '__GLOBAL__';

    // Derived parent (for UI sync)
    const activeParent = isGlobalView
        ? selectedParent
        : parentKeys.find(p =>
            groupedModels[p].some(item => item.model === selectedModel)
        ) || selectedParent;

    const [calcYear, setCalcYear] = useState(2022);
    const [calcKm, setCalcKm] = useState(50000);
    const [chartFixedYear, setChartFixedYear] = useState(currentYear - 3);
    const [chartFixedKm, setChartFixedKm] = useState(50000);

    // --- GLOBAL CONSOLIDATION LOGIC ---
    const globalReportItem = useMemo((): ReportItem | null => {
        if (!isGlobalView || !activeParent) return null;
        const variants = groupedModels[activeParent] || [];
        if (variants.length === 0) return null;

        const totalCount = variants.reduce((sum, v) => sum + v.count, 0);
        if (totalCount === 0) return variants[0]; // Fallback

        // Weighted Average helper
        const weightedAvg = (getKey: (v: ReportItem) => number) => {
            return variants.reduce((sum, v) => sum + (getKey(v) * v.count), 0) / totalCount;
        };

        return {
            model: activeParent, // Display name
            count: totalCount,
            r2: weightedAvg(v => v.r2),
            depreciation_per_year: weightedAvg(v => v.depreciation_per_year),
            depreciation_per_10k_km: weightedAvg(v => v.depreciation_per_10k_km),
            // Synthesize linear coefficients (Approximate)
            coefficients: {
                intercept: weightedAvg(v => v.coefficients.intercept),
                year: weightedAvg(v => v.coefficients.year),
                km: weightedAvg(v => v.coefficients.km)
            },
            // For stability score/label, take the mode or avg? Avg score.
            resilience_score: weightedAvg(v => v.resilience_score),
            stability_label: variants.sort((a, b) => b.count - a.count)[0].stability_label, // Take dominant label

            // Ranges: Union of all ranges
            yearRange: {
                min: Math.min(...variants.map(v => v.yearRange.min)),
                max: Math.max(...variants.map(v => v.yearRange.max))
            },
            kmRange: {
                min: Math.min(...variants.map(v => v.kmRange.min)),
                max: Math.max(...variants.map(v => v.kmRange.max))
            },

            // Buckets not strictly needed for UI (we use coefficients) but could aggregate
            buckets: [],
            modelType: 'LINEAR', // Simplify to Linear for aggregate view 
            weights: undefined,
            exponential_coefficients: undefined // Skip complexity for aggregate
        };
    }, [isGlobalView, activeParent, groupedModels]);

    // SELECT THE RIGHT DATA
    const selected = isGlobalView
        ? globalReportItem || groupedModels[activeParent]?.[0] || data[0]
        : data.find(d => d.model === selectedModel) || data[0];


    // Get 0km data - for global view, combine all variants' 0km data
    const selectedZeroKm = useMemo(() => {
        if (isGlobalView && activeParent) {
            // Combine 0km data from all variants under this parent
            const variants = groupedModels[activeParent] || [];
            const allPrices: number[] = [];
            variants.forEach(v => {
                const zkm = zeroKmData.find(z => z.model === v.model);
                if (zkm) allPrices.push(...zkm.prices);
            });
            // Also check parent name directly
            const parentZkm = zeroKmData.find(z => z.model === activeParent);
            if (parentZkm) allPrices.push(...parentZkm.prices);

            if (allPrices.length > 0) {
                return { model: activeParent, prices: allPrices };
            }
        }
        return zeroKmData.find(z => z.model === selectedModel);
    }, [isGlobalView, activeParent, selectedModel, zeroKmData, groupedModels]);

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

    // For scatter plot, if Global, combine all points?
    // User didn't strictly ask for scatter agg but for consistency we should.
    const modelScatterData = useMemo(() => {
        if (isGlobalView && scatterData && activeParent) {
            const variants = groupedModels[activeParent] || [];
            const combined: ScatterPoint[] = [];
            variants.forEach(v => {
                if (scatterData[v.model]) combined.push(...scatterData[v.model]);
            });
            // also parent if exists
            if (scatterData[activeParent]) combined.push(...scatterData[activeParent]);
            // dedupe not needed if models keys are distinct
            return combined;
        }
        return scatterData?.[selectedModel] || [];
    }, [isGlobalView, selectedModel, scatterData, activeParent, groupedModels]);


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
                            <select
                                value={activeParent}
                                onChange={(e) => {
                                    const newParent = e.target.value;
                                    const variants = groupedModels[newParent];
                                    if (variants.length > 1) {
                                        setSelectedModel('__GLOBAL__');
                                    } else {
                                        setSelectedModel(variants[0].model);
                                    }
                                    setSelectedParent(newParent);
                                }}
                                className="bg-background text-foreground text-sm font-black focus:outline-none cursor-pointer min-w-[200px] text-right border border-border px-2 py-1 rounded-sm [&>option]:text-black"
                            >
                                {parentKeys.map(parent => (
                                    <option key={parent} value={parent} className="text-black">
                                        {parent}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - 2x2 Grid */}
            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2">

                {/* QUADRANT I: IDENTITY & VALUATOR (Top-Left) */}
                <div className="p-8 lg:p-12 border-b lg:border-r border-border relative flex flex-col">

                    {/* Top: Identity */}
                    <div className="mb-8">
                        <div className="flex justify-between items-start mb-6">
                            <h2 className="text-5xl lg:text-6xl font-black text-primary leading-[0.8] tracking-[-0.04em] uppercase">
                                {activeParent}
                            </h2>
                            <div className={cn("badge-industrial ml-auto", getBadgeStyle(selected.stability_label))}>
                                {selected.stability_label}
                            </div>
                        </div>

                        {/* Variant Selection */}
                        <div className="flex flex-wrap gap-2 mb-8">
                            {groupedModels[activeParent]?.length > 1 && (
                                <button
                                    onClick={() => setSelectedModel('__GLOBAL__')}
                                    className={cn(
                                        "px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all border",
                                        isGlobalView
                                            ? "bg-primary text-white border-primary"
                                            : "bg-transparent text-muted hover:text-foreground border-border"
                                    )}
                                >
                                    Vista Global
                                </button>
                            )}
                            {groupedModels[activeParent]?.map((variant) => {
                                const isActive = !isGlobalView && variant.model === selectedModel;
                                const rawShortName = variant.model.replace(activeParent, '').trim();
                                const shortName = rawShortName || 'Base';

                                return (
                                    <button
                                        key={variant.model}
                                        onClick={() => setSelectedModel(variant.model)}
                                        className={cn(
                                            "px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all border",
                                            isActive
                                                ? "bg-primary text-white border-primary"
                                                : "bg-transparent text-muted hover:text-foreground border-border"
                                        )}
                                    >
                                        {shortName}
                                    </button>
                                );
                            })}
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
        </div>
    );
}
