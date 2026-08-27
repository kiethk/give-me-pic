"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    archiveSubject,
    createSubject,
    CreateSubjectInput,
    getSubjects,
    Subject,
} from "@/lib/api-client";

// ── Subject colour options ────────────────────────────────────────────────────
const SUBJECT_COLORS = [
    "#0050cb", "#0891b2", "#059669", "#7c3aed",
    "#db2777", "#ea580c", "#ca8a04", "#374151",
];

// ── Subject icon placeholder (first letter) ───────────────────────────────────
function SubjectIcon({ name, color }: { name: string; color: string }) {
    return (
        <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: color }}
        >
            {name[0]?.toUpperCase() ?? "?"}
        </div>
    );
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateSubjectModal({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (subject: Subject) => void;
}) {
    const [form, setForm] = useState<CreateSubjectInput>({
        name: "",
        description: "",
        colorHex: SUBJECT_COLORS[0],
        semester: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) return;
        setIsSubmitting(true);
        setError("");
        try {
            const subject = await createSubject({
                name: form.name.trim(),
                description: form.description?.trim() || undefined,
                colorHex: form.colorHex,
                semester: form.semester?.trim() || undefined,
            });
            onCreate(subject);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create subject.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-semibold text-[#111c2d]">New subject</h2>
                <p className="mt-1 text-sm text-[#727687]">Organise your lecture photos by subject.</p>

                {error && (
                    <div className="mt-4 rounded-lg bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Subject name *</label>
                        <input
                            required
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Calculus 1"
                            className="mt-1.5 h-10 w-full rounded-lg border border-[#c2c6d8] bg-[#f9f9ff] px-3 text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            rows={2}
                            placeholder="Optional notes…"
                            className="mt-1.5 w-full rounded-lg border border-[#c2c6d8] bg-[#f9f9ff] px-3 py-2 text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15 resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Semester</label>
                        <input
                            value={form.semester}
                            onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                            placeholder="e.g. 2025-1"
                            className="mt-1.5 h-10 w-full rounded-lg border border-[#c2c6d8] bg-[#f9f9ff] px-3 text-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Colour</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {SUBJECT_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, colorHex: c }))}
                                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${form.colorHex === c ? "ring-2 ring-offset-2 ring-[#0050cb] scale-110" : ""}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-[#c2c6d8] py-2.5 text-sm font-medium text-[#424656] hover:bg-[#f0f3ff] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !form.name.trim()}
                            className="flex-1 rounded-lg bg-[#0050cb] py-2.5 text-sm font-semibold text-white hover:bg-[#0066ff] disabled:opacity-60 transition-colors"
                        >
                            {isSubmitting ? "Creating…" : "Create subject"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubjectsPage() {
    const router = useRouter();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    async function load() {
        try {
            const data = await getSubjects();
            setSubjects(data.filter((s) => !s.archived));
        } catch {
            // redirect if unauthenticated
        } finally {
            setIsLoading(false);
        }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, []);

    async function handleArchive(subjectId: string) {
        try {
            await archiveSubject(subjectId);
            setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
        } catch { /* noop */ }
        setOpenMenuId(null);
    }

    return (
        <div className="px-8 py-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#111c2d]">Subjects</h1>
                    <p className="mt-1 text-sm text-[#727687]">
                        Organise and store lecture images by subject.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 rounded-lg bg-[#0050cb] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0066ff] transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    New subject
                </button>
            </div>

            {/* Grid */}
            {isLoading ? (
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#e7eeff]" />
                    ))}
                </div>
            ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {/* Create card */}
                    <button
                        onClick={() => setShowCreate(true)}
                        className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#c2c6d8] bg-white p-8 text-[#727687] transition-all hover:border-[#0050cb] hover:bg-[#f0f3ff] hover:text-[#0050cb]"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-current transition-colors">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold">New subject</p>
                            <p className="mt-0.5 text-xs">Add a new storage space.</p>
                        </div>
                    </button>

                    {/* Subject cards */}
                    {subjects.map((subject) => (
                        <div
                            key={subject.id}
                            className="relative flex flex-col gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                        >
                            {/* Three-dot menu */}
                            <div className="absolute right-3 top-3">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === subject.id ? null : subject.id); }}
                                    className="rounded-lg p-1.5 text-[#727687] hover:bg-[#f0f3ff] transition-colors"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                    </svg>
                                </button>
                                {openMenuId === subject.id && (
                                    <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-[#e2e8f0] bg-white py-1 shadow-lg">
                                        <button
                                            onClick={() => router.push(`/dashboard/subjects/${subject.id}`)}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#424656] hover:bg-[#f0f3ff]"
                                        >
                                            Open
                                        </button>
                                        <button
                                            onClick={() => handleArchive(subject.id)}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#ba1a1a] hover:bg-[#ffdad6]"
                                        >
                                            Archive
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Card body */}
                            <button
                                className="flex flex-col gap-3 text-left"
                                onClick={() => router.push(`/dashboard/subjects/${subject.id}`)}
                            >
                                <SubjectIcon name={subject.name} color={subject.colorHex} />
                                <div>
                                    <h3 className="truncate text-[15px] font-semibold text-[#111c2d]">{subject.name}</h3>
                                    {subject.description && (
                                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#727687]">
                                            {subject.description}
                                        </p>
                                    )}
                                </div>
                            </button>

                            {/* Footer */}
                            <div className="mt-auto flex items-center gap-2 border-t border-[#f0f3ff] pt-3">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#727687" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                </svg>
                                <span className="text-xs text-[#727687]">
                                    {subject.semester ?? "—"}
                                </span>
                                <span className="ml-auto text-xs text-[#727687]">
                                    {relativeTime(subject.updatedAt)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && subjects.length === 0 && (
                <div className="mt-16 flex flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e7eeff]">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0050cb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                        </svg>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[#111c2d]">No subjects yet</h3>
                    <p className="mt-1 text-sm text-[#727687]">Create your first subject to start organising your notes.</p>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="mt-5 rounded-lg bg-[#0050cb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0066ff] transition-colors"
                    >
                        Create subject
                    </button>
                </div>
            )}

            {/* Close menu on outside click */}
            {openMenuId && (
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
            )}

            {/* Create modal */}
            {showCreate && (
                <CreateSubjectModal
                    onClose={() => setShowCreate(false)}
                    onCreate={(s) => setSubjects((prev) => [s, ...prev])}
                />
            )}
        </div>
    );
}
