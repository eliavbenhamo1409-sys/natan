'use client';

import { ProjectsCacheProvider } from '@/lib/projects-cache';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ProjectsCacheProvider>
            {children}
        </ProjectsCacheProvider>
    );
}
