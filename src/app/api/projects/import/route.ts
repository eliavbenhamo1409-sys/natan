import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';
import { mapExcelColumns, generateCatalogDescription, generateEmbedding } from '@/lib/extraction/gemini';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Extract images from XLSX with exact row mapping via the Rich Data chain:
 * cell vm="N" → rdrichvalue.xml[N] → richValueRel.xml[idx] → .rels → media file.
 *
 * Returns Map<excelRow, Buffer> where excelRow is 1-based.
 * For sheet_to_json rows[i], the corresponding excelRow = i + 2 (row 1 = header).
 */
function extractExcelImages(xlsxBuffer: Buffer): Map<number, Buffer> {
    const images = new Map<number, Buffer>();
    try {
        const zip = new AdmZip(xlsxBuffer);
        const allEntries = zip.getEntries();

        const mediaFiles = new Map<string, Buffer>();
        for (const entry of allEntries) {
            if (entry.entryName.startsWith('xl/media/')) {
                mediaFiles.set(entry.entryName, entry.getData());
            }
        }
        if (mediaFiles.size === 0) {
            console.log('[excel-images] No media files');
            return images;
        }
        console.log(`[excel-images] ${mediaFiles.size} total media files`);

        const getEntry = (name: string) => allEntries.find(e => e.entryName === name);

        // ── Rich Data chain (Excel "Place in Cell" images) ──
        const relsEntry = getEntry('xl/richData/_rels/richValueRel.xml.rels');
        const rvRelEntry = getEntry('xl/richData/richValueRel.xml');
        const rdEntry = getEntry('xl/richData/rdrichvalue.xml');
        const sheetEntry = getEntry('xl/worksheets/sheet1.xml');

        if (relsEntry && rvRelEntry && rdEntry && sheetEntry) {
            // Step 1: rId → media file path
            const relsXml = relsEntry.getData().toString('utf-8');
            const ridToMedia = new Map<string, string>();
            const relTagRe = /<Relationship[^>]+>/g;
            let relMatch;
            while ((relMatch = relTagRe.exec(relsXml)) !== null) {
                const tag = relMatch[0];
                const idM = tag.match(/Id="([^"]+)"/);
                const targetM = tag.match(/Target="([^"]+)"/);
                if (!idM || !targetM) continue;
                let target = targetM[1];
                if (target.startsWith('../')) target = 'xl/' + target.slice(3);
                else if (target.startsWith('/')) target = target.slice(1);
                else if (!target.startsWith('xl/')) target = 'xl/richData/' + target;
                ridToMedia.set(idM[1], target);
            }
            console.log(`[excel-images] Step 1: ${ridToMedia.size} rId→media mappings`);

            // Step 2: richValueRel.xml — ordered list of rId references (index → rId)
            const rvRelXml = rvRelEntry.getData().toString('utf-8');
            const relEntries: (string | null)[] = [];
            const rvRelItemRe = /<rel[^>]*>/gi;
            let rvRelMatch;
            while ((rvRelMatch = rvRelItemRe.exec(rvRelXml)) !== null) {
                const tag = rvRelMatch[0];
                const idAttr = tag.match(/(?:r:id|id)="([^"]+)"/i);
                relEntries.push(idAttr ? idAttr[1] : null);
            }
            console.log(`[excel-images] Step 2: ${relEntries.length} richValueRel entries`);

            // Step 3: rdrichvalue.xml — each <rv> has <v> children; one references relEntries index
            const rdXml = rdEntry.getData().toString('utf-8');
            const vmToMedia = new Map<number, string>();
            const rvBlockRe = /<rv\b[^>]*>([\s\S]*?)<\/rv>/g;
            let rvIdx = 0;
            let rvBlock;
            while ((rvBlock = rvBlockRe.exec(rdXml)) !== null) {
                const vRe = /<v>(\d+)<\/v>/g;
                let vMatch;
                while ((vMatch = vRe.exec(rvBlock[1])) !== null) {
                    const relIdx = parseInt(vMatch[1], 10);
                    if (relIdx < relEntries.length && relEntries[relIdx]) {
                        const rId = relEntries[relIdx]!;
                        const mediaPath = ridToMedia.get(rId);
                        if (mediaPath && mediaFiles.has(mediaPath)) {
                            vmToMedia.set(rvIdx, mediaPath);
                            break;
                        }
                    }
                }
                rvIdx++;
            }
            console.log(`[excel-images] Step 3: ${vmToMedia.size} vm→media mappings`);

            // Step 4: sheet1.xml — find cells with vm="N", extract excel row number
            const sheetXml = sheetEntry.getData().toString('utf-8');
            const cellVmRe = /<c\s[^>]*?r="[A-Z]+(\d+)"[^>]*?vm="(\d+)"/g;
            const cellVmRe2 = /<c\s[^>]*?vm="(\d+)"[^>]*?r="[A-Z]+(\d+)"/g;
            const rowToVm = new Map<number, number>();

            let cellMatch;
            while ((cellMatch = cellVmRe.exec(sheetXml)) !== null) {
                const excelRow = parseInt(cellMatch[1], 10);
                const vmIdx = parseInt(cellMatch[2], 10);
                if (!rowToVm.has(excelRow)) rowToVm.set(excelRow, vmIdx);
            }
            while ((cellMatch = cellVmRe2.exec(sheetXml)) !== null) {
                const vmIdx = parseInt(cellMatch[1], 10);
                const excelRow = parseInt(cellMatch[2], 10);
                if (!rowToVm.has(excelRow)) rowToVm.set(excelRow, vmIdx);
            }
            console.log(`[excel-images] Step 4: ${rowToVm.size} cells with vm attribute`);

            // Step 5: Combine — excelRow → vm → media → buffer
            for (const [excelRow, vmIdx] of rowToVm) {
                const mediaPath = vmToMedia.get(vmIdx);
                if (mediaPath) {
                    const buf = mediaFiles.get(mediaPath);
                    if (buf) images.set(excelRow, buf);
                }
            }
            console.log(`[excel-images] Rich Data chain: ${images.size} images mapped`);
            if (images.size > 0) return images;
        }

        // ── Fallback: Drawing anchors ──
        for (const entry of allEntries) {
            const eName = entry.entryName;
            if (!eName.includes('drawing') || !eName.endsWith('.xml') || eName.includes('_rels')) continue;

            const drawRelsPath = eName.replace(/([^/]+)\.xml$/, '_rels/$1.xml.rels');
            const drawRelsEntry = getEntry(drawRelsPath);
            const drawRIdToFile = new Map<string, string>();
            if (drawRelsEntry) {
                const dRelXml = drawRelsEntry.getData().toString('utf-8');
                const dRelRegex = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
                let drm;
                while ((drm = dRelRegex.exec(dRelXml)) !== null) {
                    let target = drm[2];
                    const basePath = eName.replace(/[^/]+$/, '');
                    if (target.startsWith('../')) {
                        target = basePath.replace(/[^/]+\/$/, '') + target.slice(3);
                    } else if (!target.startsWith('xl/')) {
                        target = basePath + target;
                    }
                    drawRIdToFile.set(drm[1], target);
                }
            }

            const drawXml = entry.getData().toString('utf-8');
            const anchorRegex = /<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g;
            let anchorMatch;
            while ((anchorMatch = anchorRegex.exec(drawXml)) !== null) {
                const block = anchorMatch[1];
                const fromRowMatch = block.match(/<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
                if (!fromRowMatch) continue;
                const row = parseInt(fromRowMatch[1], 10);
                const embedMatch = block.match(/r:embed="(rId\d+)"/);
                if (!embedMatch) continue;
                const filePath = drawRIdToFile.get(embedMatch[1]);
                if (!filePath) continue;
                const imgBuf = mediaFiles.get(filePath);
                if (imgBuf && !images.has(row)) images.set(row, imgBuf);
            }
        }

        if (images.size > 0) {
            console.log(`[excel-images] Drawing anchors: ${images.size} images`);
            return images;
        }

        console.log('[excel-images] No images could be mapped');
    } catch (err) {
        console.error('[excel-images] Error:', err);
    }
    return images;
}

