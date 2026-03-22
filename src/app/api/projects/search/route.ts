import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { generateEmbedding, generateSearchSuggestions } from '@/lib/extraction/gemini';
import { GoogleGenAI } from '@google/genai';

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

const EXPAND_SCHEMA = {
    type: 'object' as const,
    properties: {
        terms: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: 'All expanded search terms including the original query.',
        },
    },
    required: ['terms'],
};

const EXPAND_PROMPT = `You are a Hebrew/English industrial search query expander for a factory product management system.

Given a user's search query, generate ALL relevant search terms that should match products in a factory database.

EXPAND the query into:
1. The original term as-is
2. Hebrew spelling variations (with and without nikud, common misspellings, e.g., קופסה/קופסא, תאור/תיאור)
3. All Hebrew verb conjugations and forms (e.g., חימום → לחמם, חמם, מחמם, חם, להתחמם)
4. Root-based Hebrew matches (שורש: e.g., ח.מ.מ for חימום)
5. Singular/plural forms (e.g., מסגרת/מסגרות, ברג/ברגים)
6. English translations (e.g., חימום → heating, heater, heat)
7. Semantically related industrial terms (e.g., חימום → גוף חימום, ארון חימום, אלמנט חימום, רכיב חימום, תנור)
8. Common abbreviations and shorthand used in Israeli factories
9. Related product categories (e.g., מסגרת → שלדה, פריים, frame, chassis)

RULES:
- Return 10-30 terms maximum
- Include both short keywords and 2-word combinations
- Focus on terms likely to appear in industrial product descriptions, SKUs, and work orders
- Every term should be a realistic search match, don't add irrelevant terms
- Include the original query as the first term`;

async function expandQuery(query: string): Promise<string[]> {
    try {
        const ai = getAI();
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ parts: [{ text: `${EXPAND_PROMPT}\n\nUser query: "${query}"` }] }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: EXPAND_SCHEMA,
            },
        });
        const text = result.text;
        if (!text) return [query];
        const parsed = JSON.parse(text);
        const terms: string[] = parsed.terms || [query];
        if (!terms.includes(query)) terms.unshift(query);
        return terms;
    } catch (e) {
        console.error('Query expansion failed:', e);
        return [query];
    }
}

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

        const [expandedTerms, queryEmbedding] = await Promise.all([
            expandQuery(query),
            generateEmbedding(query).catch(() => [] as number[]),
        ]);

        console.log(`[search] Expanded to ${expandedTerms.length} terms:`, expandedTerms.slice(0, 10));

        // Text search across all expanded terms
        const textConditions = expandedTerms.flatMap(term => [
            { sku: { contains: term, mode: 'insensitive' as const } },
            { customerName: { contains: term, mode: 'insensitive' as const } },
            { productDescription: { contains: term, mode: 'insensitive' as const } },
            { workOrderNumber: { contains: term, mode: 'insensitive' as const } },
            { configuration: { contains: term, mode: 'insensitive' as const } },
            { plannerName: { contains: term, mode: 'insensitive' as const } },
        ]);

        const listSelect = {
            id: true, createdAt: true, rowNumber: true, sku: true,
            customerName: true, workOrderNumber: true, productDescription: true,
            plannerName: true, drawingDate: true, voltage: true, powerKw: true,
            quantity: true, configuration: true, productImageUrl: true,
            extractionStatus: true, sourcePdfFilename: true,
        };

        const textResults = await prisma.project.findMany({
            where: { OR: textConditions },
            take: 50,
            select: listSelect,
        });

        console.log(`[search] Text search found ${textResults.length} results`);

        // Embedding search (if embeddings exist)
        let embeddingResults: typeof textResults = [];
        if (queryEmbedding.length > 0) {
            const allEmbeddings = await prisma.projectEmbedding.findMany({
                include: { project: { select: listSelect } },
            });

            if (allEmbeddings.length > 0) {
                const scored = allEmbeddings
                    .map(emb => {
                        try {
                            const vec = JSON.parse(emb.embedding);
                            return { project: emb.project, score: cosineSimilarity(queryEmbedding, vec) };
                        } catch { return null; }
                    })
                    .filter((p): p is NonNullable<typeof p> => p !== null)
                    .sort((a, b) => b.score - a.score);

                const topScore = scored[0]?.score || 0;
                if (topScore >= 0.50) {
                    const threshold = Math.max(0.50, topScore * 0.90);
                    embeddingResults = scored
                        .filter(p => p.score >= threshold)
                        .slice(0, 20)
                        .map(p => p.project);
                }

                console.log(`[search] Embedding search found ${embeddingResults.length} results (top score: ${topScore.toFixed(3)})`);
            }
        }

        // Merge and deduplicate
        const seen = new Set<string>();
        const merged: typeof textResults = [];

        for (const p of [...embeddingResults, ...textResults]) {
            if (!seen.has(p.id)) {
                seen.add(p.id);
                merged.push(p);
            }
        }

        // Sort merged results by rowNumber descending
        merged.sort((a, b) => {
            const numA = parseInt(a.rowNumber || '0', 10) || 0;
            const numB = parseInt(b.rowNumber || '0', 10) || 0;
            return numB - numA;
        });

        console.log(`[search] Total merged results: ${merged.length}`);

        if (merged.length === 0) {
            const suggestions = await generateSearchSuggestions(query);
            return NextResponse.json({ projects: [], suggestions });
        }

        return NextResponse.json({ projects: merged, suggestions: [] });

    } catch (error) {
        console.error('Search errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
