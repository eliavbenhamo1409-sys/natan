'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LayoutShell } from '@/components/ui/LayoutShell';

interface Project {
    id: string;
    sku: string | null;
    customerName: string | null;
    workOrderNumber: string | null;
    productDescription: string | null;
    plannerName: string | null;
    drawingDate: string | null;
    voltage: string | null;
    powerKw: number | null;
    quantity: number | null;
    configuration: string | null;
    scale: string | null;
    sheetNumber: number | null;
    totalSheets: number | null;
    thermostat: boolean;
    mainSwitch: boolean;
    technicalDimensions: string | null;
    productImageUrl: string | null;
    extractionStatus: string;
    extractionConfidence: number | null;
    rowNumber: string | null;
}

const ALL_EDITABLE: { key: keyof Project; label: string; type?: string; group: 'order' | 'tech' | 'desc' }[] = [
    { key: 'customerName', label: 'לקוח', group: 'order' },
    { key: 'workOrderNumber', label: 'הזמנת עבודה', group: 'order' },
    { key: 'plannerName', label: 'מתכנן', group: 'order' },
    { key: 'drawingDate', label: 'תאריך שרטוט', group: 'order' },
    { key: 'voltage', label: 'מתח', group: 'tech' },
    { key: 'powerKw', label: 'הספק (kW)', type: 'number', group: 'tech' },
    { key: 'quantity', label: 'כמות', type: 'number', group: 'tech' },
    { key: 'scale', label: 'סקאלה', group: 'tech' },
    { key: 'productDescription', label: 'תיאור המוצר', group: 'desc' },
    { key: 'configuration', label: 'תצורה', group: 'desc' },
];

