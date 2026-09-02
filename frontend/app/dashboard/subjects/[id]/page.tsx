"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    deleteMedia,
    getMedia,
    getSubjects,
    MediaItem,
    retryProcessing,
    Subject,
} from "@/lib/api-client";
import { BottomSheet } from "@/components/BottomSheet";

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed";

function getOverallStatus(m: MediaItem): "pending" | "processing" | "completed" | "failed" {
    if (m.ocrStatus === "failed" || m.embeddingStatus === "failed") return "failed";
    if (m.ocrStatus === "completed" && m.embeddingStatus === "completed") return "completed";
    if (m.ocrStatus === "processing" || m.embeddingStatus === "processing") return "processing";
    return "pending";
}

const STATUS_CHIPS: Record<string, { label: string; bg: string; dot: string; text: string }> = {
    pending:    { label: "Pending",    bg: "bg-gray-100",   dot: "bg-gray-400",   text: "text-gray-500" },
    processing: { label: "Processing", bg: "bg-amber-100",  dot: "bg-amber-500",  text: "text-amber-700" },
    completed:  { label: "Completed",  bg: "bg-[#e7eeff]",  dot: "bg-[#0050cb]",  text: "text-[#0050cb]" },
    failed:     { label: "Failed",     bg: "bg-[#ffdad6]",  dot: "bg-[#ba1a1a]",  text: "text-[#ba1a1a]" },
};

