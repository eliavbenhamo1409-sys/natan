'use client';

import { useState, useEffect, useMemo } from 'react';
import { LayoutShell } from '@/components/ui/LayoutShell';
import { SearchBar } from '@/components/ui/SearchBar';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { UploadZone } from '@/components/ui/UploadZone';
import { Modal } from '@/components/ui/Modal';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  const [allData, setAllData] = useState<any[]>([]);
  const [aiResults, setAiResults] = useState<any[] | null>(null);
  const [textFilter, setTextFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [activeAiQuery, setActiveAiQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const loadAllProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setAllData(json.projects || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadAllProjects(); }, []);

  useEffect(() => {
    if (aiResults !== null) return;
    const hasProcessing = allData.some(p => p.extractionStatus === 'processing' || p.extractionStatus === 'pending');
    if (!hasProcessing) return;
    const interval = setInterval(loadAllProjects, 5000);
    return () => clearInterval(interval);
  }, [allData, aiResults]);

  const filteredData = useMemo(() => {
    if (aiResults !== null) return aiResults;
    if (!textFilter.trim()) return allData;
    const q = textFilter.toLowerCase();
    return allData.filter(p =>
      (p.sku || '').toLowerCase().includes(q) ||
      (p.customerName || '').toLowerCase().includes(q) ||
      (p.productDescription || '').toLowerCase().includes(q) ||
      (p.workOrderNumber || '').toLowerCase().includes(q) ||
      (p.plannerName || '').toLowerCase().includes(q) ||
      (p.voltage || '').toLowerCase().includes(q)
    );
  }, [allData, aiResults, textFilter]);

  const handleTextFilter = (query: string) => {
    setTextFilter(query);
    setAiResults(null);
    setActiveAiQuery('');
    setSuggestions([]);
  };

  const handleAiSearch = async (query: string) => {
    setIsAiSearching(true);
    setSuggestions([]);
    setError(null);
    try {
      const res = await fetch(`/api/projects/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI search failed');
      setAiResults(json.projects || []);
      setSuggestions(json.suggestions || []);
      setActiveAiQuery(query);
      setTextFilter('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAiSearching(false);
    }
  };

  const handleClearAi = () => {
    setAiResults(null);
    setActiveAiQuery('');
    setSuggestions([]);
    setTextFilter('');
  };

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
      setAllData(prev => prev.filter(p => p.id !== projectId));
      if (aiResults) setAiResults(prev => prev!.filter(p => p.id !== projectId));
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
      await loadAllProjects();
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
      await loadAllProjects();
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
      render: (row: any) => (
        <div className="relative w-14 h-14 rounded-lg overflow-visible bg-bg-tertiary border border-border-base flex items-center justify-center flex-shrink-0 group/img">
          {row.productImageUrl ? (
            <>
              <img src={row.productImageUrl} alt="" className="w-full h-full object-contain rounded-lg" />
              <div className="pointer-events-none absolute z-50 left-0 top-0 w-[336px] h-[336px] rounded-xl border border-border-strong bg-bg-secondary shadow-modal overflow-hidden opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 -translate-y-1/4">
                <img src={row.productImageUrl} alt="" className="w-full h-full object-contain p-2" />
              </div>
            </>
          ) : (
            <svg className="w-5 h-5 text-text-tertiary opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          )}
        </div>
      ),
    },
    { key: 'sku', title: 'SKU / Part No', width: '12%' },
    { key: 'customerName', title: 'Customer', width: '15%' },
    { key: 'workOrderNumber', title: 'Work Order', width: '11%' },
    { key: 'productDescription', title: 'Description', width: '22%' },
    { key: 'plannerName', title: 'Planner', width: '10%' },
    {
      key: 'drawingDate',
      title: 'Date',
      width: '10%',
      render: (row: any) => row.drawingDate || '-'
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
              isSearching={isAiSearching}
              isFiltered={!!textFilter || !!activeAiQuery}
              externalQuery={activeAiQuery}
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
            {activeAiQuery ? 'פרויקטים דומים' : textFilter ? 'תוצאות סינון' : 'כל הפרויקטים'}
            <Badge variant="neutral" className="mr-1 bg-border-base">{filteredData.length}</Badge>
          </div>
        </div>

        {suggestions.length > 0 && aiResults !== null && aiResults.length === 0 && (
          <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '24px 0' }}>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>לא נמצא פרויקט דומה. נסה לחפש לפי:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {suggestions.map((s, i) => (
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

        <div className="flex-1 min-h-0">
          <Table
            data={filteredData}
            columns={columns}
            isLoading={isLoading}
            onRowClick={(row) => router.push(`/records/${row.id}`)}
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
