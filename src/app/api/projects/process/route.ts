import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { pipeline } from '@/lib/extraction/pipeline';
import { verifyToken } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const { projectId } = await request.json();

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }

        // Verify authorized user context
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

        // Process asynchronously, do not await here to let response return immediately
        // Next.js App Router API route will run this background promise.
        // In serverless environments, this might require a different approach (e.g. Vercel Inngest/Queue).
        // For local Node server, this fire-and-forget works fine.
        pipeline.processProject(projectId).catch(console.error);

        return NextResponse.json({ success: true, message: 'Processing started' });

    } catch (error) {
        console.error('Process API errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
