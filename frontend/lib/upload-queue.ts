/**
 * upload-queue.ts
 *
 * Thin wrapper around IndexedDB for persisting the offline upload queue.
 * Completely framework-agnostic — no React imports.
 *
 * Storage format: each record is a QueuedUpload where `fileDataUrl` holds
 * the file as a base64 data-URL so the binary survives tab close/refresh.
 */

const DB_NAME = "givemepic-upload-queue";
const DB_VERSION = 3; // Bump to clear old Blob schema
const STORE_NAME = "uploads";

export type UploadStatus = "pending" | "uploading" | "done" | "failed";

export interface QueuedUpload {
    clientUploadId: string; // UUID generated at enqueue time — used for idempotency
    subjectId: string;
    caption: string | null;
    fileName: string;
    fileBuffer: ArrayBuffer; // Store raw bytes to prevent iOS deleting temp camera files
    fileType: string;
    fileSizeBytes: number;
    status: UploadStatus;
    errorMessage: string | null;
    createdAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// DB lifecycle
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME); // Clear old v1 schema
            }
            db.createObjectStore(STORE_NAME, { keyPath: "clientUploadId" });
        };

        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });

    return dbPromise;
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

/** Add a new upload to the queue. Returns the clientUploadId. */
export async function enqueue(
    item: Omit<QueuedUpload, "status" | "errorMessage" | "createdAt">,
): Promise<string> {
    const db = await openDb();
    const record: QueuedUpload = {
        ...item,
        status: "pending",
        errorMessage: null,
        createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(item.clientUploadId);
        req.onerror = () => reject(req.error);
    });
}

/** Return all uploads in the given statuses (default: pending + failed). */
export async function getUploads(
    statuses: UploadStatus[] = ["pending", "failed"],
): Promise<QueuedUpload[]> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            const all: QueuedUpload[] = req.result ?? [];
            resolve(all.filter((u) => statuses.includes(u.status)));
        };
        req.onerror = () => reject(req.error);
    });
}

/** Return all uploads regardless of status — used to render the full queue UI. */
export async function getAllUploads(): Promise<QueuedUpload[]> {
    return getUploads(["pending", "uploading", "failed", "done"]);
}

/** Update the status (and optional error message) of a queued upload. */
export async function updateStatus(
    clientUploadId: string,
    status: UploadStatus,
    errorMessage: string | null = null,
): Promise<void> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(clientUploadId);

        getReq.onsuccess = () => {
            if (!getReq.result) {
                resolve(); // already gone — that's fine
                return;
            }
            const updated: QueuedUpload = { ...getReq.result, status, errorMessage };
            const putReq = store.put(updated);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

/** Remove a successfully uploaded item from the queue. */
export async function removeFromQueue(clientUploadId: string): Promise<void> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(clientUploadId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Removed base64 string conversion helpers to save memory
