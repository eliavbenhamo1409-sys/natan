import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const { projectId } = await request.json();

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }

        const cookieHeader = request.headers.get('cookie') || '';
        const match = cookieHeader.match(/factory_records_token=([^;]+)/);
        if (!match) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const user = verifyToken(match[1]);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        after(async () => {
            try {
                const { pipeline } = await import('@/lib/extraction/pipeline');
                await pipeline.processProject(projectId);
            } catch (e) {
                console.error('[after] process pipeline error:', e);
            }
        });

        return NextResponse.json({ success: true, message: 'Processing started' });

    } catch (error) {
        console.error('Process API errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
