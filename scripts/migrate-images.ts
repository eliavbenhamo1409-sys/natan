import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://sncvgkkraqoydppljjjf.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'product-images';
const IMAGE_DIR = path.join(process.cwd(), 'uploads', 'images');

async function uploadOne(filename: string, buffer: Buffer): Promise<boolean> {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': 'image/png',
            'x-upsert': 'true',
        },
        body: buffer,
    });
    return res.ok;
}

async function main() {
    if (!SUPABASE_KEY) {
        console.error('Set NEXT_PUBLIC_SUPABASE_ANON_KEY');
        process.exit(1);
    }

    const files = fs.readdirSync(IMAGE_DIR).filter(f => f.endsWith('.png'));
    console.log(`Found ${files.length} images to migrate`);

    const BATCH = 10;
    let ok = 0, fail = 0;

    for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.all(
            batch.map(async (f) => {
                const buf = fs.readFileSync(path.join(IMAGE_DIR, f));
                const success = await uploadOne(f, buf);
                return { f, success };
            })
        );
        for (const r of results) {
            if (r.success) ok++;
            else { fail++; console.error(`FAIL: ${r.f}`); }
        }
        process.stdout.write(`\r  ${ok + fail}/${files.length} (${ok} ok, ${fail} fail)`);
    }

    console.log(`\nDone: ${ok} uploaded, ${fail} failed`);

    // Now update DB records
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const projects = await prisma.project.findMany({
        where: { productImageUrl: { startsWith: '/api/files/images/' } },
        select: { id: true, productImageUrl: true },
    });
    console.log(`Updating ${projects.length} DB records...`);

    for (const p of projects) {
        const idMatch = p.productImageUrl!.match(/\/api\/files\/images\/([^?]+)/);
        if (!idMatch) continue;
        const imgId = idMatch[1].endsWith('.png') ? idMatch[1] : `${idMatch[1]}.png`;
        const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${imgId}`;
        await prisma.project.update({
            where: { id: p.id },
            data: { productImageUrl: newUrl },
        });
    }
    console.log('DB records updated!');
    await prisma.$disconnect();
}

main().catch(console.error);
