import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { LayoutShell } from '@/components/ui/LayoutShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import Image from 'next/image';

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const project = await prisma.project.findUnique({
        where: { id },
        include: { user: { select: { username: true } } }
    });

    if (!project) {
        notFound();
    }

    const isComplete = project.extractionStatus === 'completed';
    const isProcessing = project.extractionStatus === 'processing' || project.extractionStatus === 'pending';

    const variants: Record<string, "success" | "warning" | "error" | "neutral" | "accent"> = {
        completed: 'success',
        partial: 'warning',
        processing: 'accent',
        pending: 'neutral',
        failed: 'error'
    };

    return (
        <LayoutShell activePath="/">
            <div className="flex flex-col gap-6 animate-fade-in max-w-5xl mx-auto">

                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-tertiary text-text-secondary transition-colors">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </Link>
                        <h1 className="text-[24px] font-semibold text-text-primary tracking-tight">
                            {project.sku || project.workOrderNumber || 'Unnamed Project'}
                        </h1>
                        <Badge variant={variants[project.extractionStatus] || 'neutral'}>
                            {project.extractionStatus.charAt(0).toUpperCase() + project.extractionStatus.slice(1)}
                        </Badge>
                    </div>

                    <div className="flex gap-3">
                        <Button variant="secondary" disabled={isProcessing}>
                            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                        </Button>
                        <Button variant="primary" asChild>
                            <a href={`/api/files/pdfs/${project.id}`} target="_blank" rel="noreferrer">
                                <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                                View PDF
                            </a>
                        </Button>
                    </div>
                </div>

                {isProcessing && (
                    <div className="card p-8 flex flex-col items-center justify-center min-h-[300px] text-accent-base bg-accent-soft/30">
                        <span className="w-8 h-8 border-3 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 mb-4" />
                        <p className="font-medium text-[15px]">AI is extracting data from this PDF...</p>
                        <p className="text-[13px] text-text-tertiary mt-1">This usually takes about 10-15 seconds.</p>
                    </div>
                )}

                {!isProcessing && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Left Column - Product Image */}
                        <div className="md:col-span-1 flex flex-col gap-6">
                            <div className="card p-1">
                                {project.productImageUrl ? (
                                    <div className="relative w-full aspect-square bg-[#f5f5f5] rounded-lg overflow-hidden flex items-center justify-center p-4">
                                        {/* Using a standard img tag rather than next/image since we serve from an internal API path without known dimensions */}
                                        <img
                                            src={project.productImageUrl}
                                            alt="Product extracting from drawing"
                                            className="max-w-full max-h-full object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div className="relative w-full aspect-square bg-bg-tertiary rounded-lg flex flex-col items-center justify-center text-text-tertiary border border-border-base border-dashed m-1 w-[calc(100%-8px)]">
                                        <svg className="w-10 h-10 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                        </svg>
                                        <span className="text-[13px] font-medium">No image detected</span>
                                    </div>
                                )}

                                <div className="p-4 border-t border-border-base bg-bg-primary mt-1">
                                    <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Confidence Score</div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-border-base rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${project.extractionConfidence && project.extractionConfidence > 0.8 ? 'bg-success-base' : 'bg-warning-base'}`}
                                                style={{ width: `${(project.extractionConfidence || 0) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-[12px] font-medium text-text-primary">
                                            {project.extractionConfidence ? Math.round(project.extractionConfidence * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Data Fields */}
                        <div className="md:col-span-2">
                            <div className="card p-0">
                                <div className="px-6 py-4 border-b border-border-base bg-bg-tertiary/30">
                                    <h3 className="text-[15px] font-semibold text-text-primary">Extracted Details</h3>
                                </div>

                                <div className="p-6">
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                        <DataField label="Customer" value={project.customerName} />
                                        <DataField label="Description" value={project.productDescription} />
                                        <DataField label="SKU / Part Number" value={project.sku} />
                                        <DataField label="Work Order Number" value={project.workOrderNumber} />
                                        <DataField label="Planner / Engineer" value={project.plannerName} />
                                        <DataField label="Drawing Date" value={project.drawingDate} />
                                        <DataField label="Voltage" value={project.voltage} />
                                        <DataField label="Power (kW)" value={project.powerKw ? `${project.powerKw} kW` : null} />
                                        <DataField label="Quantity" value={project.quantity ? String(project.quantity) : null} />
                                        <DataField label="Configuration" value={project.configuration} />

                                        <div className="sm:col-span-2 pt-4 border-t border-border-base mt-2">
                                            <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-4">Technical Details</h4>
                                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <DataField label="Scale" value={project.scale} />
                                                <DataField label="Sheets" value={project.totalSheets ? `${project.sheetNumber || '?'} / ${project.totalSheets}` : null} />
                                                <DataField label="Thermostat Required" value={project.thermostat ? 'Yes' : 'No'} isBoolean />
                                                <DataField label="Main Switch Required" value={project.mainSwitch ? 'Yes' : 'No'} isBoolean />
                                            </dl>
                                        </div>

                                        {project.technicalDimensions && (
                                            <div className="sm:col-span-2 pt-4 border-t border-border-base mt-2">
                                                <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-4">Dimensions</h4>
                                                <div className="bg-bg-tertiary rounded-md p-4 overflow-x-auto text-[13px] font-mono text-text-secondary">
                                                    <pre>{JSON.stringify(JSON.parse(project.technicalDimensions), null, 2)}</pre>
                                                </div>
                                            </div>
                                        )}
                                    </dl>

                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </LayoutShell>
    );
}

function DataField({ label, value, isBoolean = false }: { label: string; value: string | null; isBoolean?: boolean }) {
    if (isBoolean) {
        return (
            <div className="flex flex-col gap-1">
                <dt className="text-[13px] font-medium text-text-tertiary">{label}</dt>
                <dd className="text-[14px] font-medium text-text-primary flex items-center">
                    {value === 'Yes' ? (
                        <Badge variant="success" className="px-2">Yes</Badge>
                    ) : (
                        <span className="text-text-tertiary">No</span>
                    )}
                </dd>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <dt className="text-[13px] font-medium text-text-tertiary">{label}</dt>
            <dd className="text-[14px] font-medium text-text-primary min-h-[21px]">
                {value || <span className="text-text-tertiary italic">Not extracted</span>}
            </dd>
        </div>
    );
}
