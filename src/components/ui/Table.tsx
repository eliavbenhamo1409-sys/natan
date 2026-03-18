import React from 'react';

interface Column<T> {
    key: keyof T | string;
    title: string;
    render?: (item: T) => React.ReactNode;
    width?: string;
}

interface TableProps<T> {
    data: T[];
    columns: Column<T>[];
    onRowClick?: (item: T) => void;
    isLoading?: boolean;
}

export function Table<T>({ data, columns, onRowClick, isLoading }: TableProps<T>) {
    return (
        <div className="w-full h-full bg-bg-secondary border border-border-base rounded-lg shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                        <tr className="border-b border-border-base bg-bg-tertiary/50">
                            {columns.map((col, i) => (
                                <th
                                    key={String(col.key)}
                                    className="px-4 py-3 text-[12px] font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap"
                                    style={{ width: col.width }}
                                >
                                    {col.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {columns.map((col, j) => (
                                        <td key={j} className="px-4 py-5">
                                            <div className="h-4 bg-bg-tertiary rounded w-3/4"></div>
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-tertiary">
                                    No records found
                                </td>
                            </tr>
                        ) : (
                            data.map((row, i) => (
                                <tr
                                    key={i}
                                    onClick={() => onRowClick?.(row)}
                                    className={`group transition-colors ${onRowClick ? 'cursor-pointer hover:bg-accent-soft/30' : ''}`}
                                >
                                    {columns.map((col) => (
                                        <td key={String(col.key)} className="px-4 py-4 text-[13px] text-text-primary align-middle">
                                            {col.render ? col.render(row) : String((row as any)[col.key] || '')}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
