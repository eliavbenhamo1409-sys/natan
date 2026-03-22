'use client';

import { useState, useEffect, useRef } from 'react';
import { LayoutShell } from '@/components/ui/LayoutShell';

interface InventoryItem {
    id: string;
    partNumber: string | null;
    name: string;
    description: string | null;
    quantity: number;
    category: string | null;
    location: string | null;
}

interface MatchResult {
    projectPart: string;
    inventoryMatch: string | null;
    inventoryPartNumber: string | null;
    quantityNeeded: number | null;
    quantityInStock: number | null;
    confidence: number;
    inStock: boolean;
}

interface MatchResponse {
    matches: MatchResult[];
    summary: { totalProjectParts: number; foundInWarehouse: number; notInWarehouse: number };
}

type Tab = 'inventory' | 'match';

export default function InventoryPage() {
    const [tab, setTab] = useState<Tab>('inventory');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [isLoadingInv, setIsLoadingInv] = useState(true);
    const [isUploading, setIsUploading] = useState(false);

    const [projectText, setProjectText] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { loadInventory(); }, []);

    const loadInventory = async () => {
        setIsLoadingInv(true);
        try {
            const res = await fetch('/api/inventory');
            const json = await res.json();
            setInventory(json.items || []);
        } catch { /* ignore */ } finally {
            setIsLoadingInv(false);
        }
    };

    const handleUploadInventory = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/inventory', { method: 'POST', body: fd });
            if (!res.ok) throw new Error('Upload failed');
            await loadInventory();
        } catch (err: any) {
            alert(err.message || 'שגיאה בהעלאה');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleClearInventory = async () => {
        if (!confirm('למחוק את כל רשימת המלאי?')) return;
        await fetch('/api/inventory', { method: 'DELETE' });
        setInventory([]);
    };

    const handleProjectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setProjectText(text);
        if (projectFileRef.current) projectFileRef.current.value = '';
    };

    const parseProjectParts = (): { name: string; partNumber?: string; quantity?: number }[] => {
        return projectText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const qtyMatch = line.match(/[xX×]\s*(\d+)\s*$/);
                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : undefined;
                const name = qtyMatch ? line.replace(qtyMatch[0], '').trim() : line;
                return { name, quantity: qty };
            });
    };

    const runMatch = async () => {
        const parts = parseProjectParts();
        if (parts.length === 0) { alert('הזן רשימת חלקים של פרויקט'); return; }
        if (inventory.length === 0) { alert('אין פריטים במלאי המחסן. העלה קובץ מלאי קודם.'); return; }

        setIsMatching(true);
        setMatchResult(null);
        try {
            const res = await fetch('/api/inventory/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectParts: parts }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Match failed');
            }
            const data = await res.json();
            setMatchResult(data);
        } catch (err: any) {
            alert(err.message || 'שגיאה בביצוע חפיפה');
        } finally {
            setIsMatching(false);
        }
    };

    const exportPdf = async () => {
        if (!matchResult) return;
        setIsExporting(true);
        try {
            const res = await fetch('/api/inventory/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matches: matchResult.matches, title: 'רשימת חלקים זמינים במחסן' }),
            });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `warehouse-match-${Date.now()}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(err.message || 'שגיאה בייצוא');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <LayoutShell activePath="/inventory">
            <div dir="rtl" className="max-w-[960px] mx-auto pb-10">

                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-[22px] font-bold text-neutral-900 tracking-tight">חפיפת מלאי</h1>
                    <p className="text-[13px] text-neutral-500 mt-1">
                        העלה רשימת מלאי מחסן קבועה, ולאחר מכן השווה אותה לרשימת חלקים של פרויקט כדי לדעת מה זמין ומה חסר.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg w-fit mb-6">
                    <button
                        onClick={() => setTab('inventory')}
                        className={`px-4 py-2 text-[13px] font-medium rounded-md transition-all ${tab === 'inventory' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        מלאי מחסן ({inventory.length})
                    </button>
                    <button
                        onClick={() => setTab('match')}
                        className={`px-4 py-2 text-[13px] font-medium rounded-md transition-all ${tab === 'match' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        חפיפת פרויקט
                    </button>
                </div>

                {/* ── Tab: Inventory ── */}
                {tab === 'inventory' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <label className="h-9 px-4 text-[13px] font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                {isUploading ? 'מעלה...' : 'העלאת קובץ מלאי'}
                                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUploadInventory} disabled={isUploading} />
                            </label>
                            {inventory.length > 0 && (
                                <button onClick={handleClearInventory} className="h-9 px-4 text-[13px] text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                    נקה מלאי
                                </button>
                            )}
                        </div>

                        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                            {isLoadingInv ? (
                                <div className="flex items-center justify-center py-16">
                                    <span className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
                                </div>
                            ) : inventory.length === 0 ? (
                                <div className="py-16 text-center">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-neutral-300">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    </svg>
                                    <p className="text-[14px] text-neutral-500 font-medium">אין פריטים במלאי</p>
                                    <p className="text-[12px] text-neutral-400 mt-1">העלה קובץ Excel/CSV עם רשימת המלאי של המחסן</p>
                                </div>
                            ) : (
                                <div className="overflow-auto max-h-[500px]">
                                    <table className="w-full text-right border-collapse">
                                        <thead className="bg-neutral-50 sticky top-0">
                                            <tr className="border-b border-neutral-200">
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">#</th>
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">שם פריט</th>
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">מק&quot;ט</th>
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">כמות</th>
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">קטגוריה</th>
                                                <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">מיקום</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                            {inventory.map((item, i) => (
                                                <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                                                    <td className="px-4 py-2.5 text-[12px] text-neutral-400 font-mono">{i + 1}</td>
                                                    <td className="px-4 py-2.5 text-[13px] text-neutral-800 font-medium">{item.name}</td>
                                                    <td className="px-4 py-2.5 text-[12px] text-neutral-500 font-mono">{item.partNumber || '—'}</td>
                                                    <td className="px-4 py-2.5 text-[13px] text-neutral-800">{item.quantity}</td>
                                                    <td className="px-4 py-2.5 text-[12px] text-neutral-500">{item.category || '—'}</td>
                                                    <td className="px-4 py-2.5 text-[12px] text-neutral-500">{item.location || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Tab: Match ── */}
                {tab === 'match' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-3.5 border-b border-neutral-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                    <span className="text-[12px] font-semibold text-neutral-500 tracking-wide">רשימת חלקים של פרויקט</span>
                                </div>
                                <label className="text-[11px] font-medium text-neutral-500 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-3 py-1 rounded-md transition-all cursor-pointer">
                                    ייבוא מקובץ
                                    <input ref={projectFileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleProjectFileUpload} />
                                </label>
                            </div>
                            <div className="p-6">
                                <textarea
                                    value={projectText}
                                    onChange={(e) => setProjectText(e.target.value)}
                                    placeholder={"הדבק כאן רשימת חלקים, שורה לכל פריט:\n\nברגים M6 x10\nלוח חשמל ראשי\nתרמוסטט דיגיטלי\nכבל חשמל 3x2.5\nמפסק 32A"}
                                    dir="rtl"
                                    className="w-full h-40 px-4 py-3 rounded-lg border border-neutral-200 bg-neutral-50 text-[13px] text-neutral-800 resize-none focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/5 transition-all placeholder:text-neutral-400"
                                />
                                <div className="flex items-center justify-between mt-4">
                                    <span className="text-[11px] text-neutral-400">
                                        {projectText.split('\n').filter(l => l.trim()).length} פריטים | מלאי מחסן: {inventory.length} פריטים
                                    </span>
                                    <button
                                        onClick={runMatch}
                                        disabled={isMatching || !projectText.trim() || inventory.length === 0}
                                        className="h-9 px-6 text-[13px] font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors inline-flex items-center gap-2 shadow-sm"
                                    >
                                        {isMatching ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                מנתח...
                                            </>
                                        ) : (
                                            <>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                                הפעל חפיפה
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {matchResult && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 text-center">
                                        <div className="text-[28px] font-bold text-neutral-900">{matchResult.summary.totalProjectParts}</div>
                                        <div className="text-[12px] text-neutral-500 mt-1">סה&quot;כ חלקים בפרויקט</div>
                                    </div>
                                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 text-center">
                                        <div className="text-[28px] font-bold text-emerald-700">{matchResult.summary.foundInWarehouse}</div>
                                        <div className="text-[12px] text-emerald-600 mt-1">נמצאו במחסן</div>
                                    </div>
                                    <div className="bg-red-50 rounded-xl border border-red-200 p-5 text-center">
                                        <div className="text-[28px] font-bold text-red-600">{matchResult.summary.notInWarehouse}</div>
                                        <div className="text-[12px] text-red-500 mt-1">לא נמצאו</div>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={exportPdf}
                                        disabled={isExporting}
                                        className="h-9 px-5 text-[13px] font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors inline-flex items-center gap-2 shadow-sm"
                                    >
                                        {isExporting ? (
                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                        )}
                                        ייצוא PDF - חלקים זמינים
                                    </button>
                                </div>

                                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                                    <div className="overflow-auto max-h-[500px]">
                                        <table className="w-full text-right border-collapse">
                                            <thead className="bg-neutral-50 sticky top-0">
                                                <tr className="border-b border-neutral-200">
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">סטטוס</th>
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">חלק בפרויקט</th>
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">התאמה במחסן</th>
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">כמות נדרשת</th>
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">במלאי</th>
                                                    <th className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 uppercase">ביטחון</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-100">
                                                {matchResult.matches.map((m, i) => (
                                                    <tr key={i} className={`transition-colors ${m.inStock && m.confidence >= 0.7 ? 'bg-emerald-50/30' : 'bg-red-50/30'}`}>
                                                        <td className="px-4 py-2.5">
                                                            {m.inStock && m.confidence >= 0.7 ? (
                                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-[13px] text-neutral-800 font-medium">{m.projectPart}</td>
                                                        <td className="px-4 py-2.5 text-[13px] text-neutral-600">{m.inventoryMatch || '—'}</td>
                                                        <td className="px-4 py-2.5 text-[13px] text-neutral-800">{m.quantityNeeded ?? '—'}</td>
                                                        <td className="px-4 py-2.5 text-[13px] text-neutral-800">{m.quantityInStock ?? '—'}</td>
                                                        <td className="px-4 py-2.5">
                                                            <div className="w-12 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${m.confidence >= 0.7 ? 'bg-emerald-500' : m.confidence >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                    style={{ width: `${Math.round(m.confidence * 100)}%` }}
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </LayoutShell>
    );
}
