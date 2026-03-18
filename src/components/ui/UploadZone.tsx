'use client';

import React, { useCallback, useState } from 'react';

interface UploadZoneProps {
    onUpload: (file: File) => Promise<void>;
    isUploading?: boolean;
}

export const UploadZone = ({ onUpload, isUploading }: UploadZoneProps) => {
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragActive(false);

            if (isUploading) return;

            const files = e.dataTransfer.files;
            if (files?.length > 0) {
                const file = files[0];
                if (file.type === 'application/pdf') {
                    await onUpload(file);
                } else {
                    alert('Please upload a PDF file.');
                }
            }
        },
        [onUpload, isUploading]
    );

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (isUploading) return;

        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.type === 'application/pdf') {
                await onUpload(file);
            } else {
                alert('Please upload a PDF file.');
            }
            // Reset input so the same file could be selected again if needed
            e.target.value = '';
        }
    };

    return (
        <div
            className={`relative w-full border-2 border-dashed rounded-xl p-10 text-center transition-colors flex flex-col items-center justify-center min-h-[250px]
        ${isDragActive ? 'border-accent-base bg-accent-soft/50' : 'border-border-strong hover:border-text-tertiary bg-bg-secondary'}
        ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
      `}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <input
                id="file-upload"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleChange}
                disabled={isUploading}
            />

            {isUploading ? (
                <div className="flex flex-col items-center gap-4 text-accent-base">
                    <span className="w-8 h-8 border-3 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="font-medium text-[15px]">Processing PDF...</p>
                </div>
            ) : (
                <>
                    <div className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center mb-4 text-text-tertiary">
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <polyline points="9 15 12 12 15 15" />
                        </svg>
                    </div>
                    <p className="text-[15px] font-medium text-text-primary mb-1">
                        Click or drag to upload PDF
                    </p>
                    <p className="text-[13px] text-text-tertiary">
                        Only .pdf files are supported
                    </p>
                </>
            )}
        </div>
    );
};
