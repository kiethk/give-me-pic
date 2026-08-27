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
import { uploadMedia } from "@/lib/api-client";
import {
    dataUrlToFile,
    enqueue,
    fileToDataUrl,
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
    addToQueue(subjectId: string, file: File, caption?: string): Promise<void>;
    /** Manual trigger — useful for a "Retry failed" button. */
    retryFailed(): void;
}

export function useUploadQueue(onUploadSuccess?: () => void): UseUploadQueue {
    const [queue, setQueue] = useState<QueuedUpload[]>([]);
    const [isOnline, setIsOnline] = useState<boolean>(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );
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
                    const file = dataUrlToFile(item.fileDataUrl, item.fileName, item.fileType);
                    const response = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/media/upload`,
                        {
                            method: "POST",
                            credentials: "include",
                            body: (() => {
                                const fd = new FormData();
                                fd.append("subjectId", item.subjectId);
                                fd.append("file", file);
                                if (item.caption) fd.append("caption", item.caption);
                                fd.append("clientUploadId", item.clientUploadId);
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
                        throw new Error(data?.message ?? "Upload failed.");
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
        // Initialise queue from IDB on mount
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshQueue();

        function handleOnline() {
            setIsOnline(true);
            processQueue();
        }
        function handleOffline() {
            setIsOnline(false);
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        // If we're already online at mount, process any leftover pending items
        // (e.g. the user was offline, closed the tab, reopened it while online)
        if (navigator.onLine) {
            processQueue();
        }

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
        async (subjectId: string, file: File, caption?: string) => {
            const clientUploadId = crypto.randomUUID();
            const fileDataUrl = await fileToDataUrl(file);

            await enqueue({
                clientUploadId,
                subjectId,
                caption: caption ?? null,
                fileName: file.name,
                fileDataUrl,
                fileType: file.type,
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

    return { queue, isOnline, isProcessing, rateLimitMessage, addToQueue, retryFailed };
}
