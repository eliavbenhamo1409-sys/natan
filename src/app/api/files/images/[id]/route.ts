import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const filename = id.endsWith('.png') ? id : `${id}.png`;
        const imagePath = path.join(process.cwd(), 'uploads', 'images', filename);

        // Check if file exists
        try {
            await fs.access(imagePath);
        } catch {
            return new NextResponse('Image not found', { status: 404 });
        }

        const buffer = await fs.readFile(imagePath);

        // Create streaming response
        const headers = new Headers();
        headers.set('Content-Type', 'image/png'); // Using PNG for crops
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new NextResponse(buffer, {
            status: 200,
            headers,
        });

    } catch (error) {
        console.error('Image route error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
