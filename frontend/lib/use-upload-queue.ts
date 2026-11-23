"use client";

/**
 * use-upload-queue.ts
 *
 * React hook that wraps the IndexedDB upload queue with:
 *  - Online/offline detection via navigator.onLine + window events
 *  - Automatic queue processing when the network comes back
 *  - Manual retry trigger
 *
 * Components only interact with this hook — never touch upload-queue.ts directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";

function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for non-HTTPS (e.g. LAN) environments where crypto API is restricted
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
import {
    clearFailedUploads,
    enqueue,
    getAllUploads,
    getUploads,
    QueuedUpload,
    removeFromQueue,
    updateStatus,
} from "@/lib/upload-queue";

export type { QueuedUpload };

interface UseUploadQueue {
    /** Full queue snapshot — used to render pending/failed badges in the UI. */
    queue: QueuedUpload[];
    isOnline: boolean;
    /** True while the auto-retry loop is running. */
    isProcessing: boolean;
    /** Non-null when a 429 rate limit is active — shows how many seconds remain. */
    rateLimitMessage: string | null;
    /**
     * Enqueue a file for upload. If online, starts uploading immediately.
     * If offline, stores in IndexedDB and uploads when the connection returns.
     */
    addToQueue(subjectId: string, file: File, buffer: ArrayBuffer, caption?: string): Promise<void>;
    /** Manual trigger — useful for a "Retry failed" button. */
    retryFailed(): void;
    /** Remove an individual item from the queue (dismiss/cancel). */
    removeItem(clientUploadId: string): Promise<void>;
    /** Clear all failed items from the queue. */
    clearFailed(): Promise<void>;
}

export function useUploadQueue(onUploadSuccess?: () => void): UseUploadQueue {
    const [queue, setQueue] = useState<QueuedUpload[]>([]);
    const [isOnline, setIsOnline] = useState<boolean>(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
    const processingRef = useRef(false); // guard against concurrent runs
    const rateLimitUntilRef = useRef<number>(0); // epoch ms when rate limit expires

    // -----------------------------------------------------------------------
    // Sync IDB → React state
    // -----------------------------------------------------------------------

    const refreshQueue = useCallback(async () => {
        try {
            const all = await getAllUploads();
            // Keep only items that are not "done" (done items are deleted from IDB,
            // but show them briefly by keeping them in state until the next refresh)
            setQueue(all);
        } catch {
            // IDB not available (SSR) — ignore
        }
    }, []);

    // -----------------------------------------------------------------------
    // Queue processor
    // -----------------------------------------------------------------------

    const processQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        setIsProcessing(true);

        try {
            const pending = await getUploads(["pending", "failed"]);

            for (const item of pending) {
                if (!navigator.onLine) break;

                // Respect active rate limit — wait out the remaining time
                const waitMs = rateLimitUntilRef.current - Date.now();
                if (waitMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, waitMs));
                    setRateLimitMessage(null);
                }

                await updateStatus(item.clientUploadId, "uploading");
                await refreshQueue();

                try {
                    // Reconstruct a File from the ArrayBuffer stored in IndexedDB
                    const fileType = inferMimeType(item.fileName, item.fileType) || item.fileType || "image/jpeg";
                    const file = new File([item.fileBuffer], item.fileName, { type: fileType });
                    const params = new URLSearchParams();
                    params.append("subjectId", item.subjectId);
                    if (item.caption) params.append("caption", item.caption);
                    params.append("clientUploadId", item.clientUploadId);

                    const response = await fetch(
                        `/api/media/upload?${params.toString()}`,
                        {
                            method: "POST",
                            credentials: "include",
                            body: (() => {
                                const fd = new FormData();
                                fd.append("file", file);
                                return fd;
                            })(),
                        },
                    );

                    if (response.status === 429) {
                        // Parse Retry-After header (seconds)
                        const retryAfterSec = parseInt(response.headers.get("Retry-After") ?? "60", 10);
                        rateLimitUntilRef.current = Date.now() + retryAfterSec * 1000;
                        setRateLimitMessage(
                            `Upload rate limit reached. Retrying in ${retryAfterSec} second${retryAfterSec !== 1 ? "s" : ""}.`,
                        );
                        // Put this item back to pending so it's retried after the wait
                        await updateStatus(item.clientUploadId, "pending");
                        await refreshQueue();
                        break; // exit loop; processQueue will be called again after wait
                    }

                    if (!response.ok) {
                        const data = await response.json().catch(() => null);
                        const errorMessage = data?.message || data?.error || `Upload failed (${response.status})`;
                        throw new Error(errorMessage);
                    }

                    await removeFromQueue(item.clientUploadId);
                    onUploadSuccess?.();
                } catch (err) {
                    const msg = err instanceof Error ? err.message : "Upload failed.";
                    await updateStatus(item.clientUploadId, "failed", msg);
                }

                await refreshQueue();
            }
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
            await refreshQueue();
        }
    }, [onUploadSuccess, refreshQueue]);

    // -----------------------------------------------------------------------
    // Online / offline event listeners
    // -----------------------------------------------------------------------

    useEffect(() => {
        // Initialise queue from IDB and recover interrupted uploads
        async function initQueue() {
            try {
                const all = await getAllUploads();
                // If any item was left in "uploading" state from a previously closed tab/crash,
                // recover it to "failed" so it can be retried or dismissed.
                for (const item of all) {
                    if (item.status === "uploading") {
                        await updateStatus(item.clientUploadId, "failed", "Upload interrupted.");
                    }
                }
            } catch {
                // ignore
            }
            await refreshQueue();

            if (navigator.onLine) {
                processQueue();
            }
        }

        initQueue();

        function handleOnline() {
            setIsOnline(true);
            processQueue();
        }
        function handleOffline() {
            setIsOnline(false);
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
        // processQueue is stable (useCallback with stable deps)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // -----------------------------------------------------------------------
    // Public actions
    // -----------------------------------------------------------------------

    const addToQueue = useCallback(
        async (subjectId: string, file: File, buffer: ArrayBuffer, caption?: string) => {
            const clientUploadId = generateId();
            const fileType = inferMimeType(file.name, file.type) || file.type || "image/jpeg";

            await enqueue({
                clientUploadId,
                subjectId,
                caption: caption ?? null,
                fileName: file.name,
                fileBuffer: buffer,
                fileType,
                fileSizeBytes: file.size,
            });

            await refreshQueue();

            // Attempt immediate upload if online
            if (navigator.onLine) {
                processQueue();
            }
        },
        [processQueue, refreshQueue],
    );

    const retryFailed = useCallback(() => {
        if (navigator.onLine) {
            processQueue();
        }
    }, [processQueue]);

    const removeItem = useCallback(
        async (clientUploadId: string) => {
            await removeFromQueue(clientUploadId);
            await refreshQueue();
        },
        [refreshQueue],
    );

    const clearFailed = useCallback(async () => {
        await clearFailedUploads();
        await refreshQueue();
    }, [refreshQueue]);

    return { queue, isOnline, isProcessing, rateLimitMessage, addToQueue, retryFailed, removeItem, clearFailed };
}
