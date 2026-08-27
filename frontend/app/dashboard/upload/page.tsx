"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { getSubjects, Subject } from "@/lib/api-client";
import { useUploadQueue } from "@/lib/use-upload-queue";

export default function UploadPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState("");
    const [caption, setCaption] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { queue, isOnline, rateLimitMessage, addToQueue, retryFailed } = useUploadQueue();

    useEffect(() => {
        getSubjects().then((data) => {
            const active = data.filter((s) => !s.archived);
            setSubjects(active);
            if (active.length > 0) setSelectedSubjectId(active[0].id);
        });
    }, []);

    async function processFiles(files: FileList | File[]) {
        const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!selectedSubjectId || arr.length === 0) return;
        for (const file of arr) {
            await addToQueue(selectedSubjectId, file, caption || undefined);
        }
        setCaption("");
    }

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        if (e.target.files) processFiles(e.target.files);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
    }

    const uploading = queue.filter((u) => u.status === "uploading" || u.status === "pending");
    const failed = queue.filter((u) => u.status === "failed");

    return (
        <div className="mx-auto max-w-2xl px-8 py-8">
            {/* Header */}
            <h1 className="text-3xl font-bold tracking-tight text-[#111c2d]">Upload photos</h1>
            <p className="mt-1 text-sm text-[#727687]">
                Drag and drop lecture images, notes, or study documents — the system will process them automatically.
            </p>

            {/* Offline banner */}
            {!isOnline && (
                <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <span>📶</span>
                    <span>No connection — files will be queued and sent when you&apos;re back online.</span>
                </div>
            )}

            {/* Rate limit banner */}
            {rateLimitMessage && (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    <span>⏳</span>
                    <span>{rateLimitMessage}</span>
                </div>
            )}

            {/* Subject selector */}
            <div className="mt-6">
                <label className="block text-sm font-medium text-[#424656]">Upload to subject</label>
                <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-[#c2c6d8] bg-white px-3 text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                >
                    {subjects.length === 0 ? (
                        <option value="">No subjects — create one first</option>
                    ) : (
                        subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))
                    )}
                </select>
            </div>

            {/* Caption */}
            <div className="mt-4">
                <label className="block text-sm font-medium text-[#424656]">Caption (optional)</label>
                <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="e.g. Chapter 3 — Integration"
                    className="mt-1.5 h-10 w-full rounded-lg border border-[#c2c6d8] bg-white px-3 text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                />
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`mt-6 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
                    isDragging
                        ? "border-[#0050cb] bg-[#e7eeff]"
                        : "border-[#c2c6d8] bg-white hover:border-[#0050cb] hover:bg-[#f0f3ff]"
                }`}
            >
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${isDragging ? "bg-[#0050cb]" : "bg-[#e7eeff]"}`}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isDragging ? "white" : "#0050cb"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                    </svg>
                </div>
                <div>
                    <p className="text-base font-semibold text-[#111c2d]">Drop images here</p>
                    <p className="mt-0.5 text-sm text-[#727687]">or</p>
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedSubjectId}
                    className="rounded-lg bg-[#0050cb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                >
                    Choose from device
                </button>
                <p className="text-xs text-[#727687]">Supports JPG, PNG, WEBP (max 10 MB/file)</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {/* Upload progress list */}
            {uploading.length > 0 && (
                <div className="mt-6">
                    <p className="text-sm font-semibold text-[#424656]">Uploading</p>
                    <div className="mt-3 space-y-3">
                        {uploading.map((item) => (
                            <div key={item.clientUploadId} className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3">
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#e7eeff]">
                                    <img
                                        src={`data:${item.fileType};base64,${item.fileDataUrl.split(",")[1]}`}
                                        alt={item.fileName}
                                        className="h-full w-full object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-[#111c2d]">{item.fileName}</p>
                                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#e7eeff]">
                                        <div
                                            className={`h-full rounded-full bg-[#0050cb] transition-all ${item.status === "uploading" ? "w-3/4" : "w-0"}`}
                                        />
                                    </div>
                                    <p className="mt-1 text-[11px] text-[#727687]">
                                        {item.status === "uploading" ? "Uploading…" : "Waiting for connection"}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Failed items */}
            {failed.length > 0 && (
                <div className="mt-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#ba1a1a]">Failed ({failed.length})</p>
                        <button
                            onClick={retryFailed}
                            className="text-sm font-medium text-[#0050cb] underline underline-offset-2 hover:text-[#0066ff]"
                        >
                            Retry all
                        </button>
                    </div>
                    <div className="mt-3 space-y-2">
                        {failed.map((item) => (
                            <div key={item.clientUploadId} className="flex items-center gap-3 rounded-xl border border-[#ffdad6] bg-[#fff5f5] px-3 py-2.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ba1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                                <p className="min-w-0 flex-1 truncate text-sm text-[#93000a]">{item.fileName}</p>
                                {item.errorMessage && (
                                    <span className="shrink-0 text-xs text-[#727687]">{item.errorMessage}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
