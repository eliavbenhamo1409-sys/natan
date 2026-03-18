import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { generateEmbedding, generateSearchSuggestions } from '@/lib/extraction/gemini';

function cosineSimilarity(A: number[], B: number[]) {
    if (A.length !== B.length || A.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        normA += A[i] * A[i];
        normB += B[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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

        let queryEmbedding: number[];
        try {
            queryEmbedding = await generateEmbedding(query);
        } catch (e) {
            console.error('Embedding generation failed:', e);
            return NextResponse.json({ error: 'AI search temporarily unavailable' }, { status: 503 });
        }

        if (!queryEmbedding || queryEmbedding.length === 0) {
            return NextResponse.json({ error: 'Failed to generate search embedding' }, { status: 503 });
        }

        const allEmbeddings = await prisma.projectEmbedding.findMany({
            include: { project: true }
        });

        if (allEmbeddings.length === 0) {
            const textResults = await prisma.project.findMany({
                where: {
                    OR: [
                        { sku: { contains: query } },
                        { customerName: { contains: query } },
                        { productDescription: { contains: query } },
                        { workOrderNumber: { contains: query } },
                        { rawExtractedText: { contains: query } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });

            if (textResults.length === 0) {
                const suggestions = await generateSearchSuggestions(query);
                return NextResponse.json({ projects: [], suggestions });
            }

            return NextResponse.json({ projects: textResults, suggestions: [] });
        }

        const scoredProjects = allEmbeddings
            .map(emb => {
                let storedVec: number[] = [];
                try {
                    storedVec = JSON.parse(emb.embedding);
                } catch {
                    return null;
                }
                const score = cosineSimilarity(queryEmbedding, storedVec);
                return { project: emb.project, score };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .sort((a, b) => b.score - a.score);

        if (scoredProjects.length === 0) {
            const suggestions = await generateSearchSuggestions(query);
            return NextResponse.json({ projects: [], suggestions });
        }

        const topScore = scoredProjects[0].score;

        if (topScore < 0.58) {
            const suggestions = await generateSearchSuggestions(query);
            return NextResponse.json({ projects: [], suggestions });
        }

        const dynamicThreshold = Math.max(0.58, topScore * 0.93);
        const results = scoredProjects
            .filter(p => p.score >= dynamicThreshold)
            .slice(0, 10)
            .map(p => p.project);

        if (results.length === 0) {
            const suggestions = await generateSearchSuggestions(query);
            return NextResponse.json({ projects: [], suggestions });
        }

        return NextResponse.json({ projects: results, suggestions: [] });

    } catch (error) {
        console.error('Semantic search errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
