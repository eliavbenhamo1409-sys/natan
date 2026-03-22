import { extractProjectFieldsFromPdf, generateEmbedding, selectBestProductImage, getProductBoundingBox, generateCatalogDescription } from './gemini';
import { extractAllImagesFromPdf } from './image-extractor';
import { prisma } from '@/lib/db';
import { uploadImage, downloadPdf } from '@/lib/storage';

async function extractAndCropProductImage(pdfBuffer: Buffer, projectId: string): Promise<{ url: string; buffer: Buffer } | null> {
    const sharp = (await import('sharp')).default;
    const allImages = await extractAllImagesFromPdf(pdfBuffer, 5);
    console.log(`[pipeline] Extracted ${allImages.length} images from PDF`);

    if (allImages.length === 0) {
        console.log('[pipeline] No images found in PDF');
        return null;
    }

    let chosenBuffer: Buffer;
    let bbox: { ymin: number; xmin: number; ymax: number; xmax: number } | null = null;

    if (allImages.length === 1) {
        console.log('[pipeline] Single image — sending for bbox detection');
        chosenBuffer = allImages[0].buffer;
        bbox = await getProductBoundingBox(chosenBuffer, allImages[0].mimeType);
    } else {
        console.log(`[pipeline] ${allImages.length} images — asking AI to select best 3D render`);
        const selection = await selectBestProductImage(allImages);

        if (selection) {
            chosenBuffer = allImages[selection.index].buffer;
            bbox = selection.bbox;
            console.log(`[pipeline] AI selected image ${selection.index + 1}/${allImages.length}`);
        } else {
            console.log('[pipeline] AI selection failed, falling back to largest image');
            chosenBuffer = allImages[0].buffer;
            bbox = await getProductBoundingBox(chosenBuffer, allImages[0].mimeType);
        }
    }

    if (bbox) {
        const metadata = await sharp(chosenBuffer).metadata();
        const imgW = metadata.width || 1;
        const imgH = metadata.height || 1;

        const left = Math.max(0, Math.round((bbox.xmin / 1000) * imgW));
        const top = Math.max(0, Math.round((bbox.ymin / 1000) * imgH));
        const right = Math.min(imgW, Math.round((bbox.xmax / 1000) * imgW));
        const bottom = Math.min(imgH, Math.round((bbox.ymax / 1000) * imgH));
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);

        console.log(`[pipeline] Cropping product: [${left},${top} ${width}x${height}] from ${imgW}x${imgH}`);

        const pngBuf = await sharp(chosenBuffer)
            .extract({ left, top, width, height })
            .png()
            .toBuffer();
        const url = await uploadImage(`${projectId}.png`, pngBuf);
        return { url, buffer: pngBuf };
    } else {
        console.log('[pipeline] No bbox, saving selected image as-is');
        const pngBuf = await sharp(chosenBuffer).png().toBuffer();
        const url = await uploadImage(`${projectId}.png`, pngBuf);
        return { url, buffer: pngBuf };
    }
}

export const pipeline = {
    async processProject(projectId: string, pdfBuffer?: Buffer) {
        console.log(`[pipeline] Starting processing for project ${projectId}`);
        const t0 = Date.now();

        try {
            await prisma.project.update({
                where: { id: projectId },
                data: { extractionStatus: 'processing' },
            });

            if (!pdfBuffer) {
                pdfBuffer = await downloadPdf(`${projectId}.pdf`);
            }

            // Run field extraction and image extraction in PARALLEL
            const [fieldsResult, imageResult] = await Promise.all([
                extractProjectFieldsFromPdf(pdfBuffer),
                extractAndCropProductImage(pdfBuffer, projectId),
            ]);
            console.log(`[pipeline] Parallel extraction done in ${Date.now() - t0}ms`);

            const { structured, rawOutput } = fieldsResult;
            const productImageUrl = imageResult?.url || null;
            const productImageBuffer = imageResult?.buffer;

            // Catalog description (needs structured + image)
            const catalogDescription = await generateCatalogDescription(structured, productImageBuffer);

            // Embedding
            const embedText = [
                structured.sku, structured.customerName, structured.workOrderNumber,
                structured.productDescription, structured.voltage,
                structured.powerKw ? `${structured.powerKw}kW` : '',
                structured.configuration, catalogDescription,
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

            console.log(`[pipeline] Processing complete for ${projectId} in ${Date.now() - t0}ms`);

        } catch (error) {
            console.error(`[pipeline] Failed for project ${projectId}:`, error);

            await prisma.project.update({
                where: { id: projectId },
                data: { extractionStatus: 'failed' },
            }).catch(console.error);
        }
    },
};
