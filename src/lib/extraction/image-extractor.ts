import { PDFDocument, PDFName, PDFStream, PDFNumber } from 'pdf-lib';
import sharp from 'sharp';
import { inflateSync } from 'zlib';

export interface ExtractedImage {
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
}

function tryInflate(buf: Buffer): Buffer {
    try {
        return inflateSync(buf);
    } catch {
        return buf;
    }
}

interface CandidateImage {
    bytes: Uint8Array;
    width: number;
    height: number;
    channels: 1 | 3 | 4;
    pixelCount: number;
    isCompressed: boolean;
}

async function candidateToPng(c: CandidateImage): Promise<Buffer | null> {
    const rawBuf = Buffer.from(c.bytes);
    const pixelData = c.isCompressed ? tryInflate(rawBuf) : rawBuf;
    const expectedSize = c.width * c.height * c.channels;

    if (pixelData.length >= expectedSize) {
        return sharp(pixelData.subarray(0, expectedSize), {
            raw: { width: c.width, height: c.height, channels: c.channels },
        }).png().toBuffer();
    }
    try {
        return await sharp(pixelData).png().toBuffer();
    } catch {
        return null;
    }
}

/**
 * Extracts ALL meaningful embedded images from a PDF (RGB/CMYK, min 150x150).
 * Returns sorted by pixel count descending, capped at `limit`.
 */
export async function extractAllImagesFromPdf(pdfBuffer: Buffer, limit = 5): Promise<ExtractedImage[]> {
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        if (pdfDoc.getPages().length === 0) return [];

        const candidates: CandidateImage[] = [];

        for (const [, object] of pdfDoc.context.enumerateIndirectObjects()) {
            if (!(object instanceof PDFStream)) continue;
            const dict = object.dict;
            if (
                dict.lookup(PDFName.of('Type')) !== PDFName.of('XObject') ||
                dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')
            ) continue;

            const rawBytes = object.getContents();
            if (!rawBytes || rawBytes.length === 0) continue;

            const wObj = dict.lookup(PDFName.of('Width'));
            const hObj = dict.lookup(PDFName.of('Height'));
            const width = wObj instanceof PDFNumber ? wObj.asNumber() : 0;
            const height = hObj instanceof PDFNumber ? hObj.asNumber() : 0;
            if (width < 150 || height < 150) continue;

            const csRaw = dict.lookup(PDFName.of('ColorSpace'));
            let channels: 1 | 3 | 4 = 3;
            if (csRaw === PDFName.of('DeviceGray')) channels = 1;
            else if (csRaw === PDFName.of('DeviceCMYK')) channels = 4;
            if (channels === 1) continue;

            const filter = dict.lookup(PDFName.of('Filter'));
            const isCompressed = filter === PDFName.of('FlateDecode');
            const pixelCount = width * height;

            candidates.push({ bytes: rawBytes, width, height, channels, pixelCount, isCompressed });
        }

        candidates.sort((a, b) => b.pixelCount - a.pixelCount);
        const top = candidates.slice(0, limit);

        const results: ExtractedImage[] = [];
        for (const c of top) {
            const png = await candidateToPng(c);
            if (png) {
                results.push({ buffer: png, mimeType: 'image/png', width: c.width, height: c.height });
                console.log(`[image-extractor] Extracted ${c.width}x${c.height} (${png.length} bytes)`);
            }
        }

        return results;
    } catch (error) {
        console.error('[image-extractor] Extraction failed:', error);
        return [];
    }
}

export async function extractLargestImageFromPdf(pdfBuffer: Buffer): Promise<ExtractedImage | null> {
    const all = await extractAllImagesFromPdf(pdfBuffer, 1);
    return all[0] || null;
}
