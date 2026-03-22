import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { generateEmbedding, generateSearchSuggestions } from '@/lib/extraction/gemini';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30;

function getAI(): GoogleGenAI {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function cosineSimilarity(A: number[], B: number[]) {
    if (A.length !== B.length || A.length === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < A.length; i++) {
        dot += A[i] * B[i];
        nA += A[i] * A[i];
        nB += B[i] * B[i];
    }
    return (nA === 0 || nB === 0) ? 0 : dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// --- Step 1: Understand the query intent ---

const INTENT_SCHEMA = {
    type: 'object' as const,
    properties: {
        expandedTerms: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: 'All search terms to try: original + translations + synonyms + related industrial terms (15-30 terms)',
        },
        skuPatterns: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: 'If the query looks like a SKU/part number, include prefix patterns to match (e.g., "MHP07" → ["MHP07", "MHP"])',
        },
        numericFilters: {
            type: 'object' as const,
            properties: {
                powerKwMin: { type: 'number' as const, description: 'Minimum power in kW if mentioned' },
                powerKwMax: { type: 'number' as const, description: 'Maximum power in kW if mentioned' },
                voltage: { type: 'string' as const, description: 'Voltage value if mentioned (e.g., "400V")' },
            },
        },
        semanticQuery: {
            type: 'string' as const,
            description: 'A rich English+Hebrew semantic description of what the user is looking for (for embedding search). Include product category, use case, characteristics.',
        },
    },
    required: ['expandedTerms', 'semanticQuery'],
};

const INTENT_PROMPT = `You are an expert search query analyzer for an Israeli factory product management system.
Workers search here to find past manufacturing projects (industrial heaters, electrical panels, motors, enclosures, etc.)

Given a user's search query, deeply analyze the INTENT and produce:

1. **expandedTerms** (15-30 terms): ALL relevant search variations:
   - Original query as-is
   - Hebrew spelling variants (קופסה/קופסא, תאור/תיאור, חמום/חימום)
   - Hebrew root-based expansions (שורש ח.מ.מ → חימום, מחמם, חם, לחמם)
   - Singular/plural (מסגרת/מסגרות, ברג/ברגים, ארון/ארונות)
   - English translations AND transliterations
   - Industry-specific synonyms (ארון חשמל → לוח חשמל, cabinet, panel, switchboard)
   - Common factory abbreviations and shorthand
   - 2-3 word combinations likely to appear in product descriptions
   - Related product components (e.g., חימום → אלמנט חימום, גוף חימום, טרמוסטט)

2. **skuPatterns**: If the query resembles a product code/SKU (contains numbers + letters like "MHP07", "3162", "M0082"):
   - Include the exact pattern
   - Include shorter prefixes for broader matching

3. **numericFilters**: Extract numeric specifications if present:
   - "5kw" → powerKwMin: 4.5, powerKwMax: 5.5
   - "400v" → voltage: "400"
   - "10 קילוואט" → powerKwMin: 9, powerKwMax: 11

4. **semanticQuery**: Write a rich 2-3 sentence description in BOTH Hebrew and English of what the user is likely looking for. Include the product category, typical use cases, and characteristics. This will be used for embedding similarity search.

IMPORTANT:
- Israeli factory workers mix Hebrew and English freely
- Technical terms often have multiple Hebrew spellings
- SKU/part numbers may be searched partially (prefix search)
- The goal is to find ALL relevant past projects, not miss any`;

async function analyzeQueryIntent(query: string) {
    try {
        const ai = getAI();
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ parts: [{ text: `${INTENT_PROMPT}\n\nUser query: "${query}"` }] }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: INTENT_SCHEMA,
            },
        });
        const text = result.text;
        if (!text) return null;
        const parsed = JSON.parse(text);
        if (!parsed.expandedTerms?.includes(query)) {
            parsed.expandedTerms = [query, ...(parsed.expandedTerms || [])];
        }
        return parsed as {
            expandedTerms: string[];
            skuPatterns?: string[];
            numericFilters?: { powerKwMin?: number; powerKwMax?: number; voltage?: string };
            semanticQuery: string;
        };
    } catch (e) {
        console.error('[search] Query intent analysis failed:', e);
        return { expandedTerms: [query], semanticQuery: query };
    }
}

// --- Step 2: Multi-signal scoring ---

interface ScoredProject {
    project: any;
    textScore: number;
    embeddingScore: number;
    skuBoost: number;
    totalScore: number;
}

