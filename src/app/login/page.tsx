'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError('Please enter both username and password');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            router.push('/');
            router.refresh();

        } catch (err: any) {
            setError(err.message || 'An error occurred during login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4 animate-fade-in">
            <div className="w-full max-w-[400px]">

                {/* Logo/Brand */}
                <div className="text-center mb-10">
                    <div className="w-12 h-12 bg-accent-soft rounded-xl mx-auto flex items-center justify-center mb-4 border border-accent-base/20">
                        <svg className="w-6 h-6 text-accent-base" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                    </div>
                    <h1 className="text-[24px] font-semibold text-text-primary tracking-tight">Factory Records</h1>
                    <p className="text-[14px] text-text-secondary mt-1">Sign in to your account</p>
                </div>

                {/* Login Card */}
                <div className="card p-8 shadow-md">
                    <form onSubmit={handleLogin} className="space-y-6">

                        {error && (
                            <div className="p-3 bg-error-soft text-error-base text-[13px] rounded-md border border-error-base/20">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <Input
                                label="Username"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                disabled={isLoading}
                            />

                            <Input
                                label="Password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                disabled={isLoading}
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            isLoading={isLoading}
                        >
                            Sign in
                        </Button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-[13px] text-text-tertiary">
                    Internal reporting system. Authorized personnel only.
                </div>

            </div>
        </div>
    );
}
