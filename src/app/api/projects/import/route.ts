import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

const COLUMN_MAP: Record<string, string> = {
    'מק"ט': 'sku',
    'מקט': 'sku',
    'sku': 'sku',
    'SKU': 'sku',
    'part': 'sku',
    'part no': 'sku',
    'לקוח': 'customerName',
    'customer': 'customerName',
    'שם לקוח': 'customerName',
    'פקע': 'workOrderNumber',
    'פקע"ת': 'workOrderNumber',
    'work order': 'workOrderNumber',
    'הזמנה': 'workOrderNumber',
    'מס הזמנה': 'workOrderNumber',
    'תיאור': 'productDescription',
    'תאור': 'productDescription',
    'description': 'productDescription',
    'תיאור מוצר': 'productDescription',
    'תיאור הפריט': 'productDescription',
    'מתכנן': 'plannerName',
    'שרטט': 'plannerName',
    'planner': 'plannerName',
    'תאריך': 'drawingDate',
    'date': 'drawingDate',
    'מתח': 'voltage',
    'voltage': 'voltage',
    'הספק': 'powerKw',
    'power': 'powerKw',
    'kw': 'powerKw',
    'כמות': 'quantity',
    'quantity': 'quantity',
    'תצורה': 'configuration',
    'configuration': 'configuration',
    'קנ"מ': 'scale',
    'scale': 'scale',
};

function normalizeHeader(header: string): string | null {
    const clean = header.trim().toLowerCase().replace(/['"]/g, '');
    for (const [key, field] of Object.entries(COLUMN_MAP)) {
        if (clean === key.toLowerCase()) return field;
    }
    for (const [key, field] of Object.entries(COLUMN_MAP)) {
        if (clean.includes(key.toLowerCase())) return field;
    }
    return null;
}

export async function POST(request: Request) {
    try {
        const user = verifyRequestAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const name = file.name.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
            return NextResponse.json({ error: 'Supported formats: xlsx, xls, csv' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const workbook = XLSX.read(bytes, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return NextResponse.json({ error: 'Empty workbook' }, { status: 400 });
        }

        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (rows.length === 0) {
            return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
        }

        const headers = Object.keys(rows[0]);
        const mapping: Record<string, string> = {};
        for (const h of headers) {
            const field = normalizeHeader(h);
            if (field) mapping[h] = field;
        }

        if (Object.keys(mapping).length === 0) {
            return NextResponse.json({
                error: 'Could not match any columns. Expected headers like: מק"ט, לקוח, פקע, תיאור, מתכנן, תאריך, מתח, כמות',
                detectedHeaders: headers,
            }, { status: 400 });
        }

        let imported = 0;
        let skipped = 0;

        for (const row of rows) {
            const data: any = {};
            for (const [excelCol, dbField] of Object.entries(mapping)) {
                const val = row[excelCol];
                if (val === '' || val === null || val === undefined) continue;

                if (dbField === 'powerKw') {
                    const num = parseFloat(String(val));
                    if (!isNaN(num)) data[dbField] = num;
                } else if (dbField === 'quantity') {
                    const num = parseInt(String(val), 10);
                    if (!isNaN(num)) data[dbField] = num;
                } else {
                    data[dbField] = String(val).trim();
                }
            }

            if (Object.keys(data).length === 0) {
                skipped++;
                continue;
            }

            await prisma.project.create({
                data: {
                    id: uuidv4(),
                    ...data,
                    uploadedBy: user.userId,
                    extractionStatus: 'completed',
                },
            });
            imported++;
        }

        return NextResponse.json({
            imported,
            skipped,
            total: rows.length,
            mappedColumns: Object.entries(mapping).map(([from, to]) => `${from} → ${to}`),
        });

    } catch (error) {
        console.error('Excel import errored:', error);
        return NextResponse.json({ error: 'Failed to import file' }, { status: 500 });
    }
}
