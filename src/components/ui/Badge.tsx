import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
}

export const Badge = ({ className = '', variant = 'neutral', children, ...props }: BadgeProps) => {
    const variants = {
        success: 'bg-success-soft text-success-base border border-success-base/20',
        warning: 'bg-warning-soft text-warning-base border border-warning-base/20',
        error: 'bg-error-soft text-error-base border border-error-base/20',
        accent: 'bg-accent-soft text-accent-base border border-accent-base/20',
        neutral: 'bg-bg-tertiary text-text-secondary border border-border-base',
    };

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[12px] font-medium ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
};
