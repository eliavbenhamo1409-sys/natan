import { NextResponse } from 'next/server';
import { downloadPdf } from '@/lib/storage';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const filename = id.endsWith('.pdf') ? id : `${id}.pdf`;

        const buffer = await downloadPdf(filename);

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
        return new NextResponse('PDF not found', { status: 404 });
    }
}
