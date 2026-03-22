import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';

function getAI(): GoogleGenAI {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const matchSchema = {
    type: 'object' as const,
    properties: {
        matches: {
            type: 'array' as const,
            items: {
                type: 'object' as const,
                properties: {
                    projectPart: { type: 'string', description: 'The original part name/description from the project list exactly as written.' },
                    inventoryMatch: { type: 'string', description: 'The matched inventory item name, or null if no match.' },
                    inventoryPartNumber: { type: 'string', description: 'The matched inventory part number if available.' },
                    quantityNeeded: { type: 'integer', description: 'Quantity needed from the project list.' },
                    quantityInStock: { type: 'integer', description: 'Quantity available in warehouse inventory.' },
                    confidence: { type: 'number', description: 'Match confidence 0.0-1.0.' },
                    inStock: { type: 'boolean', description: 'True if this part exists in warehouse inventory.' },
                },
                required: ['projectPart', 'inStock', 'confidence'],
            },
        },
        summary: {
            type: 'object' as const,
            properties: {
                totalProjectParts: { type: 'integer' },
                foundInWarehouse: { type: 'integer' },
                notInWarehouse: { type: 'integer' },
            },
        },
    },
    required: ['matches', 'summary'],
};

const MATCH_PROMPT = `You are an industrial inventory matching AI for a factory warehouse management system.

Your task: Cross-reference a PROJECT PARTS LIST (what the engineer needs for a project) against the WAREHOUSE INVENTORY (what's physically available in the factory warehouse).

For EACH item in the project parts list, determine:
1. Does it match any item in the warehouse inventory? Consider:
   - Exact name/part number matches
   - Partial matches (same component type with different specs)
   - Hebrew/English variations of the same item
   - Common abbreviations and synonyms in industrial manufacturing
   - Similar part numbers with minor variations
2. How confident is the match (0.0-1.0)?
3. What quantity is needed vs. what's in stock?

MATCHING RULES:
- A match should be ≥0.7 confidence to count as "in stock"
- Match on part numbers first (most reliable), then on names/descriptions
- Account for Hebrew/English mixed naming (e.g., "ברגים M6" = "M6 bolts")
- Consider that warehouse items might use different naming conventions than the project list
- If quantity needed exceeds quantity in stock, still mark as inStock=true but note the quantities`;

export async function POST(request: Request) {
    const user = verifyRequestAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { projectParts } = await request.json();

        if (!projectParts || !Array.isArray(projectParts) || projectParts.length === 0) {
            return NextResponse.json({ error: 'projectParts array is required' }, { status: 400 });
        }

        const inventory = await prisma.inventoryItem.findMany();

        if (inventory.length === 0) {
            return NextResponse.json({ error: 'Warehouse inventory is empty. Please upload inventory first.' }, { status: 400 });
        }

        const inventoryStr = inventory.map((item, i) =>
            `${i + 1}. [${item.partNumber || 'N/A'}] ${item.name}${item.description ? ' - ' + item.description : ''} | כמות: ${item.quantity}${item.category ? ' | קטגוריה: ' + item.category : ''}${item.location ? ' | מיקום: ' + item.location : ''}`
        ).join('\n');

        const projectStr = projectParts.map((p: any, i: number) =>
            `${i + 1}. ${p.name || p}${p.partNumber ? ' [' + p.partNumber + ']' : ''}${p.quantity ? ' | כמות: ' + p.quantity : ''}`
        ).join('\n');

        const ai = getAI();
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
                parts: [
                    { text: MATCH_PROMPT },
                    { text: `\n\nWAREHOUSE INVENTORY (${inventory.length} items):\n${inventoryStr}` },
                    { text: `\n\nPROJECT PARTS LIST (${projectParts.length} items):\n${projectStr}` },
                ],
            }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: matchSchema,
            },
        });

        const text = result.text;
        if (!text) throw new Error('Empty AI response');

        const parsed = JSON.parse(text);
        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error('Inventory match failed:', error);
        return NextResponse.json({ error: error.message || 'Match failed' }, { status: 500 });
    }
}