function scoreTextMatch(project: any, terms: string[], skuPatterns: string[]): { textScore: number; skuBoost: number } {
    let textScore = 0;
    let skuBoost = 0;
    const fields = [
        { key: 'sku', weight: 5 },
        { key: 'customerName', weight: 3 },
        { key: 'workOrderNumber', weight: 3 },
        { key: 'productDescription', weight: 2 },
        { key: 'configuration', weight: 2 },
        { key: 'plannerName', weight: 1 },
        { key: 'voltage', weight: 1.5 },
    ];

    for (const term of terms) {
        const termLower = term.toLowerCase();
        for (const { key, weight } of fields) {
            const val = project[key];
            if (!val) continue;
            const valLower = String(val).toLowerCase();

            if (valLower === termLower) {
                textScore += weight * 3;
            } else if (valLower.startsWith(termLower) || termLower.startsWith(valLower)) {
                textScore += weight * 2;
            } else if (valLower.includes(termLower)) {
                textScore += weight * 1;
            }
        }
    }

    // SKU prefix matching boost
    if (skuPatterns.length > 0 && project.sku) {
        const skuLower = project.sku.toLowerCase();
        for (const pattern of skuPatterns) {
            const patLower = pattern.toLowerCase();
            if (skuLower === patLower) {
                skuBoost = 20;
            } else if (skuLower.startsWith(patLower)) {
                skuBoost = Math.max(skuBoost, 15);
            } else if (skuLower.includes(patLower)) {
                skuBoost = Math.max(skuBoost, 8);
            }
        }
    }

    return { textScore, skuBoost };
}

// --- Step 3: AI Re-ranking ---

const RERANK_SCHEMA = {
    type: 'object' as const,
    properties: {
        rankings: {
            type: 'array' as const,
            items: {
                type: 'object' as const,
                properties: {
                    id: { type: 'string' as const },
                    relevance: { type: 'number' as const, description: 'Relevance score 0-10' },
                },
                required: ['id', 'relevance'] as const,
            },
        },
    },
    required: ['rankings'] as const,
};

async function rerankWithAI(query: string, projects: any[]): Promise<Map<string, number>> {
    if (projects.length === 0) return new Map();
    try {
        const ai = getAI();
        const projectSummaries = projects.slice(0, 25).map((p, i) =>
            `[${p.id}] SKU: ${p.sku || '-'} | Customer: ${p.customerName || '-'} | Description: ${p.productDescription || '-'} | Config: ${p.configuration || '-'} | Voltage: ${p.voltage || '-'} | Power: ${p.powerKw ? p.powerKw + 'kW' : '-'}`
        ).join('\n');

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ parts: [{ text: `You are a factory search relevance judge. Score each project's relevance to the search query on a scale of 0-10.\n\n10 = perfect match (exactly what the user is looking for)\n7-9 = highly relevant (same product type/category)\n4-6 = somewhat relevant (related product or component)\n1-3 = marginally relevant\n0 = not relevant at all\n\nSearch query: "${query}"\n\nProjects:\n${projectSummaries}` }] }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: RERANK_SCHEMA,
            },
        });

        const text = result.text;
        if (!text) return new Map();
        const parsed = JSON.parse(text);
        const map = new Map<string, number>();
        for (const r of parsed.rankings || []) {
            map.set(r.id, r.relevance || 0);
        }
        return map;
    } catch (e) {
        console.error('[search] AI reranking failed:', e);
        return new Map();
    }
}

// --- Main search handler ---

const listSelect = {
    id: true, createdAt: true, rowNumber: true, sku: true,
    customerName: true, workOrderNumber: true, productDescription: true,
    plannerName: true, drawingDate: true, voltage: true, powerKw: true,
    quantity: true, configuration: true, productImageUrl: true,
    extractionStatus: true, sourcePdfFilename: true,
};

