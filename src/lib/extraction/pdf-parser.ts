import fs from 'fs/promises';

// Next.js server-side dynamic require for pdf-parse
const pdfParse = require('pdf-parse');

/**
 * Extracts raw text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
    try {
        const data = await pdfParse(pdfBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF parsing failed:', error);
        throw error;
    }
}
