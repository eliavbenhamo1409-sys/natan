import { PDFDocument, PDFName, PDFStream, PDFNumber } from 'pdf-lib';
import sharp from 'sharp';
import { inflateSync } from 'zlib';

export interface ExtractedImage {
    buffer: Buffer;
    mimeType: string;
}

function tryInflate(buf: Buffer): Buffer {
    try {
        return inflateSync(buf);
    } catch {
        return buf;
    }
}

/**
 * Extracts the largest embedded RGB image from a PDF,
 * decompresses FlateDecode, reconstructs raw pixels, returns PNG.
 */
export async function extractLargestImageFromPdf(pdfBuffer: Buffer): Promise<ExtractedImage | null> {
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        if (pdfDoc.getPages().length === 0) return null;

        interface CandidateImage {
            bytes: Uint8Array;
            width: number;
            height: number;
            channels: 1 | 3 | 4;
            pixelCount: number;
            isCompressed: boolean;
        }

        let best: CandidateImage | null = null;

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
            if (width === 0 || height === 0) continue;

            const csRaw = dict.lookup(PDFName.of('ColorSpace'));
            let channels: 1 | 3 | 4 = 3;
            if (csRaw === PDFName.of('DeviceGray')) channels = 1;
            else if (csRaw === PDFName.of('DeviceCMYK')) channels = 4;

            // Skip grayscale masks — prefer the RGB counterpart at the same size
            if (channels === 1) continue;

            const filter = dict.lookup(PDFName.of('Filter'));
            const isCompressed = filter === PDFName.of('FlateDecode');

            const pixelCount = width * height;
            if (!best || pixelCount > best.pixelCount) {
                best = { bytes: rawBytes, width, height, channels, pixelCount, isCompressed };
            }
        }

        if (!best) return null;

        let pixelData: Buffer;
        const rawBuf = Buffer.from(best.bytes);

        if (best.isCompressed) {
            pixelData = tryInflate(rawBuf);
            console.log(`[image-extractor] Decompressed ${rawBuf.length} → ${pixelData.length} bytes`);
        } else {
            pixelData = rawBuf;
        }

        const expectedSize = best.width * best.height * best.channels;

        let pngBuffer: Buffer;

        if (pixelData.length >= expectedSize) {
            pngBuffer = await sharp(pixelData.subarray(0, expectedSize), {
                raw: { width: best.width, height: best.height, channels: best.channels },
            }).png().toBuffer();
            console.log(`[image-extractor] Reconstructed ${best.width}x${best.height}x${best.channels} → PNG`);
        } else {
            // Might be JPEG/PNG inside
            try {
                pngBuffer = await sharp(pixelData).png().toBuffer();
                console.log(`[image-extractor] Auto-detected format (${pixelData.length} bytes)`);
            } catch {
                console.log(`[image-extractor] Cannot decode: ${pixelData.length} bytes, expected ${expectedSize}`);
                return null;
            }
        }

        return { buffer: pngBuffer, mimeType: 'image/png' };
    } catch (error) {
        console.error('[image-extractor] Extraction failed:', error);
        return null;
    }
}
