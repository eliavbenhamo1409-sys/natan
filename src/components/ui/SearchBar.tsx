'use client';

import { useState, useRef, useEffect } from 'react';

type SearchMode = 'text' | 'ai';

interface SearchBarProps {
    onTextFilter: (query: string) => void;
    onAiSearch: (query: string) => void;
    onReset: () => void;
    isSearching?: boolean;
    isFiltered?: boolean;
    externalQuery?: string;
}

export const SearchBar = ({ onTextFilter, onAiSearch, onReset, isSearching, isFiltered, externalQuery }: SearchBarProps) => {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState<SearchMode>('text');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (externalQuery !== undefined && externalQuery !== query) {
            setQuery(externalQuery);
        }
    }, [externalQuery]);

    const handleChange = (value: string) => {
        setQuery(value);
        if (mode === 'text') onTextFilter(value);
    };

    const handleModeSwitch = (newMode: SearchMode) => {
        setMode(newMode);
        if (newMode === 'text') onTextFilter(query);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') handleReset();
        if (e.key === 'Enter' && mode === 'ai' && query.trim() && !isSearching) {
            e.preventDefault();
            onAiSearch(query);
        }
    };

    const handleReset = () => {
        setQuery('');
        onReset();
        inputRef.current?.focus();
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', direction: 'rtl', width: '100%' }}>
            {/* Toggle */}
            <div style={{
                display: 'flex',
                height: '36px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #d1d5db',
                flexShrink: 0,
            }}>
                <button
                    type="button"
                    onClick={() => handleModeSwitch('text')}
                    style={{
                        padding: '0 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        backgroundColor: mode === 'text' ? '#111827' : '#fff',
                        color: mode === 'text' ? '#fff' : '#6b7280',
                    }}
                >
                    חיפוש רגיל
                </button>
                <div style={{ width: '1px', backgroundColor: '#d1d5db' }} />
                <button
                    type="button"
                    onClick={() => handleModeSwitch('ai')}
                    style={{
                        padding: '0 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        backgroundColor: mode === 'ai' ? '#111827' : '#fff',
                        color: mode === 'ai' ? '#fff' : '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    חיפוש חכם
                    {isSearching && (
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                        </span>
                    )}
                </button>
            </div>

            <div style={{ width: '1px', height: '18px', backgroundColor: '#d1d5db', flexShrink: 0 }} />

            {/* Input */}
            <div style={{ position: 'relative', flex: 1 }}>
                <div style={{
                    position: 'absolute',
                    top: 0, bottom: 0, right: '10px',
                    display: 'flex', alignItems: 'center',
                    pointerEvents: 'none',
                }}>
                    {isSearching ? (
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                        </span>
                    ) : (
                        <svg style={{ width: 16, height: 16, color: '#9ca3af' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    dir="rtl"
                    placeholder={mode === 'ai' ? 'תאר את הפרויקט שאתה מחפש ולחץ Enter...' : 'סנן לפי מק"ט, לקוח, תיאור...'}
                    style={{
                        width: '100%',
                        height: '36px',
                        paddingRight: '34px',
                        paddingLeft: '30px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#fff',
                        color: '#111827',
                        outline: 'none',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                />

                {query && !isFiltered && (
                    <button
                        type="button"
                        onClick={() => { setQuery(''); onTextFilter(''); inputRef.current?.focus(); }}
                        style={{
                            position: 'absolute',
                            top: 0, bottom: 0, left: '8px',
                            display: 'flex', alignItems: 'center',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#9ca3af', padding: 0,
                        }}
                    >
                        <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Reset button */}
            {isFiltered && (
                <button
                    type="button"
                    onClick={handleReset}
                    style={{
                        height: '36px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#fff',
                        color: '#111827',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#111827'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111827'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.color = '#111827'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                >
                    <svg style={{ width: 12, height: 12 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    איפוס
                </button>
            )}
        </div>
    );
};
