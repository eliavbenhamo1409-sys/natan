import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const pdfPath = path.join(process.cwd(), 'uploads', 'pdfs', `${id}.pdf`);

        try {
            await fs.access(pdfPath);
        } catch {
            return new NextResponse('PDF not found', { status: 404 });
        }

        const buffer = await fs.readFile(pdfPath);

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        console.error('PDF route error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
