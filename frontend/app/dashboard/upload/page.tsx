"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { getSubjects, Subject } from "@/lib/api-client";
import { useUploadQueue } from "@/lib/use-upload-queue";

function Thumbnail({ buffer, type, alt }: { buffer: ArrayBuffer; type: string; alt: string }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        if (!buffer) return;
        const blob = new Blob([buffer], { type });
        const u = URL.createObjectURL(blob);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [buffer, type]);
    if (!url) return null;
    return <img src={url} alt={alt} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
}

export default function UploadPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState("");
    const [caption, setCaption] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const { queue, isOnline, rateLimitMessage, addToQueue, retryFailed } = useUploadQueue();

    useEffect(() => {
        getSubjects().then((data) => {
            const active = data.filter((s) => !s.archived);
            setSubjects(active);
            if (active.length > 0) setSelectedSubjectId(active[0].id);
        });
    }, []);

    async function processFiles(files: FileList | File[]) {
        try {
            if (files.length === 0) {
                alert("No files selected.");
                return;
            }
            const arr = Array.from(files).filter((f) => {
                // Some mobile browsers might not set the type when capturing from camera
                return f.type.startsWith("image/") || !f.type || f.name.toLowerCase().endsWith(".jpg") || f.name.toLowerCase().endsWith(".jpeg") || f.name.toLowerCase().endsWith(".png") || f.name.toLowerCase().endsWith(".heic");
            });

            if (arr.length === 0) {
                alert(`No valid images found. First file type: ${files[0]?.type}, name: ${files[0]?.name}`);
                return;
            }

            if (!selectedSubjectId) {
                alert("Please select a subject first.");
                return;
            }

            // EAGERLY read all array buffers to prevent iOS Safari from garbage collecting 
            // the temporary camera files after the change event finishes.
            const fileDataPairs = await Promise.all(
                arr.map(async (file) => {
                    const buffer = await file.arrayBuffer();
                    return { file, buffer };
                })
            );

            for (const { file, buffer } of fileDataPairs) {
                if (file.size > 20 * 1024 * 1024) {
                    alert(`Warning: ${file.name} is larger than 20MB (${(file.size / 1024 / 1024).toFixed(1)}MB). The upload might fail.`);
                }
                await addToQueue(selectedSubjectId, file, buffer, caption || undefined);
            }
            setCaption("");
        } catch (error) {
            alert(`Error processing files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        if (e.target.files) processFiles(e.target.files);
        // Clear both inputs so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
    }

    const uploading = queue.filter((u) => u.status === "uploading" || u.status === "pending");
    const failed = queue.filter((u) => u.status === "failed");

    return (
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
            {/* Header */}
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111c2d]">Upload photos</h1>
            <p className="hidden md:block mt-1 text-sm text-[#727687]">
                Drag and drop lecture images, notes, or study documents — the system will process them automatically.
            </p>
            <p className="md:hidden mt-1 text-[13px] text-[#727687]">
                Take photos or select images from your gallery.
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
            <div className="mt-6 md:mt-8">
                <label className="block text-sm font-medium text-[#424656]">Upload to subject</label>
                <div className="relative mt-2">
                    <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="appearance-none h-12 md:h-10 w-full rounded-xl md:rounded-lg border border-[#c2c6d8] bg-white px-4 md:px-3 text-[15px] md:text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                    >
                    {subjects.length === 0 ? (
                        <option value="">No subjects — create one first</option>
                    ) : (
                        subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))
                    )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[#727687]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                </div>
            </div>

            {/* Caption */}
            <div className="mt-4">
                <label className="block text-sm font-medium text-[#424656]">Caption (optional)</label>
                <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="e.g. Chapter 3 — Integration"
                    className="mt-2 h-12 md:h-10 w-full rounded-xl md:rounded-lg border border-[#c2c6d8] bg-white px-4 md:px-3 text-[15px] md:text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                />
            </div>

            {/* Mobile Camera Capture */}
            <div className="mt-8 flex flex-col gap-3">
                <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={!selectedSubjectId}
                    className="flex w-full h-14 items-center justify-center gap-2.5 rounded-xl bg-[#0050cb] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0066ff] disabled:opacity-50 transition-transform active:scale-[0.98]"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                    </svg>
                    Take Photo
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedSubjectId}
                    className="md:hidden flex w-full h-14 items-center justify-center gap-2.5 rounded-xl bg-[#e7eeff] text-[15px] font-semibold text-[#0050cb] hover:bg-[#d6e2ff] disabled:opacity-50 transition-transform active:scale-[0.98]"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Choose from Gallery
                </button>
            </div>

            <div className="hidden md:flex mt-6 items-center gap-4">
                <div className="h-px flex-1 bg-[#e2e8f0]"></div>
                <span className="text-sm font-medium text-[#727687]">OR</span>
                <div className="h-px flex-1 bg-[#e2e8f0]"></div>
            </div>

            {/* Drop zone (Desktop only) */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`hidden md:flex mt-4 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
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
                    className="rounded-lg bg-[#e7eeff] px-5 py-2.5 text-sm font-semibold text-[#0050cb] hover:bg-[#d6e2ff] disabled:opacity-50 transition-colors"
                >
                    Choose from Gallery
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
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
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
                                    <Thumbnail buffer={item.fileBuffer} type={item.fileType} alt={item.fileName} />
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
