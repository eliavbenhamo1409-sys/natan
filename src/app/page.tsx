'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutShell } from '@/components/ui/LayoutShell';
import { SearchBar } from '@/components/ui/SearchBar';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { UploadZone } from '@/components/ui/UploadZone';
import { Modal } from '@/components/ui/Modal';
import { useRouter } from 'next/navigation';
import { useProjectsCache } from '@/lib/projects-cache';

export default function DashboardPage() {
  const router = useRouter();
  const cache = useProjectsCache();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRestoredRef = useRef(false);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // On mount: fetch if stale, restore scroll position
  useEffect(() => {
    if (cache.isFresh && cache.projects.length > 0) {
      cache.patch({ isLoading: false });
    } else {
      cache.fetchProjects();
    }
  }, []);

  // Restore scroll position after data renders
  useEffect(() => {
    if (!scrollRestoredRef.current && !cache.isLoading && cache.projects.length > 0 && cache.scrollTop > 0) {
      scrollRestoredRef.current = true;
      requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector('.overflow-auto');
        if (el) el.scrollTop = cache.scrollTop;
      });
    }
  }, [cache.isLoading, cache.projects.length]);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      const el = scrollRef.current?.querySelector('.overflow-auto');
      if (el) cache.patch({ scrollTop: el.scrollTop });
    };
  }, []);

  // Poll for processing items
  useEffect(() => {
    if (cache.aiResults !== null) return;
    const hasProcessing = cache.projects.some(p => p.extractionStatus === 'processing' || p.extractionStatus === 'pending');
    if (!hasProcessing) return;
    const interval = setInterval(() => cache.fetchProjects({ silent: true, force: true }), 2000);
    return () => clearInterval(interval);
  }, [cache.projects, cache.aiResults]);

  const filteredData = useMemo(() => {
    if (cache.aiResults !== null) return cache.aiResults;
    if (!cache.textFilter.trim()) return cache.projects;
    const q = cache.textFilter.toLowerCase();
    return cache.projects.filter(p =>
      (p.sku || '').toLowerCase().includes(q) ||
      (p.customerName || '').toLowerCase().includes(q) ||
      (p.productDescription || '').toLowerCase().includes(q) ||
      (p.workOrderNumber || '').toLowerCase().includes(q) ||
      (p.plannerName || '').toLowerCase().includes(q) ||
      (p.voltage || '').toLowerCase().includes(q)
    );
  }, [cache.projects, cache.aiResults, cache.textFilter]);

  const handleTextFilter = useCallback((query: string) => {
    cache.patch({ textFilter: query, aiResults: null, activeAiQuery: '', suggestions: [] });
  }, [cache]);

  const handleAiSearch = useCallback(async (query: string) => {
    cache.patch({ isAiSearching: true, suggestions: [] });
    try {
      const res = await fetch(`/api/projects/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI search failed');
      cache.patch({
        aiResults: json.projects || [],
        suggestions: json.suggestions || [],
        activeAiQuery: query,
        textFilter: '',
        isAiSearching: false,
      });
    } catch (e: any) {
      cache.patch({ error: e.message, isAiSearching: false });
    }
  }, [cache]);

  const handleClearAi = useCallback(() => {
    cache.patch({ aiResults: null, activeAiQuery: '', suggestions: [], textFilter: '' });
  }, [cache]);

  const handleSuggestionClick = (suggestion: string) => {
    handleAiSearch(suggestion);
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('למחוק את הרשומה?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Delete failed');
      }
      cache.removeProject(projectId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const [manualForm, setManualForm] = useState({
    sku: '', customerName: '', workOrderNumber: '', productDescription: '',
    plannerName: '', drawingDate: '', voltage: '', quantity: '',
  });
  const [isSavingManual, setIsSavingManual] = useState(false);

  const handleManualSave = async () => {
    setIsSavingManual(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm),
      });
      if (!res.ok) throw new Error('Failed to create project');
      setManualForm({ sku: '', customerName: '', workOrderNumber: '', productDescription: '', plannerName: '', drawingDate: '', voltage: '', quantity: '' });
      setIsManualModalOpen(false);
      handleClearAi();
      cache.invalidate();
      await cache.fetchProjects({ force: true });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/projects', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      setIsUploadModalOpen(false);
      handleClearAi();
      cache.invalidate();
      await cache.fetchProjects({ force: true });
    } catch (e) {
      console.error(e);
      alert('Failed to upload file.');
    } finally {
      setIsUploading(false);
    }
  };

  const columns = [
    {
      key: 'productImageUrl',
      title: 'Image',
      width: '72px',
      render: (row: any) => {
        const isProcessing = row.extractionStatus === 'pending' || row.extractionStatus === 'processing';
        return (
        <div className="relative w-14 h-14 rounded-lg overflow-visible bg-white border border-border-base flex items-center justify-center flex-shrink-0 group/img">
          {row.productImageUrl ? (
            <>
              <img src={row.productImageUrl} alt="" className="w-full h-full object-contain rounded-lg" />
              <div className="pointer-events-none absolute z-50 left-0 top-0 w-[336px] h-[336px] rounded-xl border border-border-base bg-white shadow-modal overflow-hidden opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 -translate-y-1/4">
                <img src={row.productImageUrl} alt="" className="w-full h-full object-contain" />
              </div>
            </>
          ) : (
            <span className="flex items-center justify-center w-full h-full">
              {isProcessing ? (
                <svg className="image-circle-fill" viewBox="0 0 40 40" aria-hidden>
                  <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-border-base)" strokeWidth="3" />
                  <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-accent-base)" strokeWidth="3" strokeLinecap="round" strokeDasharray="107" strokeDashoffset="107" className="image-circle-fill-stroke" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-text-tertiary opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              )}
            </span>
          )}
        </div>
      );
      },
    },
    { key: 'sku', title: 'SKU / Part No', width: '12%' },
    { key: 'customerName', title: 'Customer', width: '15%' },
    { key: 'workOrderNumber', title: 'Work Order', width: '11%' },
    {
      key: 'productDescription',
      title: 'Description',
      width: '22%',
      render: (row: any) => {
        const isProcessing = row.extractionStatus === 'pending' || row.extractionStatus === 'processing';
        if (isProcessing) {
          return (
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <span className="processing-dots">בעיבוד</span>
              <span className="processing-bar" aria-hidden />
            </span>
          );
        }
        return row.productDescription || '-';
      },
    },
    { key: 'plannerName', title: 'Planner', width: '10%' },
    {
      key: 'drawingDate',
      title: 'Date',
      width: '10%',
      render: (row: any) => row.drawingDate || '-'
    },
    {
      key: 'rowNumber',
      title: '#',
      width: '40px',
      render: (row: any, index: number) => (
        <span className="text-[12px] text-text-tertiary font-mono">{row.rowNumber || index + 1}</span>
      ),
    },
    {
      key: '_actions',
      title: '',
      width: '40px',
      render: (row: any) => (
        <button
          onClick={(e) => handleDelete(e, row.id)}
          className="p-1.5 rounded-md text-text-tertiary hover:text-error-base hover:bg-error-soft transition-colors"
          title="מחק"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      ),
    },
  ];

  return (
    <LayoutShell activePath="/">
      <div className="flex flex-col gap-5 h-full animate-fade-in">

      <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1">
            <SearchBar
              onTextFilter={handleTextFilter}
              onAiSearch={handleAiSearch}
              onReset={handleClearAi}
              isSearching={cache.isAiSearching}
              isFiltered={!!cache.textFilter || !!cache.activeAiQuery}
              externalQuery={cache.activeAiQuery}
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" onClick={() => setIsManualModalOpen(true)}>
              <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              הוספה ידנית
            </Button>
            <Button variant="primary" className="shadow-md" onClick={() => setIsUploadModalOpen(true)}>
              <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              העלאת PDF
            </Button>
          </div>
        </div>

        <div className="flex items-center" dir="rtl">
          <div className="flex items-center gap-2 text-sm text-text-primary font-medium">
            {cache.activeAiQuery ? 'פרויקטים דומים' : cache.textFilter ? 'תוצאות סינון' : 'כל הפרויקטים'}
            <Badge variant="neutral" className="mr-1 bg-border-base">{filteredData.length}</Badge>
          </div>
        </div>

        {cache.suggestions.length > 0 && cache.aiResults !== null && cache.aiResults.length === 0 && (
          <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '24px 0' }}>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>לא נמצא פרויקט דומה. נסה לחפש לפי:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {cache.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s)}
                  style={{
                    padding: '7px 16px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: '#111827',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#111827'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111827'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.color = '#111827'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 min-h-0">
          <Table
            data={filteredData}
            columns={columns}
            isLoading={cache.isLoading}
            onRowClick={(row) => router.push(`/records/${row.id}`)}
            getRowClassName={(row) =>
              row.extractionStatus === 'pending' || row.extractionStatus === 'processing'
                ? 'row-processing'
                : ''
            }
          />
        </div>
      </div>

      <Modal isOpen={isUploadModalOpen} onClose={() => !isUploading && setIsUploadModalOpen(false)} title="העלאת קובץ PDF">
        <UploadZone onUpload={handleUpload} isUploading={isUploading} />
      </Modal>

      <Modal
        isOpen={isManualModalOpen}
        onClose={() => !isSavingManual && setIsManualModalOpen(false)}
        title="הוספת פרויקט ידנית"
        footer={
          <>
            <button onClick={() => setIsManualModalOpen(false)} disabled={isSavingManual} className="px-4 py-2 text-[13px] text-text-secondary hover:text-text-primary transition-colors rounded-lg">ביטול</button>
            <button onClick={handleManualSave} disabled={isSavingManual} className="px-5 py-2 text-[13px] font-medium bg-accent-base text-white rounded-lg hover:bg-accent-base/90 transition-colors disabled:opacity-50">
              {isSavingManual ? 'שומר...' : 'צור פרויקט'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3" dir="rtl">
          {[
            { key: 'sku', label: 'מק"ט', placeholder: 'לדוגמה HE-2500' },
            { key: 'customerName', label: 'לקוח', placeholder: 'שם הלקוח' },
            { key: 'workOrderNumber', label: 'פקע', placeholder: 'לדוגמה 12345' },
            { key: 'plannerName', label: 'מתכנן', placeholder: 'שם המתכנן' },
            { key: 'drawingDate', label: 'תאריך', placeholder: '2026-03-18' },
            { key: 'voltage', label: 'מתח', placeholder: '380V' },
            { key: 'quantity', label: 'כמות', placeholder: '10' },
          ].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-secondary">{f.label}</label>
              <input
                type="text"
                dir="rtl"
                value={(manualForm as any)[f.key]}
                onChange={(e) => setManualForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="h-9 px-3 rounded-lg border border-border-strong bg-bg-secondary text-text-primary text-[13px] focus:outline-none focus:ring-2 focus:ring-border-base focus:border-text-secondary transition-all"
              />
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-text-secondary">תיאור</label>
            <input
              type="text"
              dir="rtl"
              value={manualForm.productDescription}
              onChange={(e) => setManualForm(prev => ({ ...prev, productDescription: e.target.value }))}
              placeholder="תיאור המוצר"
              className="h-9 px-3 rounded-lg border border-border-strong bg-bg-secondary text-text-primary text-[13px] focus:outline-none focus:ring-2 focus:ring-border-base focus:border-text-secondary transition-all"
            />
          </div>
        </div>
      </Modal>
    </LayoutShell>
  );
}