export default function RecordDetailPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<Record<string, string>>({});
    const [isSaving, setSaving] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/projects/${id}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error);
                setProject(json.project);
            } catch {
                router.push('/');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id, router]);

    const enterEditMode = () => {
        if (!project) return;
        const initial: Record<string, string> = {};
        for (const f of ALL_EDITABLE) {
            initial[f.key] = project[f.key] != null ? String(project[f.key]) : '';
        }
        setForm(initial);
        setImagePreview(null);
        setImageFile(null);
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setImagePreview(null);
        setImageFile(null);
    };

    const handleSave = async () => {
        if (!project) return;
        setSaving(true);
        try {
            if (imageFile) {
                const fd = new FormData();
                fd.append('image', imageFile);
                for (const [key, value] of Object.entries(form)) fd.append(key, value);
                const res = await fetch(`/api/projects/${id}`, { method: 'PATCH', body: fd });
                if (!res.ok) throw new Error('Save failed');
            } else {
                const updates: Record<string, any> = {};
                for (const f of ALL_EDITABLE) {
                    const newVal = form[f.key] ?? '';
                    const oldVal = project[f.key] != null ? String(project[f.key]) : '';
                    if (newVal !== oldVal) updates[f.key] = newVal || null;
                }
                if (Object.keys(updates).length > 0) {
                    const res = await fetch(`/api/projects/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates),
                    });
                    if (!res.ok) throw new Error('Save failed');
                }
            }
            const res = await fetch(`/api/projects/${id}`);
            const json = await res.json();
            if (res.ok) setProject(json.project);
            setIsEditing(false);
            setImageFile(null);
            setImagePreview(null);
        } catch (err: any) {
            alert(err.message || 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('למחוק את הרשומה? פעולה זו בלתי הפיכה.')) return;
        try {
            await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            router.push('/');
        } catch {
            alert('מחיקה נכשלה');
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const val = (key: keyof Project) => {
        const v = project?.[key];
        if (key === 'powerKw' && v) return `${v} kW`;
        return v != null ? String(v) : null;
    };

    if (isLoading) {
        return (
            <LayoutShell activePath="/">
                <div className="flex items-center justify-center min-h-[60vh]">
                    <span className="w-8 h-8 border-[2.5px] border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
                </div>
            </LayoutShell>
        );
    }

    if (!project) return null;

    const imgSrc = isEditing ? (imagePreview || project.productImageUrl) : project.productImageUrl;
    const orderFields = ALL_EDITABLE.filter(f => f.group === 'order');
    const techFields = ALL_EDITABLE.filter(f => f.group === 'tech');
    const descFields = ALL_EDITABLE.filter(f => f.group === 'desc');

    return (
        <LayoutShell activePath="/">
            <div dir="rtl" className="max-w-[820px] mx-auto pb-10">

                {/* ── Top bar ── */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => router.push('/')}
                        className="inline-flex items-center gap-2 text-[13px] text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-180">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                        חזרה לרשימה
                    </button>

                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={cancelEdit}
                                    className="h-9 px-4 text-[13px] font-medium text-neutral-600 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                                >
                                    ביטול
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="h-9 px-5 text-[13px] font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors inline-flex items-center gap-2"
                                >
                                    {isSaving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {isSaving ? 'שומר...' : 'שמור שינויים'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleDelete}
                                    className="h-9 w-9 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                                    title="מחק"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                                <button
                                    onClick={enterEditMode}
                                    className="h-9 px-5 text-[13px] font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 shadow-sm"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    עריכה
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Single card ── */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">

                    {/* Card header */}
                    <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-[20px] font-bold text-neutral-900 tracking-tight truncate">
                                    {project.sku || 'ללא מק"ט'}
                                </h1>
                                {project.workOrderNumber && (
                                    <span className="shrink-0 text-[12px] font-mono text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
                                        #{project.workOrderNumber}
                                    </span>
                                )}
                                {project.rowNumber && (
                                    <span className="shrink-0 text-[11px] font-mono text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded">
                                        שורה {project.rowNumber}
                                    </span>
                                )}
                            </div>
                            {project.productDescription && (
                                <p className="text-[13px] text-neutral-500 leading-relaxed mt-1 line-clamp-2">
                                    {project.productDescription}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {project.thermostat && (
                                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                    תרמוסטט
                                </span>
                            )}
                            {project.mainSwitch && (
                                <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                    מפסק ראשי
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Card body: image + fields side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">

                        {/* Fields */}
                        <div className="p-6 border-l border-neutral-100">

                            {/* Order fields */}
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.08em] mb-3">פרטי הזמנה</h3>
                                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                    {orderFields.map(f => (
                                        <FieldCell key={f.key} label={f.label} value={val(f.key)} isEditing={isEditing} formValue={form[f.key]} type={f.type} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
                                    ))}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-neutral-100 mb-6" />

                            {/* Tech fields */}
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.08em] mb-3">נתונים טכניים</h3>
                                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                    {techFields.map(f => (
                                        <FieldCell key={f.key} label={f.label} value={val(f.key)} isEditing={isEditing} formValue={form[f.key]} type={f.type} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
                                    ))}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-neutral-100 mb-6" />

                            {/* Description fields */}
                            <div>
                                <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.08em] mb-3">תיאור</h3>
                                <div className="space-y-3">
                                    {descFields.map(f => (
                                        <FieldCell key={f.key} label={f.label} value={val(f.key)} isEditing={isEditing} formValue={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} wide />
                                    ))}
                                </div>
                            </div>

                            {/* Dimensions */}
                            {!isEditing && project.technicalDimensions && (
                                <>
                                    <div className="border-t border-neutral-100 my-6" />
                                    <div>
                                        <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.08em] mb-4">מידות</h3>
                                        <pre className="text-[13px] font-mono text-neutral-600 leading-relaxed whitespace-pre-wrap bg-neutral-50 rounded-lg p-4 border border-neutral-100" dir="ltr">
                                            {(() => { try { return JSON.stringify(JSON.parse(project.technicalDimensions), null, 2); } catch { return project.technicalDimensions; } })()}
                                        </pre>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Image panel — fixed square */}
                        <div className="self-start">
                            <div className="w-[280px] h-[280px] bg-white relative">
                                {isEditing ? (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center cursor-pointer group"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {imgSrc ? (
                                            <>
                                                <img src={imgSrc} alt="" className="max-w-full max-h-full object-contain p-3" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-2">
                                                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                        </div>
                                                        <span className="text-white text-[11px] font-medium">החלף תמונה</span>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-neutral-400">
                                                <div className="w-12 h-12 rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center">
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                </div>
                                                <span className="text-[11px] font-medium">לחץ להעלאת תמונה</span>
                                            </div>
                                        )}
                                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        {imgSrc ? (
                                            <img src={imgSrc} alt="" className="max-w-full max-h-full object-contain p-3" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-neutral-300">
                                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                                <span className="text-[11px]">אין תמונה</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sheet info footer */}
                    {project.totalSheets && (
                        <div className="px-6 py-2.5 border-t border-neutral-100 bg-neutral-50/50 text-center">
                            <span className="text-[11px] text-neutral-400">
                                דף {project.sheetNumber || '?'} מתוך {project.totalSheets}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </LayoutShell>
    );
}

function FieldCell({ label, value, isEditing, formValue, type, onChange, wide }: {
    label: string;
    value: string | null;
    isEditing: boolean;
    formValue?: string;
    type?: string;
    onChange: (v: string) => void;
    wide?: boolean;
}) {
    return (
        <div className={wide ? 'col-span-2' : ''}>
            <div className="text-[11px] font-semibold text-neutral-400 mb-1.5">{label}</div>
            {isEditing ? (
                <input
                    type={type || 'text'}
                    value={formValue ?? ''}
                    onChange={e => onChange(e.target.value)}
                    dir="rtl"
                    className="w-full h-9 px-3 rounded-lg border border-neutral-200 bg-white text-[14px] text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/5 transition-all placeholder:text-neutral-300"
                    placeholder="—"
                />
            ) : (
                <div className="text-[14px] text-neutral-800 min-h-[36px] flex items-center">
                    {value || <span className="text-neutral-300">—</span>}
                </div>
            )}
        </div>
    );
}
