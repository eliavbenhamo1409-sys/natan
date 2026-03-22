import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(request: Request) {
    const user = verifyRequestAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const items = await prisma.inventoryItem.findMany({
        orderBy: { name: 'asc' },
    });
    return NextResponse.json({ items });
}

export async function POST(request: Request) {
    const user = verifyRequestAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Empty file' }, { status: 400 });
        }

        const headers = Object.keys(rows[0]);
        const nameCol = headers.find(h => /שם|name|תיאור|פריט|description/i.test(h)) || headers[0];
        const partCol = headers.find(h => /מק"?ט|part.*num|catalog|קטלוג|מספר פריט/i.test(h));
        const qtyCol = headers.find(h => /כמות|qty|quantity|יחידות|מלאי/i.test(h));
        const catCol = headers.find(h => /קטגוריה|category|סוג|type/i.test(h));
        const locCol = headers.find(h => /מיקום|location|מחסן|אחסון/i.test(h));

        const items = rows.map(row => ({
            name: String(row[nameCol] || '').trim(),
            partNumber: partCol ? String(row[partCol] || '').trim() || null : null,
            quantity: qtyCol ? (parseInt(String(row[qtyCol]), 10) || 0) : 0,
            category: catCol ? String(row[catCol] || '').trim() || null : null,
            location: locCol ? String(row[locCol] || '').trim() || null : null,
        })).filter(item => item.name.length > 0);

        const created = await prisma.inventoryItem.createMany({ data: items });
        return NextResponse.json({ count: created.count, detectedColumns: { nameCol, partCol, qtyCol, catCol, locCol } });
    }

    const body = await request.json();
    if (Array.isArray(body)) {
        const created = await prisma.inventoryItem.createMany({ data: body });
        return NextResponse.json({ count: created.count });
    }

    const item = await prisma.inventoryItem.create({ data: body });
    return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
    const user = verifyRequestAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.inventoryItem.deleteMany({});
    return NextResponse.json({ success: true });
}
