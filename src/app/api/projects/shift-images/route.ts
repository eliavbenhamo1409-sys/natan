import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cacheBuster = Date.now();

        // Single SQL: shift product_image_url up by 1 row using LEAD() window function
        // Each row gets the image URL of the row below it (next rowNumber).
        // Last row gets NULL. Cache-buster added to force browser refresh.
        const result = await prisma.$executeRawUnsafe(`
            UPDATE projects p
            SET product_image_url = CASE
                WHEN shifted.next_url IS NOT NULL
                    THEN split_part(shifted.next_url, '?', 1) || '?v=${cacheBuster}'
                ELSE NULL
            END
            FROM (
                SELECT id,
                       LEAD(product_image_url) OVER (
                           ORDER BY CAST(NULLIF(row_number, '') AS INTEGER) NULLS LAST
                       ) as next_url
                FROM projects
            ) shifted
            WHERE p.id = shifted.id
        `);

        console.log(`[shift-images] Shifted images in 1 SQL query, ${result} rows updated`);
        return NextResponse.json({ shifted: result });
    } catch (error) {
        console.error('Shift images errored:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
