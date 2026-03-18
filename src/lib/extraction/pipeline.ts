import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { extractProjectFieldsFromPdf, generateEmbedding, getProductBoundingBox, generateCatalogDescription } from './gemini';
import { extractLargestImageFromPdf } from './image-extractor';
import { prisma } from '@/lib/db';

async function extractAndCropProductImage(pdfBuffer: Buffer, projectId: string): Promise<string | null> {
    const extracted = await extractLargestImageFromPdf(pdfBuffer);
    if (!extracted) {
        console.log('[pipeline] No embedded images found in PDF');
        return null;
    }

    console.log(`[pipeline] Extracted image: ${extracted.buffer.length} bytes`);

    const bbox = await getProductBoundingBox(extracted.buffer, extracted.mimeType);

    const imageDir = path.join(process.cwd(), 'uploads', 'images');
    await fs.mkdir(imageDir, { recursive: true });
    const outputPath = path.join(imageDir, `${projectId}.png`);

    if (bbox) {
        const metadata = await sharp(extracted.buffer).metadata();
        const imgW = metadata.width || 1;
        const imgH = metadata.height || 1;

        const left = Math.max(0, Math.round((bbox.xmin / 1000) * imgW));
        const top = Math.max(0, Math.round((bbox.ymin / 1000) * imgH));
        const right = Math.min(imgW, Math.round((bbox.xmax / 1000) * imgW));
        const bottom = Math.min(imgH, Math.round((bbox.ymax / 1000) * imgH));
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);

        console.log(`[pipeline] Cropping product: [${left},${top} ${width}x${height}] from ${imgW}x${imgH}`);

        await sharp(extracted.buffer)
            .extract({ left, top, width, height })
            .png()
            .toFile(outputPath);
    } else {
        console.log('[pipeline] No bounding box detected, saving full image');
        await fs.writeFile(outputPath, extracted.buffer);
    }

    return `/api/files/images/${projectId}`;
}

export const pipeline = {
    async processProject(projectId: string) {
        console.log(`[pipeline] Starting processing for project ${projectId}`);

        try {
            await prisma.project.update({
                where: { id: projectId },
                data: { extractionStatus: 'processing' },
            });

            const pdfPath = path.join(process.cwd(), 'uploads', 'pdfs', `${projectId}.pdf`);
            const pdfBuffer = await fs.readFile(pdfPath);

            const { structured, rawOutput } = await extractProjectFieldsFromPdf(pdfBuffer);

            const productImageUrl = await extractAndCropProductImage(pdfBuffer, projectId);

            let productImageBuffer: Buffer | undefined;
            if (productImageUrl) {
                const imgPath = path.join(process.cwd(), 'uploads', 'images', `${projectId}.png`);
                try { productImageBuffer = await fs.readFile(imgPath); } catch {}
            }

            console.log(`[pipeline] Generating AI catalog description...`);
            const catalogDescription = await generateCatalogDescription(structured, productImageBuffer);
            console.log(`[pipeline] Catalog: ${catalogDescription.substring(0, 100)}...`);

            const embedText = [
                structured.sku,
                structured.customerName,
                structured.workOrderNumber,
                structured.productDescription,
                structured.voltage,
                structured.powerKw ? `${structured.powerKw}kW` : '',
                structured.configuration,
                catalogDescription,
            ].filter(Boolean).join(' ');

            let embeddingValues: number[] = [];
            if (embedText.trim().length > 0) {
                embeddingValues = await generateEmbedding(embedText);
            }

            const isPartial = !structured.sku && !structured.workOrderNumber;

            await prisma.$transaction(async (tx) => {
                await tx.project.update({
                    where: { id: projectId },
                    data: {
                        drawingDate: structured.drawingDate,
                        plannerName: structured.plannerName,
                        customerName: structured.customerName,
                        workOrderNumber: structured.workOrderNumber,
                        sku: structured.sku,
                        productDescription: structured.productDescription,
                        voltage: structured.voltage,
                        powerKw: structured.powerKw,
                        quantity: structured.quantity,
                        configuration: structured.configuration,
                        sheetNumber: structured.sheetNumber,
                        totalSheets: structured.totalSheets,
                        scale: structured.scale,
                        thermostat: structured.thermostat || false,
                        mainSwitch: structured.mainSwitch || false,
                        technicalDimensions: structured.technicalDimensions ? JSON.stringify(structured.technicalDimensions) : null,
                        productImageUrl,
                        extractionConfidence: structured.extractionConfidence,
                        rawExtractedText: catalogDescription || null,
                        rawExtractedJson: rawOutput,
                        extractionStatus: isPartial ? 'partial' : 'completed',
                    },
                });

                if (embeddingValues.length > 0) {
                    await tx.projectEmbedding.upsert({
                        where: { projectId },
                        update: { embedding: JSON.stringify(embeddingValues) },
                        create: {
                            projectId,
                            embedding: JSON.stringify(embeddingValues),
                        },
                    });
                }
            });

            console.log(`[pipeline] Processing complete for project ${projectId}`);

        } catch (error) {
            console.error(`[pipeline] Failed for project ${projectId}:`, error);

            await prisma.project.update({
                where: { id: projectId },
                data: { extractionStatus: 'failed' },
            }).catch(console.error);
        }
    },
};
