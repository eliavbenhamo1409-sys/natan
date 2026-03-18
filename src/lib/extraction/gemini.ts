import { GoogleGenAI, ThinkingLevel } from '@google/genai';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!_ai) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }
        _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return _ai;
}

const projectJsonSchema = {
    type: 'object' as const,
    properties: {
        drawingDate: { type: 'string', description: 'Document or drawing date. Format: YYYY-MM-DD if possible, else exactly as written.' },
        plannerName: { type: 'string', description: 'Planner, drawn by, or engineer name.' },
        customerName: { type: 'string', description: 'Customer name.' },
        workOrderNumber: { type: 'string', description: 'Work order number, job number, or פקע"ת.' },
        sku: { type: 'string', description: 'SKU, part number, catalog number, or מק"ט.' },
        productDescription: { type: 'string', description: 'Main product description.' },
        voltage: { type: 'string', description: 'Voltage value, e.g., 400V, 3~, 50Hz.' },
        powerKw: { type: 'number', description: 'Power in kilowatts (kW).' },
        quantity: { type: 'integer', description: 'Quantity.' },
        configuration: { type: 'string', description: 'Configuration value or type.' },
        sheetNumber: { type: 'integer', description: 'Current sheet number.' },
        totalSheets: { type: 'integer', description: 'Total number of sheets.' },
        scale: { type: 'string', description: 'Drawing scale, e.g., 1:10.' },
        thermostat: { type: 'boolean', description: 'True if a thermostat is mentioned or required.' },
        mainSwitch: { type: 'boolean', description: 'True if a main switch is mentioned or required.' },
        technicalDimensions: {
            type: 'object',
            properties: {
                width: { type: 'string' },
                height: { type: 'string' },
                depth: { type: 'string' },
                weight: { type: 'string' },
                volume: { type: 'string' },
            },
        },
        extractionConfidence: { type: 'number', description: 'Confidence score 0.0 to 1.0.' },
    },
};

const EXTRACTION_PROMPT = `You are a precision AI extracting structured data from a factory manufacturing PDF or technical drawing.
Output a JSON object matching the requested schema.

RULES:
1. DO NOT hallucinate or invent values. If a field is not found, omit it.
2. Text may be in Hebrew and English. Keep names and IDs exactly as written.
3. Label translations: Work order = פקע"ת / מס' הזמנה, SKU = מק"ט / פריט, Description = תאור / תיאור הפריט, Planner = שרטט / תכנון, Date = תאריך
4. Extract Power (kW) and Voltage (V) if present.`;

export async function extractProjectFieldsFromPdf(pdfBuffer: Buffer) {
    const ai = getAI();

    const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            {
                parts: [
                    { text: EXTRACTION_PROMPT },
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: pdfBuffer.toString('base64'),
                        },
                    },
                ],
            },
        ],
        config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseJsonSchema: projectJsonSchema,
        },
    });

    const outputText = result.text;
    if (!outputText) {
        throw new Error('Empty response from Gemini');
    }

    const parsedData = JSON.parse(outputText);
    return {
        structured: parsedData,
        rawOutput: outputText,
    };
}

export interface BoundingBox {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
}

const bboxSchema = {
    type: 'object' as const,
    properties: {
        found: { type: 'boolean', description: 'True if a product/item image or drawing is visible in the image.' },
        ymin: { type: 'integer', description: 'Top edge of the product bounding box (0-1000).' },
        xmin: { type: 'integer', description: 'Left edge of the product bounding box (0-1000).' },
        ymax: { type: 'integer', description: 'Bottom edge of the product bounding box (0-1000).' },
        xmax: { type: 'integer', description: 'Right edge of the product bounding box (0-1000).' },
    },
    required: ['found'],
};

