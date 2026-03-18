import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public routes that don't need auth
    const publicPaths = ['/login', '/api/auth/login'];
    if (publicPaths.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Static files and Next.js internals
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Check for auth cookie
    const token = request.cookies.get('factory_records_token')?.value;

    if (!token) {
        // API routes return 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Page routes redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