function cleanValue(val: any): string {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim();
    if (s === '-' || s === 'N/A' || s === 'n/a' || s === '#N/A') return '';
    return s;
}

export async function POST(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const filename = decodeURIComponent(request.headers.get('x-filename') || 'upload.xlsx');
        const name = filename.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
            return NextResponse.json({ error: 'Supported formats: xlsx, xls, csv' }, { status: 400 });
        }

        const bytes = await request.arrayBuffer();
        if (!bytes || bytes.byteLength === 0) {
            return NextResponse.json({ error: 'No file data received' }, { status: 400 });
        }
        console.log(`[excel-import] Received ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB file: ${filename}`);
        const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return NextResponse.json({ error: 'Empty workbook' }, { status: 400 });
        }

        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (rows.length === 0) {
            return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
        }

        const headers = Object.keys(rows[0]);
        console.log(`[excel-import] ${rows.length} rows, headers: ${headers.join(', ')}`);

        const aiMapping = await mapExcelColumns(headers, rows);
        console.log(`[excel-import] AI mapping: ${aiMapping.map(m => `"${m.excelColumn}" → ${m.dbField} (${(m.confidence * 100).toFixed(0)}%)`).join(', ')}`);

        if (aiMapping.length === 0) {
            return NextResponse.json({
                error: 'Could not match any columns. Try with a file that has headers like: מק"ט, לקוח, פקע"ת, תיאור, מתכנן, תאריך',
                detectedHeaders: headers,
            }, { status: 400 });
        }

        const usedFields = new Set<string>();
        const deduped = new Map<string, string>();
        for (const m of aiMapping.sort((a, b) => b.confidence - a.confidence)) {
            if (usedFields.has(m.dbField)) continue;
            usedFields.add(m.dbField);
            deduped.set(m.excelColumn, m.dbField);
        }

        const rowNumColKey = headers.find(k =>
            /מס.?שורה/i.test(k) || /row.?num/i.test(k) || /^#$/i.test(k.trim()) || /^מספר$/i.test(k.trim())
        );
        if (rowNumColKey) {
            console.log(`[excel-import] Row number column detected: "${rowNumColKey}"`);
        }

        const rawBuffer = Buffer.from(bytes);
        const excelImages = extractExcelImages(rawBuffer);
        const imageDir = path.join(process.cwd(), 'uploads', 'images');
        await mkdir(imageDir, { recursive: true });

        let imported = 0;
        let skipped = 0;
        const importedIds: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const data: Record<string, any> = {};

            for (const [excelCol, dbField] of deduped.entries()) {
                const raw = row[excelCol];
                const val = cleanValue(raw);
                if (!val) continue;

                switch (dbField) {
                    case 'powerKw': {
                        const num = parseFloat(val.replace(/[^\d.,-]/g, '').replace(',', '.'));
                        if (!isNaN(num)) data[dbField] = num;
                        break;
                    }
                    case 'quantity': {
                        const num = parseInt(val.replace(/[^\d]/g, ''), 10);
                        if (!isNaN(num) && num > 0) data[dbField] = num;
                        break;
                    }
                    default:
                        data[dbField] = val;
                }
            }

            if (Object.keys(data).length === 0) {
                skipped++;
                continue;
            }

            if (rowNumColKey) {
                const rn = cleanValue(row[rowNumColKey]);
                if (rn) data.rowNumber = rn;
            }
            if (!data.rowNumber) {
                data.rowNumber = String(i + 1);
            }

            const projectId = uuidv4();

            let productImageUrl: string | null = null;
            const excelRow = i + 2; // rows[0] = Excel row 2 (row 1 = header)
            const imgBuf = excelImages.get(excelRow);
            if (imgBuf) {
                try {
                    const sharp = (await import('sharp')).default;
                    const pngBuf = await sharp(imgBuf).png().toBuffer();
                    const imgPath = path.join(imageDir, `${projectId}.png`);
                    await writeFile(imgPath, pngBuf);
                    productImageUrl = `/api/files/images/${projectId}`;
                } catch {}
            }

            await prisma.project.create({
                data: {
                    id: projectId,
                    ...data,
                    productImageUrl,
                    uploadedBy: user.userId,
                    extractionStatus: 'completed',
                },
            });

            imported++;
            importedIds.push(projectId);
        }

        generateEmbeddingsForImported(importedIds).catch(console.error);

        return NextResponse.json({
            imported,
            skipped,
            total: rows.length,
            mappedColumns: aiMapping.map(m => ({
                from: m.excelColumn,
                to: m.dbField,
                confidence: m.confidence,
                reasoning: m.reasoning,
            })),
        });

    } catch (error) {
        console.error('Excel import errored:', error);
        return NextResponse.json({ error: 'Failed to import file' }, { status: 500 });
    }
}