const BBOX_PROMPT = `You are analyzing a technical drawing or image extracted from a factory PDF.
Identify the main PRODUCT or manufactured ITEM in the image. Ignore title blocks, borders, text labels, logos, and dimension annotations.
Return the bounding box of ONLY the product itself, using coordinates normalized to 0-1000 (where 0,0 is top-left and 1000,1000 is bottom-right).
If no clear product image is found, set found=false.`;

export async function getProductBoundingBox(imageBuffer: Buffer, mimeType: string): Promise<BoundingBox | null> {
    try {
        const ai = getAI();
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    parts: [
                        { text: BBOX_PROMPT },
                        {
                            inlineData: {
                                mimeType,
                                data: imageBuffer.toString('base64'),
                            },
                        },
                    ],
                },
            ],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
                responseJsonSchema: bboxSchema,
            },
        });

        const text = result.text;
        if (!text) return null;

        const parsed = JSON.parse(text);
        if (!parsed.found || parsed.ymin == null) return null;

        return {
            ymin: parsed.ymin,
            xmin: parsed.xmin,
            ymax: parsed.ymax,
            xmax: parsed.xmax,
        };
    } catch (e) {
        console.error('Product bounding box detection failed:', e);
        return null;
    }
}

const CATALOG_PROMPT = `You are an industrial product cataloging AI for a factory management system.
The purpose of this catalog is to help workers find SIMILAR past projects to save time on new orders.

Given all the extracted data from a manufacturing PDF, generate a rich descriptive paragraph in BOTH Hebrew and English.

Include:
- Product category and type (e.g. industrial heater, electric motor, control panel)
- Likely use case and industry (e.g. food processing, HVAC, water treatment, defense, agriculture)
- Key technical characteristics inferred from the specs (power range, size class, materials)
- What kind of NEW projects this could serve as a reference for
- Synonyms, related terms, and common ways a factory worker might describe this product
- Hebrew and English names for the product type

Output a single paragraph of 4-6 sentences. Be factual based on the data, but you CAN infer reasonable product categorization.`;

export async function generateCatalogDescription(structuredData: any, imageBuffer?: Buffer): Promise<string> {
    try {
        const ai = getAI();
        const dataStr = JSON.stringify(structuredData, null, 2);

        const parts: any[] = [
            { text: CATALOG_PROMPT },
            { text: `Extracted data:\n${dataStr}` },
        ];

        if (imageBuffer) {
            parts.push({
                inlineData: { mimeType: 'image/png', data: imageBuffer.toString('base64') },
            });
        }

        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts }],
            config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });

        return result.text || '';
    } catch (e) {
        console.error('Catalog description generation failed:', e);
        return '';
    }
}

const SUGGESTIONS_PROMPT = `You are a search assistant for a factory product management system.
Workers search here to find SIMILAR past projects they can use as reference for new orders, to save time.

The user searched but got no results. Generate exactly 3 guiding questions in the SAME LANGUAGE as the user's query. The questions should help the user describe what they need more precisely so we can find a similar past project.

Rules:
- Each question is short (4-10 words), ends with ?
- Questions should narrow down: product type, technical specs, use case, or customer/industry
- When clicked, the question text itself will be used as a new search query
- So phrase questions as searchable terms with a ? mark
- Examples: "ציוד חימום תעשייתי?", "משאבות עמידות בחומצה?", "ציוד למפעלי מזון?"

Return a JSON array of exactly 3 strings.`;

export async function generateSearchSuggestions(query: string): Promise<string[]> {
    try {
        const ai = getAI();
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ text: `${SUGGESTIONS_PROMPT}\n\nUser query: "${query}"` }] }],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
            },
        });

        const text = result.text;
        if (!text) return [];
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch (e) {
        console.error('Search suggestions generation failed:', e);
        return [];
    }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const ai = getAI();
        const result = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: text,
        });
        const values = (result as any).embeddings?.[0]?.values
            ?? (result as any).embedding?.values
            ?? [];
        return values;
    } catch (e) {
        console.error('Embedding generation failed:', e);
        return [];
    }
}
