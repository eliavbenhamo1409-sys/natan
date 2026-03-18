'use client';

import { useState, useRef } from 'react';
import { LayoutShell } from '@/components/ui/LayoutShell';
import { useRouter } from 'next/navigation';

export default function ImportPage() {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setResult(null); setError(null); }
    };

    const handleImport = async () => {
        if (!file) return;
        setIsUploading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/projects/import', { method: 'POST', body: formData });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Import failed');
            setResult(json);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <LayoutShell activePath="/import">
            <div className="flex flex-col items-center justify-center h-full gap-8 animate-fade-in" dir="rtl">
                <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                        ייבוא טבלת Excel
                    </h1>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '32px', lineHeight: 1.6 }}>
                        העלה קובץ Excel (.xlsx / .xls / .csv) עם הטבלה הישנה.
                        <br />
                        המערכת תזהה את העמודות אוטומטית ותייבא את הפרויקטים.
                    </p>

                    {/* Drop zone */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        style={{
                            border: '2px dashed #d1d5db',
                            borderRadius: '12px',
                            padding: '40px 24px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            backgroundColor: file ? '#f9fafb' : '#fff',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#111827'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />

                        {file ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <svg style={{ width: 32, height: 32, color: '#111827' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <path d="M9 15l2 2 4-4" />
                                </svg>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{file.name}</span>
                                <span style={{ fontSize: '12px', color: '#9ca3af' }}>{(file.size / 1024).toFixed(0)} KB</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <svg style={{ width: 32, height: 32, color: '#9ca3af' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="12" y1="18" x2="12" y2="12" />
                                    <line x1="9" y1="15" x2="12" y2="12" />
                                    <line x1="15" y1="15" x2="12" y2="12" />
                                </svg>
                                <span style={{ fontSize: '14px', color: '#6b7280' }}>לחץ לבחירת קובץ</span>
                                <span style={{ fontSize: '12px', color: '#9ca3af' }}>xlsx, xls, csv</span>
                            </div>
                        )}
                    </div>

                    {/* Expected columns */}
                    <div style={{ marginTop: '20px', padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>עמודות נתמכות:</p>
                        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
                            מק"ט, לקוח, פקע / הזמנה, תיאור, מתכנן, תאריך, מתח, הספק, כמות, תצורה, קנ"מ
                        </p>
                    </div>

                    {/* Import button */}
                    <button
                        onClick={handleImport}
                        disabled={!file || isUploading}
                        style={{
                            marginTop: '24px',
                            width: '100%',
                            height: '42px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: file && !isUploading ? 'pointer' : 'default',
                            transition: 'all 0.15s',
                            backgroundColor: file && !isUploading ? '#111827' : '#e5e7eb',
                            color: file && !isUploading ? '#fff' : '#9ca3af',
                        }}
                    >
                        {isUploading ? 'מייבא...' : 'ייבא לטבלה'}
                    </button>

                    {/* Error */}
                    {error && (
                        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', color: '#dc2626' }}>
                            {error}
                        </div>
                    )}

                    {/* Success */}
                    {result && (
                        <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac', textAlign: 'center' }}>
                            <p style={{ fontSize: '15px', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>
                                יובאו {result.imported} פרויקטים בהצלחה
                            </p>
                            {result.skipped > 0 && (
                                <p style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {result.skipped} שורות ריקות דולגו
                                </p>
                            )}
                            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                                עמודות שזוהו: {result.mappedColumns?.join(' | ')}
                            </p>
                            <button
                                onClick={() => router.push('/')}
                                style={{
                                    marginTop: '16px',
                                    padding: '8px 24px',
                                    borderRadius: '8px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: '#111827',
                                    color: '#fff',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                חזרה לדשבורד
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </LayoutShell>
    );
}
