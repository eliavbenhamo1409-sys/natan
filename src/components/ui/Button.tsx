import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
    isLoading?: boolean;
    asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', isLoading, asChild, children, disabled, ...props }, ref) => {
        if (asChild && React.isValidElement(children)) {
            const child = children as React.ReactElement<any>;
            return React.cloneElement(child, {
                className: `btn btn-${variant} ${className} ${child.props.className || ''}`,
                ...props
            } as React.HTMLAttributes<HTMLElement>);
        }

        return (
            <button
                ref={ref}
                className={`btn btn-${variant} ${className}`}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
                {children}
            </button>
        );
    }
);
Button.displayName = 'Button';