async function generateEmbeddingsForImported(projectIds: string[]) {
    for (const id of projectIds) {
        try {
            const project = await prisma.project.findUnique({ where: { id } });
            if (!project) continue;

            const catalogDescription = await generateCatalogDescription({
                sku: project.sku,
                customerName: project.customerName,
                workOrderNumber: project.workOrderNumber,
                productDescription: project.productDescription,
                voltage: project.voltage,
                powerKw: project.powerKw,
                plannerName: project.plannerName,
                configuration: project.configuration,
            });

            const embedText = [
                project.sku, project.customerName, project.workOrderNumber,
                project.productDescription, project.voltage,
                project.powerKw ? `${project.powerKw}kW` : '',
                project.configuration, catalogDescription,
            ].filter(Boolean).join(' ');

            let embeddingValues: number[] = [];
            if (embedText.trim()) {
                embeddingValues = await generateEmbedding(embedText);
            }

            await prisma.$transaction(async (tx) => {
                await tx.project.update({
                    where: { id },
                    data: { rawExtractedText: catalogDescription || null },
                });
                if (embeddingValues.length > 0) {
                    await tx.projectEmbedding.upsert({
                        where: { projectId: id },
                        update: { embedding: JSON.stringify(embeddingValues) },
                        create: { projectId: id, embedding: JSON.stringify(embeddingValues) },
                    });
                }
            });

            console.log(`[excel-import] Generated embedding for ${id}`);
        } catch (e) {
            console.error(`[excel-import] Embedding failed for ${id}:`, e);
        }
    }
}
