"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createSubject, getSubjects, suggestSubject, Subject } from "@/lib/api-client";
import { useUploadQueue } from "@/lib/use-upload-queue";
import { consumePendingUploadFiles, subscribePendingUploadFiles } from "@/lib/pending-upload-store";

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
    return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt={alt} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
    );
}

function inferMimeType(fileName: string, currentType?: string): string {
    if (currentType && currentType.startsWith("image/")) {
        return currentType;
    }
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".heic")) return "image/heic";
    return currentType || "";
}

interface StagedFile {
    file: File;
    buffer: ArrayBuffer;
    previewUrl: string;
}

export default function UploadPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState("");
    const [newSubjectName, setNewSubjectName] = useState("");
    const [caption, setCaption] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiStatusMessage, setAiStatusMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const {
        queue,
        isOnline,
        rateLimitMessage,
        quotaExceededMessage,
        clearQuotaError,
        addToQueue,
        retryFailed,
        removeItem,
        clearFailed,
    } = useUploadQueue();

    useEffect(() => {
        getSubjects()
            .then((data) => {
                const active = data.filter((s) => !s.archived);
                setSubjects(active);
                if (active.length > 0) {
                    setSelectedSubjectId(active[0].id);
                }
            })
            .catch(() => {});
    }, []);

    const handleIncomingFiles = useCallback(async (files: FileList | File[]) => {
        try {
            const rawFiles = Array.from(files);
            if (rawFiles.length === 0) return;

            const normalizedFiles = rawFiles.map((file, idx) => {
                let fileName = file.name;
                const lowerName = fileName.toLowerCase();
                if (lowerName === "image.jpg" || lowerName === "image.jpeg") {
                    const ext = lowerName.endsWith(".jpeg") ? "jpeg" : "jpg";
                    fileName = `photo_${Date.now()}_${idx}.${ext}`;
                }

                const fileType = inferMimeType(fileName, file.type);
                if (fileName !== file.name || fileType !== file.type) {
                    return new File([file], fileName, { type: fileType, lastModified: file.lastModified });
                }
                return file;
            });

            const validFiles = normalizedFiles.filter((f) => {
                return (
                    f.type.startsWith("image/") ||
                    f.name.toLowerCase().endsWith(".jpg") ||
                    f.name.toLowerCase().endsWith(".jpeg") ||
                    f.name.toLowerCase().endsWith(".png") ||
                    f.name.toLowerCase().endsWith(".webp") ||
                    f.name.toLowerCase().endsWith(".heic")
                );
            });

            if (validFiles.length === 0) {
                alert("No valid images selected. Please select JPG, PNG, WEBP, or HEIC images.");
                return;
            }

            const staged: StagedFile[] = await Promise.all(
                validFiles.map(async (file) => {
                    const buffer = await file.arrayBuffer();
                    const previewUrl = URL.createObjectURL(file);
                    return { file, buffer, previewUrl };
                })
            );

            setStagedFiles((prev) => [...prev, ...staged]);

            // Run AI suggestion using the first file
            const firstFile = staged[0].file;
            setIsAnalyzing(true);
            setAiStatusMessage("");

            try {
                const suggestion = await suggestSubject(firstFile);
                if (suggestion.matchedSubjectId) {
                    setSelectedSubjectId(suggestion.matchedSubjectId);
                    const matched = subjects.find((s) => s.id === suggestion.matchedSubjectId);
                    setAiStatusMessage(`Matched existing subject: ${matched ? matched.name : suggestion.suggestedName || "Existing Subject"}`);
                } else if (suggestion.isNew && suggestion.suggestedName) {
                    setSelectedSubjectId("__new__");
                    setNewSubjectName(suggestion.suggestedName);
                    setAiStatusMessage(`Suggested new subject: ${suggestion.suggestedName}`);
                } else if (subjects.length === 0) {
                    setSelectedSubjectId("__new__");
                }
            } catch {
                if (subjects.length === 0) {
                    setSelectedSubjectId("__new__");
                }
            } finally {
                setIsAnalyzing(false);
            }
        } catch (error) {
            alert(`Error reading files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [subjects]);

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        if (e.target.files) handleIncomingFiles(e.target.files);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) handleIncomingFiles(e.dataTransfer.files);
    }

    function removeStagedFile(index: number) {
        setStagedFiles((prev) => {
            const copy = [...prev];
            URL.revokeObjectURL(copy[index].previewUrl);
            copy.splice(index, 1);
            return copy;
        });
    }

    useEffect(() => {
        const pending = consumePendingUploadFiles();
        if (pending.length > 0) {
            const timer = setTimeout(() => {
                handleIncomingFiles(pending);
            }, 0);
            return () => clearTimeout(timer);
        }

        const unsubscribe = subscribePendingUploadFiles((files) => {
            if (files.length > 0) {
                const consumed = consumePendingUploadFiles();
                if (consumed.length > 0) {
                    handleIncomingFiles(consumed);
                }
            }
        });

        return unsubscribe;
    }, [handleIncomingFiles]);

    async function handleStartUpload() {
        if (stagedFiles.length === 0) return;

        let targetSubjectId = selectedSubjectId;

        if (targetSubjectId === "__new__" || (!targetSubjectId && subjects.length === 0)) {
            const nameToCreate = newSubjectName.trim();
            if (!nameToCreate) {
                alert("Please enter a subject name.");
                return;
            }

            setIsSubmitting(true);
            try {
                const created = await createSubject({ name: nameToCreate });
                targetSubjectId = created.id;
                setSubjects((prev) => [created, ...prev]);
                setSelectedSubjectId(created.id);
            } catch (err) {
                alert(`Could not create subject: ${err instanceof Error ? err.message : String(err)}`);
                setIsSubmitting(false);
                return;
            }
        }

        if (!targetSubjectId) {
            alert("Please select or create a subject first.");
            return;
        }

        setIsSubmitting(true);
        try {
            for (const item of stagedFiles) {
                if (item.file.size > 20 * 1024 * 1024) {
                    alert("Warning: An image is larger than 20MB. Upload might fail.");
                }
                await addToQueue(targetSubjectId, item.file, item.buffer, caption || undefined);
            }

            // Cleanup previews
            stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
            setStagedFiles([]);
            setCaption("");
            setAiStatusMessage("");
        } catch (error) {
            alert(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSubmitting(false);
        }
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

            {/* Quota exceeded banner */}
            {quotaExceededMessage && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <div>
                            <p className="font-semibold text-amber-950">Quota limit reached</p>
                            <p className="mt-0.5 text-[13px] text-amber-900">{quotaExceededMessage}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                            type="button"
                            onClick={() =>
                                window.dispatchEvent(
                                    new CustomEvent("open-upgrade-modal", {
                                        detail: { message: quotaExceededMessage },
                                    })
                                )
                            }
                            className="rounded-lg bg-[#0050cb] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0042a8]"
                        >
                            Upgrade Pro
                        </button>
                        <button
                            type="button"
                            onClick={clearQuotaError}
                            aria-label="Dismiss quota alert"
                            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Drop zone (Desktop only) */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`hidden md:flex mt-6 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                    isDragging
                        ? "border-[#0050cb] bg-[#e7eeff]"
                        : "border-[#c2c6d8] bg-white hover:border-[#0050cb] hover:bg-[#f0f3ff]"
                }`}
            >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${isDragging ? "bg-[#0050cb]" : "bg-[#e7eeff]"}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isDragging ? "white" : "#0050cb"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                    </svg>
                </div>
                <div>
                    <p className="text-base font-semibold text-[#111c2d]">Drop images here</p>
                    <p className="mt-0.5 text-xs text-[#727687]">Supports JPG, PNG, WEBP (max 20 MB/file)</p>
                </div>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-[#e7eeff] px-5 py-2.5 text-sm font-semibold text-[#0050cb] hover:bg-[#d6e2ff] transition-colors"
                >
                    Choose from Gallery
                </button>
            </div>

            {/* Mobile Actions (Take Photo + Choose from Gallery) */}
            <div className="mt-6 flex flex-col gap-3 md:hidden">
                <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex w-full h-14 items-center justify-center gap-2.5 rounded-xl bg-[#0050cb] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0066ff] transition-transform active:scale-[0.98]"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                    </svg>
                    Take Photo
                </button>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full h-14 items-center justify-center gap-2.5 rounded-xl bg-[#e7eeff] text-[15px] font-semibold text-[#0050cb] hover:bg-[#d6e2ff] transition-transform active:scale-[0.98]"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Choose from Gallery
                </button>
            </div>

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

            {/* Staged files preview strip */}
            {stagedFiles.length > 0 && (
                <div className="mt-6 rounded-2xl border border-[#e2e8f0] bg-white p-4">
                    <div className="flex items-center justify-between pb-3">
                        <span className="text-sm font-semibold text-[#111c2d]">
                            Selected photos ({stagedFiles.length})
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
                                setStagedFiles([]);
                            }}
                            className="text-xs font-medium text-[#ba1a1a] hover:underline"
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto py-1">
                        {stagedFiles.map((item, idx) => (
                            <div key={idx} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#f9f9ff]">
                                <Image
                                    src={item.previewUrl}
                                    alt={caption || "Staged photo"}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeStagedFile(idx)}
                                    aria-label="Remove image"
                                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Status Indicator */}
            {isAnalyzing && (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#d6e2ff] bg-[#f0f4ff] px-4 py-3 text-xs md:text-sm font-medium text-[#0050cb]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin shrink-0">
                        <line x1="12" y1="2" x2="12" y2="6"/>
                        <line x1="12" y1="18" x2="12" y2="22"/>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                        <line x1="2" y1="12" x2="6" y2="12"/>
                        <line x1="18" y1="12" x2="22" y2="12"/>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                    </svg>
                    <span>Analyzing image to suggest subject...</span>
                </div>
            )}

            {aiStatusMessage && !isAnalyzing && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#cfe8d2] bg-[#f2f9f3] px-4 py-2.5 text-xs md:text-sm font-medium text-[#1e6e28]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    <span>{aiStatusMessage}</span>
                </div>
            )}

            {/* Subject selector */}
            <div className="mt-6">
                <label className="block text-sm font-medium text-[#424656]">Upload to subject</label>
                <div className="relative mt-2">
                    <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="appearance-none h-12 md:h-10 w-full rounded-xl md:rounded-lg border border-[#c2c6d8] bg-white px-4 md:px-3 text-[15px] md:text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                    >
                        {subjects.length === 0 ? (
                            <option value="__new__">+ Create new subject</option>
                        ) : (
                            <>
                                {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                                <option value="__new__">+ Create new subject</option>
                            </>
                        )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[#727687]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                </div>
            </div>

            {/* New Subject Name input (when creating new subject) */}
            {(selectedSubjectId === "__new__" || subjects.length === 0) && (
                <div className="mt-4 rounded-xl border border-[#d6e2ff] bg-[#f8faff] p-3.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#0050cb]">
                        New subject name
                    </label>
                    <input
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="e.g. International Economics"
                        className="mt-1.5 h-11 md:h-10 w-full rounded-lg border border-[#c2c6d8] bg-white px-3 text-[15px] md:text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                    />
                </div>
            )}

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

            {/* Submit Upload button when files staged */}
            {stagedFiles.length > 0 && (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={handleStartUpload}
                        disabled={isSubmitting}
                        className="flex h-12 md:h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0050cb] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0066ff] disabled:opacity-60 transition-colors"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        {isSubmitting ? "Uploading…" : `Upload ${stagedFiles.length} photo${stagedFiles.length > 1 ? "s" : ""}`}
                    </button>
                </div>
            )}

            {/* Upload progress list */}
            {uploading.length > 0 && (
                <div className="mt-6">
                    <p className="text-sm font-semibold text-[#424656]">Uploading ({uploading.length})</p>
                    <div className="mt-3 space-y-3">
                        {uploading.map((item, idx) => {
                            const displayName = item.caption?.trim() || (uploading.length > 1 ? `Photo ${idx + 1}` : "Photo");
                            return (
                                <div key={item.clientUploadId} className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3">
                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#e7eeff]">
                                        <Thumbnail buffer={item.fileBuffer} type={item.fileType} alt={displayName} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-[#111c2d]">{displayName}</p>
                                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#e7eeff]">
                                            <div
                                                className={`h-full rounded-full bg-[#0050cb] transition-all ${item.status === "uploading" ? "w-3/4" : "w-0"}`}
                                            />
                                        </div>
                                        <p className="mt-1 text-[11px] text-[#727687]">
                                            {item.status === "uploading" ? "Uploading…" : "Waiting for connection"}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.clientUploadId)}
                                        title="Cancel upload"
                                        aria-label="Cancel upload"
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#727687] hover:bg-[#f0f3ff] hover:text-[#ba1a1a] transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Failed items */}
            {failed.length > 0 && (
                <div className="mt-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#ba1a1a]">Failed ({failed.length})</p>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={clearFailed}
                                className="text-sm font-medium text-[#727687] hover:text-[#ba1a1a] transition-colors"
                            >
                                Clear all
                            </button>
                            <button
                                type="button"
                                onClick={retryFailed}
                                className="text-sm font-medium text-[#0050cb] underline underline-offset-2 hover:text-[#0066ff]"
                            >
                                Retry all
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 space-y-2">
                        {failed.map((item, idx) => {
                            const displayName = item.caption?.trim() || (failed.length > 1 ? `Photo ${idx + 1}` : "Photo");
                            return (
                                <div key={item.clientUploadId} className="flex items-center gap-3 rounded-xl border border-[#ffdad6] bg-[#fff5f5] px-3 py-2.5">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ba1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                    <p className="min-w-0 flex-1 truncate text-sm text-[#93000a]">{displayName}</p>
                                    {item.errorMessage && (
                                        <span className="shrink-0 text-xs text-[#727687] max-w-[150px] truncate" title={item.errorMessage}>{item.errorMessage}</span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.clientUploadId)}
                                        title="Dismiss"
                                        aria-label="Dismiss failed upload"
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#93000a] hover:bg-[#ffdad6]/60 transition-colors"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
