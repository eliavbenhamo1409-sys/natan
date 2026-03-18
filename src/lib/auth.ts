import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
if (!process.env.JWT_SECRET) {
    console.warn('[auth] WARNING: JWT_SECRET not set — using insecure fallback. Set JWT_SECRET in .env for production.');
}
const COOKIE_NAME = 'factory_records_token';
const TOKEN_EXPIRY = '30d';

export interface JWTPayload {
    userId: string;
    username: string;
    role: string;
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function createToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export async function setAuthCookie(payload: JWTPayload): Promise<void> {
    const token = createToken(payload);
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
    });
}

export async function clearAuthCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

export async function getAuthToken(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_NAME)?.value;
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
    const token = await getAuthToken();
    if (!token) return null;
    return verifyToken(token);
}

export async function getFullCurrentUser() {
    const payload = await getCurrentUser();
    if (!payload) return null;
    const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, role: true, createdAt: true },
    });
    return user;
}

export function getTokenFromHeader(request: Request): string | null {
    const cookie = request.headers.get('cookie');
    if (!cookie) return null;
    const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? match[1] : null;
}

export function verifyRequestAuth(request: Request): JWTPayload | null {
    const token = getTokenFromHeader(request);
    if (!token) return null;
    return verifyToken(token);
}
