import React from 'react';

/**
 * Super simple modal overlay using native dialog or absolute positioning.
 * For this dashboard, we'll use a fixed overlay.
 */
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children, footer }: ModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in"
                onClick={onClose}
            />

            {/* Modal Dialog */}
            <div className="relative bg-bg-secondary w-full max-w-lg rounded-xl shadow-modal flex flex-col animate-slide-up border border-border-base mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-base">
                    <h2 className="text-[18px] font-semibold text-text-primary">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-text-tertiary hover:text-text-primary transition-colors p-1"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-6 py-4 bg-bg-tertiary border-t border-border-base rounded-b-xl flex justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