export default function SubjectDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [subject, setSubject] = useState<Subject | null>(null);
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<StatusFilter>("all");
    const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});
    const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
    const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
    const [actionMedia, setActionMedia] = useState<MediaItem | null>(null);

    async function load() {
        try {
            const [subjects, items] = await Promise.all([getSubjects(), getMedia(id)]);
            setSubject(subjects.find((s) => s.id === id) ?? null);
            setMedia(items);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => { load(); }, [id]);

    // Auto-poll while any item is pending/processing
    useEffect(() => {
        const inProgress = media.some((m) => {
            const s = getOverallStatus(m);
            return s === "pending" || s === "processing";
        });
        if (!inProgress) return;
        const t = setInterval(() => getMedia(id).then(setMedia).catch(() => undefined), 4000);
        return () => clearInterval(t);
    }, [media, id]);

    async function handleRetry(mediaId: string) {
        setIsRetrying((p) => ({ ...p, [mediaId]: true }));
        try {
            await retryProcessing(mediaId);
            setMedia((prev) =>
                prev.map((m) =>
                    m.id === mediaId
                        ? { ...m, ocrStatus: "pending", ocrError: null, embeddingStatus: "pending", embeddingError: null }
                        : m,
                ),
            );
        } finally {
            setIsRetrying((p) => ({ ...p, [mediaId]: false }));
        }
    }

    async function handleDelete(mediaId: string) {
        if (!confirm("Delete this photo?")) return;
        setIsDeleting((p) => ({ ...p, [mediaId]: true }));
        try {
            await deleteMedia(mediaId);
            setMedia((prev) => prev.filter((m) => m.id !== mediaId));
        } finally {
            setIsDeleting((p) => ({ ...p, [mediaId]: false }));
        }
    }

    // Counts per status for filter chips
    const counts = media.reduce(
        (acc, m) => { acc[getOverallStatus(m)]++; return acc; },
        { pending: 0, processing: 0, completed: 0, failed: 0 } as Record<string, number>,
    );

    const filtered = filter === "all" ? media : media.filter((m) => getOverallStatus(m) === filter);

    return (
        <div className="flex h-full flex-col bg-[#f0f3ff] md:bg-white relative">
            {/* Native-feel Top App Bar */}
            <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#e2e8f0] bg-white px-4 py-3 md:px-8 md:py-5 shadow-sm md:shadow-none">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="flex h-10 w-10 items-center justify-center -ml-2 rounded-full text-[#424656] active:bg-[#f0f3ff] transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>

                <div className="flex-1 text-center truncate px-2">
                    {subject ? (
                        <h1 className="text-lg md:text-2xl font-bold tracking-tight text-[#111c2d] truncate">
                            {subject.name}
                        </h1>
                    ) : (
                        <div className="h-6 w-32 mx-auto animate-pulse rounded bg-[#e2e8f0]"></div>
                    )}
                    {subject?.semester && (
                        <p className="text-[11px] md:text-xs text-[#727687]">Semester {subject.semester}</p>
                    )}
                </div>

                <button
                    onClick={() => router.push("/dashboard/upload")}
                    className="flex h-10 w-10 items-center justify-center -mr-2 rounded-full text-[#0050cb] active:bg-[#e7eeff] transition-colors"
                    aria-label="Upload"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">

            {/* Status filter chips */}
            {!isLoading && media.length > 0 && (
                <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                    <button
                        onClick={() => setFilter("all")}
                        className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
                            filter === "all"
                                ? "bg-[#0050cb] text-white shadow-sm"
                                : "bg-white border border-[#c2c6d8] text-[#424656] hover:bg-[#f0f3ff]"
                        }`}
                    >
                        All ({media.length})
                    </button>
                    {(["processing", "completed", "failed", "pending"] as StatusFilter[]).map((s) => {
                        if (s === "all" || counts[s] === 0) return null;
                        const chip = STATUS_CHIPS[s];
                        return (
                            <button
                                key={s}
                                onClick={() => setFilter(s)}
                                className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
                                    filter === s
                                        ? `${chip.bg} ${chip.text} ring-1 ring-current shadow-sm`
                                        : `bg-white border border-[#c2c6d8] text-[#424656]`
                                }`}
                            >
                                <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
                                {chip.label} ({counts[s]})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Loading skeleton */}
            {isLoading && (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="aspect-square animate-pulse rounded-2xl bg-[#e7eeff]" />
                    ))}
                </div>
            )}

            {/* Photo grid */}
            {!isLoading && filtered.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {filtered.map((media) => {
                        const status = getOverallStatus(media);
                        const chip = STATUS_CHIPS[status];
                        return (
                            <div
                                key={media.id}
                                className="group relative overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                            >
                                {/* Image */}
                                <button
                                    className="block w-full outline-none"
                                    onClick={() => setPreviewMedia(media)}
                                >
                                    <div className="aspect-square overflow-hidden bg-[#f0f3ff] relative">
                                        <img
                                            src={media.url}
                                            alt={media.caption || media.fileName}
                                            className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-black/5 md:group-hover:bg-black/0 transition-colors" />
                                    </div>
                                </button>

                                {/* Top Actions (Mobile-first 3-dots) */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActionMedia(media); }}
                                    className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1.5 text-[#111c2d] shadow-sm backdrop-blur-md active:bg-white"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                                    </svg>
                                </button>

                                {/* Status chip overlay */}
                                <div className={`absolute left-2 top-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${chip.bg} ${chip.text}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${chip.dot} ${status === "processing" ? "animate-pulse" : ""}`} />
                                    {chip.label}
                                </div>

                                {/* Bottom bar */}
                                <div className="p-3">
                                    <p className="truncate text-[13px] font-semibold text-[#111c2d]">{media.fileName}</p>
                                    {media.caption && (
                                        <p className="truncate text-[11px] text-[#727687] mt-0.5">{media.caption}</p>
                                    )}

                                    {/* Error + retry */}
                                    {status === "failed" && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <p
                                                className="flex-1 truncate text-[10px] text-[#ba1a1a] font-medium"
                                                title={media.ocrError || media.embeddingError || ""}
                                            >
                                                {media.ocrError || media.embeddingError || "Processing failed"}
                                            </p>
                                            <button
                                                onClick={() => handleRetry(media.id)}
                                                disabled={isRetrying[media.id]}
                                                className="shrink-0 rounded-md bg-[#0050cb] px-2.5 py-1 text-[11px] font-bold text-white active:scale-95 disabled:opacity-50 transition-transform"
                                            >
                                                {isRetrying[media.id] ? "..." : "Retry"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && media.length === 0 && (
                <div className="mt-16 flex flex-col items-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e7eeff]">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0050cb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-[#111c2d]">No photos yet</h3>
                    <p className="mt-1 text-sm text-[#727687]">Upload your first lecture image to get started.</p>
                    <button
                        onClick={() => router.push("/dashboard/upload")}
                        className="mt-4 rounded-lg bg-[#0050cb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0066ff] transition-colors"
                    >
                        Upload now
                    </button>
                </div>
            )}

            {/* No filtered results */}
            {!isLoading && media.length > 0 && filtered.length === 0 && (
                <div className="mt-16 text-center text-sm text-[#727687]">
                    No photos with status &ldquo;{filter}&rdquo;.
                </div>
            )}

            </div>

            {/* Preview modal */}
            {previewMedia && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
                    onClick={() => setPreviewMedia(null)}
                >
                    <div
                        className="max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
                            <p className="text-sm font-semibold text-[#111c2d] truncate max-w-[200px] md:max-w-md">{previewMedia.fileName}</p>
                            <button onClick={() => setPreviewMedia(null)} className="text-[#727687] hover:text-[#111c2d] transition-colors rounded-full p-1 hover:bg-[#f0f3ff]">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="flex flex-1 min-h-0 items-center justify-center overflow-auto bg-[#f0f3ff] p-4">
                            <img
                                src={previewMedia.url}
                                alt={previewMedia.fileName}
                                className="max-h-[75vh] object-contain rounded-lg shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Media Action Sheet */}
            <BottomSheet
                open={!!actionMedia}
                onClose={() => setActionMedia(null)}
                title="Photo Actions"
            >
                {actionMedia && (
                    <div className="px-4 py-2 space-y-1">
                        <button
                            onClick={() => {
                                setPreviewMedia(actionMedia);
                                setActionMedia(null);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium text-[#111c2d] hover:bg-[#f0f3ff] transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#727687]">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                            View fullscreen
                        </button>
                        
                        <button
                            onClick={() => {
                                window.open(actionMedia.url, '_blank');
                                setActionMedia(null);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium text-[#111c2d] hover:bg-[#f0f3ff] transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#727687]">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download image
                        </button>
                        
                        <button
                            onClick={() => {
                                handleDelete(actionMedia.id);
                                setActionMedia(null);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                            Delete photo
                        </button>
                    </div>
                )}
            </BottomSheet>

        </div>
    );
}
