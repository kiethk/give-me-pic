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
        <div className="px-8 py-8">
            {/* Back */}
            <button
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-1.5 text-sm text-[#727687] hover:text-[#0050cb] transition-colors"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
                Back to subjects
            </button>

            {/* Header */}
            <div className="mt-4 flex items-start justify-between">
                <div>
                    {subject && (
                        <div className="flex items-center gap-2.5">
                            <div
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                                style={{ backgroundColor: subject.colorHex }}
                            >
                                {subject.name[0]?.toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-[#111c2d]">{subject.name}</h1>
                                {subject.semester && (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[#727687]">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                        </svg>
                                        Semester {subject.semester}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => router.push("/dashboard/upload")}
                    className="flex items-center gap-2 rounded-lg border border-[#c2c6d8] bg-white px-4 py-2 text-sm font-medium text-[#424656] hover:bg-[#f0f3ff] transition-colors"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                    </svg>
                    Upload new
                </button>
            </div>

            {/* Status filter chips */}
            {!isLoading && media.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                    <button
                        onClick={() => setFilter("all")}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                            filter === "all"
                                ? "bg-[#111c2d] text-white"
                                : "bg-white border border-[#e2e8f0] text-[#424656] hover:bg-[#f0f3ff]"
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
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                    filter === s
                                        ? `${chip.bg} ${chip.text} ring-2 ring-current ring-offset-1`
                                        : `bg-white border border-[#e2e8f0] ${chip.text} hover:${chip.bg}`
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
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
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {filtered.map((media) => {
                        const status = getOverallStatus(media);
                        const chip = STATUS_CHIPS[status];
                        return (
                            <div
                                key={media.id}
                                className="group relative overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm"
                            >
                                {/* Image */}
                                <button
                                    className="block w-full"
                                    onClick={() => setPreviewMedia(media)}
                                >
                                    <div className="aspect-square overflow-hidden bg-[#e7eeff]">
                                        <img
                                            src={media.url}
                                            alt={media.caption || media.fileName}
                                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    </div>
                                </button>

                                {/* Status chip overlay */}
                                <div className={`absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.bg} ${chip.text}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${chip.dot} ${status === "processing" ? "animate-pulse" : ""}`} />
                                    {chip.label}
                                </div>

                                {/* Bottom bar */}
                                <div className="p-2.5">
                                    <p className="truncate text-xs font-medium text-[#111c2d]">{media.fileName}</p>
                                    {media.caption && (
                                        <p className="truncate text-[10px] text-[#727687]">{media.caption}</p>
                                    )}

                                    {/* Error + retry */}
                                    {status === "failed" && (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <p
                                                className="flex-1 truncate text-[10px] text-[#ba1a1a]"
                                                title={media.ocrError || media.embeddingError || ""}
                                            >
                                                {media.ocrError || media.embeddingError || "Processing failed"}
                                            </p>
                                            <button
                                                onClick={() => handleRetry(media.id)}
                                                disabled={isRetrying[media.id]}
                                                className="shrink-0 rounded-md bg-[#0050cb] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                                            >
                                                {isRetrying[media.id] ? "…" : "Retry"}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Hover actions */}
                                <div className="absolute inset-x-0 bottom-0 translate-y-full flex justify-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 transition-transform duration-200 group-hover:translate-y-0">
                                    <a
                                        href={media.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#111c2d] hover:bg-white transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Open
                                    </a>
                                    <button
                                        onClick={() => handleDelete(media.id)}
                                        disabled={isDeleting[media.id]}
                                        className="rounded-md bg-[#ba1a1a]/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#ba1a1a] disabled:opacity-50 transition-colors"
                                    >
                                        {isDeleting[media.id] ? "…" : "Delete"}
                                    </button>
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

            {/* Preview modal */}
            {previewMedia && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
                    onClick={() => setPreviewMedia(null)}
                >
                    <div
                        className="max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
                            <p className="text-sm font-semibold text-[#111c2d]">{previewMedia.fileName}</p>
                            <button onClick={() => setPreviewMedia(null)} className="text-[#727687] hover:text-[#111c2d] transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="flex max-h-[80vh] items-center justify-center overflow-auto bg-[#f0f3ff] p-4">
                            <img
                                src={previewMedia.url}
                                alt={previewMedia.fileName}
                                className="max-h-[75vh] object-contain rounded-lg"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
