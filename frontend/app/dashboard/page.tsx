"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    archiveSubject,
    createSubject,
    deleteMedia,
    getMedia,
    getProfile,
    getSubjects,
    logout,
    MediaItem,
    Subject,
    UserProfile,
} from "@/lib/api-client";
import { useUploadQueue } from "@/lib/use-upload-queue";

const defaultForm = {
    name: "",
    description: "",
    colorHex: "#1F4D3A",
    semester: "",
};

export default function Dashboard() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [caption, setCaption] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [form, setForm] = useState(defaultForm);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
    const [isRemovingMedia, setIsRemovingMedia] = useState<Record<string, boolean>>({});

    const { queue, isOnline, isProcessing, addToQueue, retryFailed } = useUploadQueue(() => {
        // Called after each successful upload — refresh media lists
        if (selectedSubjectId) loadMediaForSubject(selectedSubjectId);
        loadAllMedia();
    });

    const pendingQueue = queue.filter((u) => u.status === "pending" || u.status === "uploading");
    const failedQueue = queue.filter((u) => u.status === "failed");

    const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? null;

    async function loadSubjects() {
        try {
            const data = await getSubjects();
            setSubjects(data);
            if (!selectedSubjectId && data.length > 0) {
                setSelectedSubjectId(data[0].id);
            }
            if (data.length === 0) {
                setSelectedSubjectId(null);
                setMediaItems([]);
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách môn học.");
        } finally {
            setIsLoadingSubjects(false);
        }
    }

    async function loadMediaForSubject(subjectId: string) {
        try {
            const data = await getMedia(subjectId);
            setMediaItems(data);
        } catch (mediaError) {
            setError(mediaError instanceof Error ? mediaError.message : "Không tải được media của môn học.");
        }
    }

    async function loadAllMedia() {
        try {
            setAllMediaItems(await getMedia());
        } catch (mediaError) {
            setError(mediaError instanceof Error ? mediaError.message : "Không tải được thư viện ảnh.");
        }
    }

    async function handleLogout() {
        await logout();
        router.push("/");
    }

    async function handleCreateSubject(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            await createSubject({
                name: form.name,
                description: form.description || undefined,
                colorHex: form.colorHex,
                semester: form.semester || undefined,
            });
            setForm(defaultForm);
            await loadSubjects();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Không thể tạo môn học.");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleArchiveSubject(subjectId: string) {
        setError("");

        try {
            await archiveSubject(subjectId);
            await loadSubjects();
            if (selectedSubjectId === subjectId) {
                setSelectedSubjectId(null);
                setMediaItems([]);
            }
        } catch (archiveError) {
            setError(archiveError instanceof Error ? archiveError.message : "Không thể ẩn môn học.");
        }
    }

    async function handleUploadMedia(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedSubjectId || !file) {
            setError("Vui lòng chọn môn học và file cần upload.");
            return;
        }

        setError("");
        try {
            await addToQueue(selectedSubjectId, file, caption || undefined);
            setCaption("");
            setFile(null);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Không thể xếp hàng upload.");
        }
    }

    async function handleDeleteMedia(mediaId: string) {
        setError("");
        setIsRemovingMedia((current) => ({ ...current, [mediaId]: true }));

        try {
            await deleteMedia(mediaId);
            await Promise.all([
                selectedSubjectId ? loadMediaForSubject(selectedSubjectId) : Promise.resolve(),
                loadAllMedia(),
            ]);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa file.");
        } finally {
            setIsRemovingMedia((current) => ({ ...current, [mediaId]: false }));
        }
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const nextFile = event.target.files?.[0] ?? null;
        setFile(nextFile);
    }

    useEffect(() => {
        getProfile()
            .then((profileData) => {
                setProfile(profileData);
                return Promise.all([loadSubjects(), loadAllMedia()]);
            })
            .catch(() => setError("Bạn cần đăng nhập để xem trang này."));
    }, []);

    useEffect(() => {
        if (!selectedSubjectId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMediaItems([]);
            return;
        }
        loadMediaForSubject(selectedSubjectId).catch(() => undefined);
    }, [selectedSubjectId]);

    if (error) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
                <div className="max-w-md border border-[var(--line)] bg-[#fbfaf6] p-8 text-center">
                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--coral)]">Session expired</p>
                    <h1 className="mt-3 text-3xl font-semibold">Please sign in again.</h1>
                    <Link
                        className="mt-6 inline-block text-sm font-medium text-[var(--forest)] underline underline-offset-4"
                        href="/"
                    >
                        Back to sign in
                    </Link>
                </div>
            </main>
        );
    }

    if (!profile) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--ink-muted)]">
                Loading...
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--background)] px-6 py-8 sm:px-12 sm:py-12">
            <div className="mx-auto max-w-6xl">
                <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-8">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--coral)]">
                            Give Me Pic
                        </p>
                        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
                            Good to have you, {profile.displayName}.
                        </h1>
                    </div>
                    <div className="flex items-center gap-5">
                        <Link
                            href="/dashboard/chat"
                            className="text-sm font-medium text-[var(--forest)] underline underline-offset-4"
                        >
                            Ask questions
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium text-[var(--forest)] underline underline-offset-4"
                        >
                            Sign out
                        </button>
                    </div>
                </header>

                <section className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-5">
                        <div className="border border-[var(--line)] bg-[#fbfaf6] p-6 sm:p-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                                        Subjects
                                    </p>
                                    <h2 className="mt-2 text-3xl font-semibold tracking-tight">Your study shelf</h2>
                                </div>
                                <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--forest)]">
                                    {subjects.length} active
                                </span>
                            </div>

                            <div className="mt-6 space-y-4">
                                {isLoadingSubjects ? (
                                    <p className="text-sm text-[var(--ink-muted)]">Loading subjects...</p>
                                ) : subjects.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-sm text-[var(--ink-muted)]">
                                        Chưa có môn học nào. Hãy tạo môn học đầu tiên bên phải.
                                    </div>
                                ) : (
                                    subjects.map((subject) => {
                                        const isSelected = selectedSubjectId === subject.id;
                                        return (
                                            <div
                                                key={subject.id}
                                                className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                                                    isSelected
                                                        ? "border-[var(--forest)] bg-[#eef4ee]"
                                                        : "border-[var(--line)] bg-white"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedSubjectId(subject.id)}
                                                        className="flex flex-1 items-center gap-3 text-left"
                                                    >
                                                        <span
                                                            className="inline-block h-4 w-4 rounded-full border border-black/10"
                                                            style={{ backgroundColor: subject.colorHex }}
                                                        />
                                                        <div>
                                                            <h3 className="text-lg font-semibold">{subject.name}</h3>
                                                            {subject.semester && (
                                                                <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                                                                    {subject.semester}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleArchiveSubject(subject.id)}
                                                        className="text-xs font-medium text-[var(--coral)] underline underline-offset-4"
                                                    >
                                                        Archive
                                                    </button>
                                                </div>

                                                {subject.description && (
                                                    <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
                                                        {subject.description}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {selectedSubject && (
                            <div className="border border-[var(--line)] bg-[#fbfaf6] p-6 sm:p-8">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="inline-block h-4 w-4 rounded-full border border-black/10"
                                            style={{ backgroundColor: selectedSubject.colorHex }}
                                        />
                                        <div>
                                            <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                                                Selected subject
                                            </p>
                                            <h3 className="mt-1 text-2xl font-semibold">{selectedSubject.name}</h3>
                                        </div>
                                    </div>
                                    <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-medium text-[var(--forest)]">
                                        {mediaItems.length} files
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
                                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                                            Semester
                                        </p>
                                        <p className="mt-2 text-sm font-medium">{selectedSubject.semester || "—"}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
                                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                                            Status
                                        </p>
                                        <p className="mt-2 text-sm font-medium">
                                            {selectedSubject.archived ? "Archived" : "Active"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
                                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                                            Updated
                                        </p>
                                        <p className="mt-2 text-sm font-medium">
                                            {new Date(selectedSubject.updatedAt).toLocaleDateString("vi-VN")}
                                        </p>
                                    </div>
                                </div>

                                {selectedSubject.description && (
                                    <p className="mt-5 text-sm leading-6 text-[var(--ink-muted)]">
                                        {selectedSubject.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-5">
                        <form
                            onSubmit={handleCreateSubject}
                            className="border border-[var(--line)] bg-[#fbfaf6] p-6 sm:p-8"
                        >
                            <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">New subject</p>
                            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Create a subject</h2>

                            <div className="mt-6 space-y-5">
                                <label className="block text-sm font-medium">
                                    Subject name
                                    <input
                                        required
                                        value={form.name}
                                        onChange={(event) =>
                                            setForm((current) => ({ ...current, name: event.target.value }))
                                        }
                                        className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                                        placeholder="Toán học"
                                    />
                                </label>

                                <label className="block text-sm font-medium">
                                    Description
                                    <textarea
                                        value={form.description}
                                        onChange={(event) =>
                                            setForm((current) => ({ ...current, description: event.target.value }))
                                        }
                                        className="mt-2 min-h-24 w-full border border-[var(--line)] bg-transparent p-3 outline-none transition-colors focus:border-[var(--forest)]"
                                        placeholder="Ghi chú, mục tiêu học tập, ..."
                                    />
                                </label>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <label className="block text-sm font-medium">
                                        Semester
                                        <input
                                            value={form.semester}
                                            onChange={(event) =>
                                                setForm((current) => ({ ...current, semester: event.target.value }))
                                            }
                                            className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                                            placeholder="2026-1"
                                        />
                                    </label>

                                    <label className="block text-sm font-medium">
                                        Color
                                        <div className="mt-2 flex h-12 items-center gap-3 border border-[var(--line)] bg-white px-3">
                                            <input
                                                type="color"
                                                value={form.colorHex}
                                                onChange={(event) =>
                                                    setForm((current) => ({ ...current, colorHex: event.target.value }))
                                                }
                                                className="h-8 w-10 border-0 bg-transparent p-0"
                                            />
                                            <span className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                                                {form.colorHex}
                                            </span>
                                        </div>
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="mt-3 flex h-12 w-full items-center justify-center bg-[var(--coral)] px-5 font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
                                >
                                    {isSubmitting ? "Creating..." : "Create subject"}
                                </button>
                            </div>
                        </form>

                        <div className="border border-[var(--line)] bg-[#fbfaf6] p-6 sm:p-8">
                            <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">Media</p>
                            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Upload to subject</h2>

                            {/* ── Offline / sync status banner ── */}
                            {!isOnline && (
                                <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    <span className="text-base">📶</span>
                                    <span>Không có kết nối — ảnh sẽ được lưu và tự động gửi khi online lại.</span>
                                </div>
                            )}

                            {isOnline && isProcessing && (
                                <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[#eef4ee] px-4 py-3 text-sm text-[var(--forest)]">
                                    <span className="animate-spin text-base">⟳</span>
                                    <span>Đang gửi ảnh đang chờ...</span>
                                </div>
                            )}

                            {/* ── Pending / failed queue items ── */}
                            {pendingQueue.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {pendingQueue.map((item) => (
                                        <div
                                            key={item.clientUploadId}
                                            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                                        >
                                            <span className="text-xs font-medium uppercase tracking-[0.12em] text-amber-700">
                                                {item.status === "uploading" ? "Đang gửi" : "Chờ mạng"}
                                            </span>
                                            <p className="min-w-0 flex-1 truncate text-sm text-amber-900">{item.fileName}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {failedQueue.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {failedQueue.map((item) => (
                                        <div
                                            key={item.clientUploadId}
                                            className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                                        >
                                            <span className="text-xs font-medium uppercase tracking-[0.12em] text-red-700">Lỗi</span>
                                            <p className="min-w-0 flex-1 truncate text-sm text-red-900">{item.fileName}</p>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={retryFailed}
                                        className="text-xs font-medium text-[var(--coral)] underline underline-offset-4"
                                    >
                                        Thử lại tất cả
                                    </button>
                                </div>
                            )}

                            {selectedSubjectId ? (
                                <form onSubmit={handleUploadMedia} className="mt-6 space-y-5">
                                    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-4">
                                        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center text-sm text-[var(--ink-muted)]">
                                            <span className="rounded-full bg-[var(--forest)] px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-white">
                                                Select file
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={handleFileChange}
                                            />
                                            <span>{file ? file.name : "Chưa chọn file"}</span>
                                        </label>
                                    </div>

                                    <label className="block text-sm font-medium">
                                        Caption
                                        <input
                                            value={caption}
                                            onChange={(event) => setCaption(event.target.value)}
                                            className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                                            placeholder="Bài tập toán, ảnh vẽ,..."
                                        />
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={!file}
                                        className="flex h-12 w-full items-center justify-center bg-[var(--forest)] px-5 font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isOnline ? "Upload" : "Lưu để gửi sau"}
                                    </button>
                                </form>
                            ) : (
                                <p className="mt-6 text-sm text-[var(--ink-muted)]">
                                    Chọn một môn học để upload ảnh hoặc file.
                                </p>
                            )}

                            <div className="mt-6 border-t border-[var(--line)] pt-5">
                                <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                                    Uploaded files
                                </p>
                                <div className="mt-3 space-y-2">
                                    {mediaItems.length === 0 ? (
                                        <p className="text-sm text-[var(--ink-muted)]">
                                            Chưa có file nào trong môn học này.
                                        </p>
                                    ) : (
                                        mediaItems.map((media) => (
                                            <div
                                                key={media.id}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">{media.fileName}</p>
                                                    {media.caption && (
                                                        <p className="truncate text-xs text-[var(--ink-muted)]">
                                                            {media.caption}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={media.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs font-medium text-[var(--forest)] underline underline-offset-4"
                                                    >
                                                        Open
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteMedia(media.id)}
                                                        disabled={isRemovingMedia[media.id]}
                                                        className="text-xs font-medium text-[var(--coral)] underline underline-offset-4 disabled:opacity-50"
                                                    >
                                                        {isRemovingMedia[media.id] ? "Removing..." : "Delete"}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-5 border border-[var(--line)] bg-[#fbfaf6] p-6 sm:p-8">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">Library</p>
                            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Your photo grid</h2>
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                            {allMediaItems.length} photos
                        </span>
                    </div>

                    {allMediaItems.length === 0 ? (
                        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--ink-muted)]">
                            Chưa có ảnh nào. Hãy chọn một môn học và upload ảnh đầu tiên.
                        </div>
                    ) : (
                        <div className="mt-6 space-y-8">
                            {subjects.map((subject) => {
                                const subjectMedia = allMediaItems.filter((media) => media.subjectId === subject.id);
                                if (subjectMedia.length === 0) {
                                    return null;
                                }

                                return (
                                    <div key={subject.id}>
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="inline-block h-3 w-3 rounded-full border border-black/10"
                                                style={{ backgroundColor: subject.colorHex }}
                                            />
                                            <h3 className="text-lg font-semibold">{subject.name}</h3>
                                            <span className="text-xs text-[var(--ink-muted)]">
                                                {subjectMedia.length}
                                            </span>
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                            {subjectMedia.map((media) => (
                                                <a
                                                    key={media.id}
                                                    href={media.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="group overflow-hidden border border-[var(--line)] bg-white"
                                                >
                                                    <div className="aspect-square overflow-hidden bg-[#eef4ee]">
                                                        <img
                                                            src={media.url}
                                                            alt={media.caption || media.fileName}
                                                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                    </div>
                                                    <div className="p-3">
                                                        <p className="truncate text-sm font-medium">{media.fileName}</p>
                                                        {media.caption && (
                                                            <p className="mt-1 truncate text-xs text-[var(--ink-muted)]">
                                                                {media.caption}
                                                            </p>
                                                        )}
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
