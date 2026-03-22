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

const BBOX_PROMPT = `You are a precision image analyst for a factory product management system.
Your task: find the 3D product rendering/photo in this technical drawing and return its EXACT bounding box.

WHAT TO LOOK FOR:
- The product is typically a 3D isometric or perspective render, often in grayscale/silver color
- It is usually located in the TOP-RIGHT area of the page (but not always)
- It shows the complete manufactured item (e.g., industrial heater, enclosure, panel, motor, cabinet)
- It is NOT a 2D schematic, NOT dimension lines, NOT a cross-section view

CRITICAL RULES FOR BOUNDING BOX ACCURACY:
1. Include the ENTIRE object — every single pixel that belongs to the product
2. Include ALL protruding parts: small roofs, canopies, overhangs, fins, handles, legs, bases, mounting brackets, cables, connectors, vents, screws, labels on the product
3. Include shadows or reflections that are part of the product rendering
4. DO NOT clip any edges — if there is a thin antenna, pipe, or wire sticking out, the box MUST include it fully
5. Add a small safety margin (~2-3% on each side) beyond the outermost pixels of the product
6. Better to be slightly TOO LARGE than to cut off ANY detail

WHAT TO EXCLUDE (do NOT include in the bounding box):
- Title block, border frame, text labels, dimension lines/arrows
- Company logos, revision tables, drawing notes
- Other separate 2D views or cross-section drawings

Coordinates are normalized 0-1000 (0,0 = top-left, 1000,1000 = bottom-right).
If no 3D product rendering is found, set found=false.`;

const selectAndBboxSchema = {
    type: 'object' as const,
    properties: {
        selectedImage: { type: 'integer', description: 'The 1-based index of the image that best shows the 3D product render.' },
        found: { type: 'boolean', description: 'True if a suitable 3D product render was found among the images.' },
        ymin: { type: 'integer', description: 'Top edge of the product bounding box within the selected image (0-1000).' },
        xmin: { type: 'integer', description: 'Left edge (0-1000).' },
        ymax: { type: 'integer', description: 'Bottom edge (0-1000).' },
        xmax: { type: 'integer', description: 'Right edge (0-1000).' },
    },
    required: ['selectedImage', 'found'],
};

const SELECT_PROMPT = `You are analyzing multiple images extracted from a single factory manufacturing PDF.
Your task: identify which image contains the BEST 3D product rendering and return its precise bounding box.

HOW TO CHOOSE THE RIGHT IMAGE:
- Look for the 3D isometric/perspective rendering of the manufactured product
- It typically shows the COMPLETE product with all components: body, roof/canopy, legs, handles, panels, doors, vents, accessories
- Prefer the view that shows the MOST COMPLETE version of the product (with all attachments like canopies, covers, etc.)
- It's usually grayscale/silver metallic color
- Do NOT choose a 2D technical schematic, cross-section, or exploded view
- If multiple 3D renders exist, choose the one showing the product most completely (with roof, canopy, all accessories visible)

BOUNDING BOX RULES (within the selected image):
1. Include the ENTIRE product — every pixel, every protruding detail
2. Include: roofs, canopies, overhangs, glass panels, support poles, handles, legs, bases, wheels, cables, vents, screws, brackets
3. DO NOT cut any edge — if there's a thin element sticking out, include it fully
4. Add ~3% safety margin beyond the outermost pixels on each side
5. Better TOO LARGE than cutting off ANY detail

Coordinates normalized 0-1000 (0,0 = top-left of the selected image).
Return selectedImage as 1-based index (1 = first image, 2 = second, etc.).`;

