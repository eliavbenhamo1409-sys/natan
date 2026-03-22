const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sncvgkkraqoydppljjjf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'product-images';

export function getPublicImageUrl(filePath: string): string {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}

export async function uploadImage(filePath: string, buffer: Buffer, contentType = 'image/png'): Promise<string> {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': contentType,
            'x-upsert': 'true',
        },
        body: buffer,
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('[storage] Upload failed:', res.status, err);
        throw new Error(`Storage upload failed: ${err}`);
    }

    return getPublicImageUrl(filePath);
}