export async function GET(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        if (!query) {
            return NextResponse.json({ projects: [], suggestions: [] });
        }

        console.log(`[search] Query: "${query}"`);
        const t0 = Date.now();

        // Step 1: Analyze intent + generate embedding in PARALLEL
        const [intent, queryEmbedding] = await Promise.all([
            analyzeQueryIntent(query),
            generateEmbedding(query).catch(() => [] as number[]),
        ]);

        const expandedTerms = intent?.expandedTerms || [query];
        const skuPatterns = intent?.skuPatterns || [];
        const numericFilters = intent?.numericFilters;
        const semanticQuery = intent?.semanticQuery || query;

        // Generate a richer embedding if semantic query differs from original
        let richEmbedding = queryEmbedding;
        if (semanticQuery !== query && semanticQuery.length > query.length * 1.5) {
            richEmbedding = await generateEmbedding(semanticQuery).catch(() => queryEmbedding);
        }

        console.log(`[search] Intent analysis done in ${Date.now() - t0}ms, ${expandedTerms.length} terms, ${skuPatterns.length} SKU patterns`);

        // Step 2: Text search - all expanded terms across key fields
        const textConditions = expandedTerms.flatMap(term => [
            { sku: { contains: term, mode: 'insensitive' as const } },
            { customerName: { contains: term, mode: 'insensitive' as const } },
            { productDescription: { contains: term, mode: 'insensitive' as const } },
            { workOrderNumber: { contains: term, mode: 'insensitive' as const } },
            { configuration: { contains: term, mode: 'insensitive' as const } },
            { plannerName: { contains: term, mode: 'insensitive' as const } },
            { rawExtractedText: { contains: term, mode: 'insensitive' as const } },
        ]);

        // SKU prefix search
        if (skuPatterns.length > 0) {
            for (const pat of skuPatterns) {
                textConditions.push({ sku: { startsWith: pat, mode: 'insensitive' as const } });
            }
        }

        // Numeric filters
        const numericConditions: any[] = [];
        if (numericFilters?.voltage) {
            numericConditions.push({ voltage: { contains: numericFilters.voltage, mode: 'insensitive' as const } });
        }
        if (numericFilters?.powerKwMin != null && numericFilters?.powerKwMax != null) {
            numericConditions.push({ powerKw: { gte: numericFilters.powerKwMin, lte: numericFilters.powerKwMax } });
        }

        const whereClause = numericConditions.length > 0
            ? { AND: [{ OR: textConditions }, ...numericConditions] }
            : { OR: textConditions };

        const textResults = await prisma.project.findMany({
            where: whereClause,
            take: 80,
            select: listSelect,
        });

        console.log(`[search] Text search: ${textResults.length} results in ${Date.now() - t0}ms`);

        // Step 3: Embedding search with continuous scoring
        const embeddingScores = new Map<string, number>();
        if (richEmbedding.length > 0) {
            const allEmbeddings = await prisma.projectEmbedding.findMany({
                select: { projectId: true, embedding: true },
            });

            for (const emb of allEmbeddings) {
                try {
                    const vec = JSON.parse(emb.embedding);
                    const sim = cosineSimilarity(richEmbedding, vec);
                    if (sim >= 0.35) {
                        embeddingScores.set(emb.projectId, sim);
                    }
                } catch {}
            }

            console.log(`[search] Embedding search: ${embeddingScores.size} candidates above 0.35 threshold`);
        }

        // Fetch embedding-only results not already in text results
        const textIds = new Set(textResults.map(p => p.id));
        const embeddingOnlyIds = [...embeddingScores.keys()].filter(id => !textIds.has(id));

        let embeddingOnlyResults: typeof textResults = [];
        if (embeddingOnlyIds.length > 0) {
            const topEmbeddingIds = embeddingOnlyIds
                .sort((a, b) => (embeddingScores.get(b) || 0) - (embeddingScores.get(a) || 0))
                .slice(0, 30);

            embeddingOnlyResults = await prisma.project.findMany({
                where: { id: { in: topEmbeddingIds } },
                select: listSelect,
            });
        }

        // Step 4: Combine and score all results
        const allResults = [...textResults, ...embeddingOnlyResults];
        const scored: ScoredProject[] = allResults.map(project => {
            const { textScore, skuBoost } = scoreTextMatch(project, expandedTerms, skuPatterns);
            const embeddingScore = (embeddingScores.get(project.id) || 0) * 30;

            return {
                project,
                textScore,
                embeddingScore,
                skuBoost,
                totalScore: textScore + embeddingScore + skuBoost,
            };
        });

        // Sort by total score descending
        scored.sort((a, b) => b.totalScore - a.totalScore);

        // Deduplicate
        const seen = new Set<string>();
        const deduped = scored.filter(s => {
            if (seen.has(s.project.id)) return false;
            seen.add(s.project.id);
            return true;
        });

        // Step 5: AI re-ranking of top results
        const top = deduped.slice(0, 25);
        if (top.length > 3) {
            const rerankScores = await rerankWithAI(query, top.map(s => s.project));
            if (rerankScores.size > 0) {
                for (const s of top) {
                    const aiScore = rerankScores.get(s.project.id);
                    if (aiScore != null) {
                        s.totalScore += aiScore * 5;
                    }
                }
                top.sort((a, b) => b.totalScore - a.totalScore);
            }
        }

        const finalResults = top.map(s => s.project);
        const totalTime = Date.now() - t0;
        console.log(`[search] Final: ${finalResults.length} results in ${totalTime}ms`);

        if (finalResults.length === 0) {
            const suggestions = await generateSearchSuggestions(query);
            return NextResponse.json({ projects: [], suggestions });
        }

        return NextResponse.json({ projects: finalResults, suggestions: [] });

    } catch (error) {
        console.error('Search errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
