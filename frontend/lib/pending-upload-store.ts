// In-memory transfer store for photos captured/selected from the bottom navigation FAB
// before navigating to /dashboard/upload

let pendingFiles: File[] = [];
const listeners = new Set<(files: File[]) => void>();

export function setPendingUploadFiles(files: File[]): void {
    pendingFiles = [...files];
    listeners.forEach((listener) => listener(pendingFiles));
}

export function getPendingUploadFiles(): File[] {
    return pendingFiles;
}

export function consumePendingUploadFiles(): File[] {
    const files = [...pendingFiles];
    pendingFiles = [];
    return files;
}

export function subscribePendingUploadFiles(listener: (files: File[]) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
