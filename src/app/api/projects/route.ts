import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { pipeline } from '@/lib/extraction/pipeline';

export async function POST(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await request.json();
            const projectId = uuidv4();

            const maxRow = await prisma.project.aggregate({ _max: { rowNumber: true } });
            const maxNum = parseInt(maxRow._max.rowNumber || '0', 10) || 0;
            const nextRowNumber = String(maxNum + 1);

            const project = await prisma.project.create({
                data: {
                    id: projectId,
                    sku: body.sku || null,
                    customerName: body.customerName || null,
                    workOrderNumber: body.workOrderNumber || null,
                    productDescription: body.productDescription || null,
                    plannerName: body.plannerName || null,
                    drawingDate: body.drawingDate || null,
                    voltage: body.voltage || null,
                    quantity: body.quantity ? parseInt(body.quantity, 10) : null,
                    rowNumber: nextRowNumber,
                    uploadedBy: user.userId,
                    extractionStatus: 'completed',
                },
            });
            return NextResponse.json({ project });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file || file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'Valid PDF file required' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const projectId = uuidv4();

        const filename = `${projectId}.pdf`;
        const uploadDir = path.join(process.cwd(), 'uploads', 'pdfs');
        await mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, filename);
        await writeFile(filePath, buffer);

        const project = await prisma.project.create({
            data: {
                id: projectId,
                sourcePdfFilename: file.name,
                uploadedBy: user.userId,
                extractionStatus: 'pending',
            },
        });

        pipeline.processProject(projectId).catch(console.error);

        return NextResponse.json({ project });

    } catch (error) {
        console.error('Projects API POST errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await prisma.$transaction(async (tx) => {
            await tx.projectEmbedding.deleteMany({});
            return tx.project.deleteMany({});
        });

        // Clean up uploaded files
        const { rm } = await import('fs/promises');
        const imgDir = path.join(process.cwd(), 'uploads', 'images');
        const pdfDir = path.join(process.cwd(), 'uploads', 'pdfs');
        await rm(imgDir, { recursive: true, force: true }).catch(() => {});
        await rm(pdfDir, { recursive: true, force: true }).catch(() => {});

        console.log(`[delete-all] Deleted ${result.count} projects`);
        return NextResponse.json({ deleted: result.count });
    } catch (error) {
        console.error('Delete all errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('q');

        const whereClause = search
            ? {
                OR: [
                    { sku: { contains: search } },
                    { customerName: { contains: search } },
                    { productDescription: { contains: search } },
                    { workOrderNumber: { contains: search } },
                ],
            }
            : {};

        const projects = await prisma.project.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 1000,
        });

        projects.sort((a, b) => {
            const numA = parseInt(a.rowNumber || '0', 10) || 0;
            const numB = parseInt(b.rowNumber || '0', 10) || 0;
            if (numB !== numA) return numB - numA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return NextResponse.json({ projects });

    } catch (error) {
        console.error('Projects API GET errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
