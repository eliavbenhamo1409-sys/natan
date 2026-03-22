const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sncvgkkraqoydppljjjf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function uploadToBucket(bucket: string, filePath: string, buffer: Buffer, contentType: string): Promise<void> {
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': contentType,
            'x-upsert': 'true',
        },
        body: new Uint8Array(buffer),
    });
    if (!res.ok) {
        const err = await res.text();
        console.error(`[storage] Upload to ${bucket} failed:`, res.status, err);
        throw new Error(`Storage upload failed: ${err}`);
    }
}

async function downloadFromBucket(bucket: string, filePath: string): Promise<Buffer> {
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
        },
    });
    if (!res.ok) {
        throw new Error(`Storage download failed: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

export function getPublicImageUrl(filePath: string): string {
    return `${SUPABASE_URL}/storage/v1/object/public/product-images/${filePath}`;
}

export async function uploadImage(filePath: string, buffer: Buffer): Promise<string> {
    await uploadToBucket('product-images', filePath, buffer, 'image/png');
    return getPublicImageUrl(filePath);
}

export async function uploadPdf(filePath: string, buffer: Buffer): Promise<void> {
    await uploadToBucket('pdfs', filePath, buffer, 'application/pdf');
}

export async function downloadPdf(filePath: string): Promise<Buffer> {
    return downloadFromBucket('pdfs', filePath);
}
