import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const project = await prisma.project.findUnique({
            where: { id },
            include: { user: { select: { username: true } } },
        });

        if (!project) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({ project });

    } catch (error) {
        console.error('Project single GET errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.project.delete({
            where: { id },
        });

        const pdfPath = path.join(process.cwd(), 'uploads', 'pdfs', `${id}.pdf`);
        const imgPath = path.join(process.cwd(), 'uploads', 'images', `${id}.png`);
        await fs.unlink(pdfPath).catch(() => {});
        await fs.unlink(imgPath).catch(() => {});

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Project DELETE errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const updates = await request.json();

        const project = await prisma.project.update({
            where: { id },
            data: updates,
        });

        return NextResponse.json({ project });

    } catch (error) {
        console.error('Project PATCH errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
