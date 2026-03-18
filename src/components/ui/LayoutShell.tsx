'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const LayoutShell = ({ children, activePath = '/' }: { children: React.ReactNode, activePath?: string }) => {
    const router = useRouter();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className="app-sidebar">
                <div className="app-sidebar-logo text-text-primary">
                    <svg className="w-5 h-5 mr-3 text-accent-base" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    Factory Records
                </div>

                <nav className="app-sidebar-nav space-y-1">
                    <Link href="/" className={`app-sidebar-nav-item ${activePath === '/' ? 'active' : ''}`}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="9" />
                            <rect x="14" y="3" width="7" height="5" />
                            <rect x="14" y="12" width="7" height="9" />
                            <rect x="3" y="16" width="7" height="5" />
                        </svg>
                        Dashboard
                    </Link>
                    <Link href="/import" className={`app-sidebar-nav-item ${activePath === '/import' ? 'active' : ''}`}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="12" y2="12" />
                            <line x1="15" y1="15" x2="12" y2="12" />
                        </svg>
                        Import Excel
                    </Link>
                </nav>

                <div className="app-sidebar-footer">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-base flex items-center justify-center font-semibold text-sm">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-text-primary">Current User</span>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="app-main">
                {/* Header - Used for search or actions usually */}
                <header className="app-header">
                    <div className="text-sm text-text-tertiary">Internal Project Record System</div>
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full border border-border-base flex items-center justify-center text-text-tertiary bg-bg-primary">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                        </div>
                    </div>
                </header>

                <div className="app-content bg-bg-primary">
                    <div className="max-w-7xl mx-auto h-full">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};
