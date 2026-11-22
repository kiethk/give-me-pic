"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getProfile, logout, UserProfile } from "@/lib/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { setPendingUploadFiles } from "@/lib/pending-upload-store";

// ── Icons (inline SVG, no extra dependency) ──────────────────────────────────
function IconGrid({ active }: { active: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#0050cb" : "#727687"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
    );
}
function IconUpload({ active }: { active: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#0050cb" : "#727687"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    );
}
function IconChat({ active }: { active: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#0050cb" : "#727687"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}
function IconCamera({ className = "w-6 h-6" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>
    );
}
function IconSettings({ active }: { active: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#0050cb" : "#727687"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
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

const navLinks = [
    { href: "/dashboard/chat",   label: "Ask AI",     Icon: IconChat },
    { href: "/dashboard",        label: "Subjects",   Icon: IconGrid },
    { href: "/dashboard/upload", label: "Upload",     Icon: IconUpload },
    { href: "/dashboard/settings", label: "Settings", Icon: IconSettings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [showProfileSheet, setShowProfileSheet] = useState(false);
    const [showCaptureSheet, setShowCaptureSheet] = useState(false);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getProfile()
            .then(setProfile)
            .catch(() => router.push("/"));
    }, [router]);

    async function handleLogout() {
        await logout();
        router.push("/");
    }

    // Determine active nav
    function isActive(href: string) {
        if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/dashboard/subjects");
        return pathname.startsWith(href);
    }

    function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const rawFiles = Array.from(files);
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

        if (validFiles.length > 0) {
            setPendingUploadFiles(validFiles);
            setShowCaptureSheet(false);
            router.push("/dashboard/upload");
        }

        event.target.value = "";
    }

    return (
        <div className="flex h-full bg-[#f0f3ff] md:flex-row flex-col">
            {/* ── Sidebar (Desktop Only) ── */}
            <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-[#e2e8f0] bg-white">
                {/* Logo */}
                <div className="flex h-16 items-center gap-2.5 border-b border-[#e2e8f0] px-5">
                    <Image src="/icons/icon-192x192.png" alt="Give Me Pic logo" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
                    <span className="text-[15px] font-bold text-[#111c2d] tracking-tight">Give Me Pic</span>
                </div>

                {/* Nav links */}
                <nav className="flex-1 space-y-1 px-3 py-4">
                    {navLinks.map(({ href, label, Icon }) => {
                        const active = isActive(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-[#e7eeff] text-[#0050cb]"
                                        : "text-[#424656] hover:bg-[#f0f3ff] hover:text-[#111c2d]"
                                }`}
                            >
                                <Icon active={active} />
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User profile */}
                <div className="border-t border-[#e2e8f0] px-3 py-4">
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                        {profile?.avatarUrl ? (
                            <Image src={profile.avatarUrl} alt="Avatar" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0050cb] text-[13px] font-semibold text-white">
                                {profile?.displayName?.[0]?.toUpperCase() ?? "U"}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[#111c2d]">
                                {profile?.displayName ?? "…"}
                            </p>
                            <p className="truncate text-[11px] text-[#727687]">Student</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            title="Sign out"
                            className="rounded p-1 text-[#727687] hover:text-[#ba1a1a] transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main content ── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
                {/* Desktop Top bar */}
                <header className="hidden md:flex h-16 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-8">
                    <div className="flex h-9 w-72 items-center gap-2.5 rounded-lg border border-[#e2e8f0] bg-[#f9f9ff] px-3">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#727687" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <span className="text-sm text-[#727687]">Search content…</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="relative rounded-lg p-2 text-[#424656] hover:bg-[#f0f3ff] transition-colors">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            </svg>
                        </button>
                        <button className="rounded-lg bg-[#0050cb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0066ff] transition-colors">
                            Upgrade Pro
                        </button>
                    </div>
                </header>

                {/* Mobile Top bar */}
                <header className="flex md:hidden h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-4">
                    <div className="flex items-center gap-2">
                        <Image src="/icons/icon-192x192.png" alt="Logo" width={28} height={28} className="h-7 w-7 rounded-md object-cover" />
                        <span className="text-[15px] font-bold text-[#111c2d] tracking-tight">Give Me Pic</span>
                    </div>
                    <button onClick={() => setShowProfileSheet(true)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0050cb] text-[11px] font-semibold text-white">
                        {profile?.displayName?.[0]?.toUpperCase() ?? "U"}
                    </button>
                </header>

                {/* Mobile Profile Sheet */}
                <BottomSheet
                    open={showProfileSheet}
                    onClose={() => setShowProfileSheet(false)}
                    title="Account"
                >
                    <div className="px-5 py-4">
                        <div className="flex flex-col items-center gap-3 border-b border-[#f0f3ff] pb-5">
                            {profile?.avatarUrl ? (
                                <Image src={profile.avatarUrl} alt="Avatar" width={64} height={64} unoptimized className="h-16 w-16 rounded-full object-cover shadow-sm" />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0050cb] text-2xl font-semibold text-white">
                                    {profile?.displayName?.[0]?.toUpperCase() ?? "U"}
                                </div>
                            )}
                            <div className="text-center">
                                <p className="text-lg font-bold text-[#111c2d]">{profile?.displayName ?? "…"}</p>
                                <p className="text-sm text-[#727687]">{profile?.email ?? "…"}</p>
                            </div>
                        </div>
                        <div className="mt-2 space-y-1">
                            <button
                                onClick={() => {
                                    setShowProfileSheet(false);
                                    router.push("/dashboard/settings");
                                }}
                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#111c2d] hover:bg-[#f0f3ff] transition-colors"
                            >
                                <IconSettings active={false} />
                                Profile Settings
                            </button>
                            <button
                                onClick={() => {
                                    setShowProfileSheet(false);
                                    handleLogout();
                                }}
                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Sign out
                            </button>
                        </div>
                    </div>
                </BottomSheet>

                {/* Hidden File / Camera Inputs for Mobile FAB */}
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFilesSelected}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                />

                {/* Mobile Capture / Upload Options Sheet */}
                <BottomSheet
                    open={showCaptureSheet}
                    onClose={() => setShowCaptureSheet(false)}
                    title="Thêm bài học mới"
                >
                    <div className="space-y-3 px-5 py-4 pb-6">
                        <button
                            type="button"
                            onClick={() => {
                                cameraInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-4 rounded-2xl border border-[#c2c6d8] bg-white p-4 text-left shadow-sm transition hover:bg-[#f0f3ff] active:scale-[0.98]"
                        >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7eeff] text-[#0050cb]">
                                <IconCamera className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-semibold text-[#111c2d]">Chụp ảnh ngay</p>
                                <p className="text-xs text-[#727687]">Mở máy ảnh chụp trực tiếp bảng viết hoặc bài giảng</p>
                            </div>
                            <svg className="h-5 w-5 shrink-0 text-[#727687]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                fileInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-4 rounded-2xl border border-[#c2c6d8] bg-white p-4 text-left shadow-sm transition hover:bg-[#f0f3ff] active:scale-[0.98]"
                        >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7eeff] text-[#0050cb]">
                                <IconUpload active={true} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-semibold text-[#111c2d]">Chọn từ thư viện</p>
                                <p className="text-xs text-[#727687]">Tải lên một hoặc nhiều ảnh đã có sẵn trong máy</p>
                            </div>
                            <svg className="h-5 w-5 shrink-0 text-[#727687]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                </BottomSheet>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden shrink-0 h-[72px] bg-white border-t border-[#e2e8f0] flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] z-40">
                    <Link href="/dashboard/chat" className="flex flex-col items-center gap-1 p-2 text-[#727687] min-w-[64px]">
                        <IconChat active={isActive('/dashboard/chat')} />
                        <span className={`text-[10px] font-medium ${isActive('/dashboard/chat') ? 'text-[#0050cb]' : ''}`}>Hỏi AI</span>
                    </Link>

                    {/* Camera FAB */}
                    <div className="relative -top-5">
                        <button
                            type="button"
                            onClick={() => setShowCaptureSheet(true)}
                            aria-label="Chụp ảnh hoặc tải lên"
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0050cb] shadow-[0_8px_16px_rgba(0,80,203,0.3)] text-white hover:bg-[#0066ff] transition-transform active:scale-95"
                        >
                            <IconCamera className="w-7 h-7" />
                        </button>
                    </div>

                    <Link href="/dashboard" className="flex flex-col items-center gap-1 p-2 text-[#727687] min-w-[64px]">
                        <IconGrid active={isActive('/dashboard')} />
                        <span className={`text-[10px] font-medium ${isActive('/dashboard') ? 'text-[#0050cb]' : ''}`}>Môn học</span>
                    </Link>
                </nav>
            </div>
        </div>
    );
}
