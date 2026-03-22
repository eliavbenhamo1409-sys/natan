import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

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

        const contentType = request.headers.get('content-type') || '';

        // Handle image upload via FormData
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const imageFile = formData.get('image') as File | null;

            if (imageFile) {
                const sharp = (await import('sharp')).default;
                const { uploadImage } = await import('@/lib/storage');
                const buf = Buffer.from(await imageFile.arrayBuffer());
                const pngBuf = await sharp(buf).png().toBuffer();
                const imageUrl = await uploadImage(`${id}.png`, pngBuf);
                await prisma.project.update({
                    where: { id },
                    data: { productImageUrl: imageUrl },
                });
            }

            // Also update any text fields sent along
            const fields: Record<string, any> = {};
            for (const [key, value] of formData.entries()) {
                if (key === 'image') continue;
                fields[key] = value === '' ? null : String(value);
            }
            if (fields.powerKw) fields.powerKw = parseFloat(fields.powerKw) || null;
            if (fields.quantity) fields.quantity = parseInt(fields.quantity, 10) || null;

            let project;
            if (Object.keys(fields).length > 0) {
                project = await prisma.project.update({ where: { id }, data: fields });
            } else {
                project = await prisma.project.findUnique({ where: { id } });
            }

            return NextResponse.json({ project });
        }

        // Handle JSON updates
        const updates = await request.json();
        if (updates.powerKw !== undefined) updates.powerKw = updates.powerKw ? parseFloat(updates.powerKw) : null;
        if (updates.quantity !== undefined) updates.quantity = updates.quantity ? parseInt(updates.quantity, 10) : null;

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