export async function selectBestProductImage(
    images: { buffer: Buffer; mimeType: string }[]
): Promise<{ index: number; bbox: BoundingBox | null } | null> {
    if (images.length === 0) return null;

    try {
        const ai = getAI();

        const parts: any[] = [{ text: SELECT_PROMPT }];
        images.forEach((img, i) => {
            parts.push({ text: `\n--- Image ${i + 1} of ${images.length} ---` });
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.buffer.toString('base64'),
                },
            });
        });

        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts }],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                responseMimeType: 'application/json',
                responseJsonSchema: selectAndBboxSchema,
            },
        });

        const text = result.text;
        if (!text) return null;

        const parsed = JSON.parse(text);
        if (!parsed.found) return null;

        const idx = (parsed.selectedImage || 1) - 1;
        if (idx < 0 || idx >= images.length) return null;

        const PAD = 30;
        const bbox: BoundingBox | null = parsed.ymin != null ? {
            ymin: Math.max(0, parsed.ymin - PAD),
            xmin: Math.max(0, parsed.xmin - PAD),
            ymax: Math.min(1000, parsed.ymax + PAD),
            xmax: Math.min(1000, parsed.xmax + PAD),
        } : null;

        console.log(`[gemini] Selected image ${idx + 1}/${images.length}, bbox: ${JSON.stringify(bbox)}`);
        return { index: idx, bbox };
    } catch (e) {
        console.error('Product image selection failed:', e);
        return null;
    }
}

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
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                responseMimeType: 'application/json',
                responseJsonSchema: bboxSchema,
            },
        });

        const text = result.text;
        if (!text) return null;

        const parsed = JSON.parse(text);
        if (!parsed.found || parsed.ymin == null) return null;

        const PAD = 30;
        return {
            ymin: Math.max(0, parsed.ymin - PAD),
            xmin: Math.max(0, parsed.xmin - PAD),
            ymax: Math.min(1000, parsed.ymax + PAD),
            xmax: Math.min(1000, parsed.xmax + PAD),
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

const excelMappingSchema = {
    type: 'object' as const,
    properties: {
        mapping: {
            type: 'array' as const,
            items: {
                type: 'object' as const,
                properties: {
                    excelColumn: { type: 'string', description: 'The exact Excel column header as provided.' },
                    dbField: {
                        type: 'string',
                        description: 'The database field name to map to, or "skip" if not relevant.',
                        enum: [
                            'sku', 'customerName', 'workOrderNumber', 'productDescription',
                            'plannerName', 'drawingDate', 'voltage', 'powerKw',
                            'quantity', 'configuration', 'scale', 'skip',
                        ],
                    },
                    confidence: { type: 'number', description: 'Confidence score 0.0-1.0.' },
                    reasoning: { type: 'string', description: 'Brief explanation for this mapping decision.' },
                },
                required: ['excelColumn', 'dbField', 'confidence'],
            },
        },
    },
    required: ['mapping'],
};

const EXCEL_MAPPING_PROMPT = `You are a data mapping expert for a factory product management system.
Your job: map Excel column headers from an old factory table to the correct database fields.

DATABASE FIELDS (and what they mean):
- sku: Product catalog number / part number. Hebrew: מק"ט, מקט, פריט, מספר פריט, קטלוג
- customerName: Customer name. Hebrew: לקוח, שם לקוח, שם חברה
- workOrderNumber: Work order / job number. Hebrew: פקע"ת, פקע, מס הזמנה, הזמנה, מס' הזמנה
- productDescription: Product description / what was manufactured. Hebrew: תיאור, תאור, תיאור הפריט, תיאור מוצר, שם פריט
- plannerName: The engineer/planner/drafter name. Hebrew: מתכנן, שרטט, תכנון, שם מתכנן
- drawingDate: Date of the drawing or order. Hebrew: תאריך, תאריך שרטוט, תאריך הזמנה
- voltage: Electrical voltage specification. Hebrew: מתח, וולטאז', V
- powerKw: Power in kilowatts (numeric). Hebrew: הספק, kW, קילוואט
- quantity: How many units (integer). Hebrew: כמות, יחידות, כמות מוזמנת
- configuration: Product configuration type. Hebrew: תצורה, קונפיגורציה, דגם
- scale: Drawing scale. Hebrew: קנ"מ, קנה מידה
- rowNumber: Original row/line number from the table. Hebrew: מס שורה, מספר שורה, שורה, מס', מספר

CRITICAL RULES:
1. WATCH OUT for similar Hebrew words:
   - מתח (voltage) vs מתכנן (planner) — these look similar but are COMPLETELY different!
   - תיאור/תאור (description) — both are valid spellings of the same word
   - פקע (work order abbreviation) is NOT the same as פריט (item/sku)
   - מק"ט (sku) contains quotes, don't confuse with מס' (number)
2. Some columns may combine Hebrew and English text — analyze the content carefully
3. Numeric data: powerKw should be numbers in kW, quantity should be integers
4. If a column header is ambiguous, look at the SAMPLE DATA to decide
5. If a column doesn't match any field, map it to "skip"
6. Each database field should be mapped AT MOST ONCE — if two columns seem to match the same field, choose the best one
7. Watch for columns that contain concatenated data (e.g., "400V 3~ 50Hz" is voltage, not multiple fields)`;

export async function mapExcelColumns(
    headers: string[],
    sampleRows: Record<string, any>[],
): Promise<{ excelColumn: string; dbField: string; confidence: number; reasoning?: string }[]> {
    try {
        const ai = getAI();

        const sampleStr = sampleRows.slice(0, 5).map((row, i) =>
            `Row ${i + 1}: ${headers.map(h => `[${h}] = "${row[h] ?? ''}"`).join(' | ')}`
        ).join('\n');

        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{
                parts: [
                    { text: EXCEL_MAPPING_PROMPT },
                    { text: `\nEXCEL COLUMN HEADERS:\n${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}` },
                    { text: `\nSAMPLE DATA (first rows):\n${sampleStr}` },
                ],
            }],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                responseMimeType: 'application/json',
                responseJsonSchema: excelMappingSchema,
            },
        });

        const text = result.text;
        if (!text) return [];

        const parsed = JSON.parse(text);
        return (parsed.mapping || []).filter((m: any) => m.dbField !== 'skip' && m.confidence >= 0.4);
    } catch (e) {
        console.error('Excel column mapping failed:', e);
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
