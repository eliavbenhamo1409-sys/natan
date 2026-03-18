import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', label, error, ...props }, ref) => {
        return (
            <div className={`input-group ${className}`}>
                {label && <label className="input-label">{label}</label>}
                <input
                    ref={ref}
                    className={`input-field ${error ? 'border-error-base focus:border-error-base focus:ring-error-soft' : ''}`}
                    {...props}
                />
                {error && <span className="text-[12px] text-error-base mt-1">{error}</span>}
            </div>
        );
    }
);
Input.displayName = 'Input';
