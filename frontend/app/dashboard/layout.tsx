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
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [showProfileSheet, setShowProfileSheet] = useState(false);
    const [showCaptureSheet, setShowCaptureSheet] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getProfile()
            .then(setProfile)
            .catch(() => router.push("/"));
    }, [router]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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
        <div className="flex h-full flex-col bg-[#f0f3ff]">
            {/* ── Desktop Top bar ── */}
            <header className="hidden md:flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-6 z-30">
                {/* Left: Brand & Clean Top Navigation Tabs */}
                <div className="flex h-full items-center gap-6">
                    {/* Brand */}
                    <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
                        <Image src="/icons/icon-192x192.png" alt="Give Me Pic logo" width={28} height={28} className="h-7 w-7 rounded-lg object-cover shadow-xs" />
                        <span className="text-[15px] font-bold text-[#0f172a] tracking-tight">Give Me Pic</span>
                    </Link>

                    {/* Subtle Divider */}
                    <div className="h-4 w-px bg-[#e2e8f0]" />

                    {/* Nav tabs: Pure typography with active bottom underline indicator */}
                    <nav className="flex h-full items-center gap-1">
                        {navLinks.map(({ href, label }) => {
                            const active = isActive(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`relative flex h-full items-center px-3.5 text-[13px] tracking-wide transition-colors ${
                                        active
                                            ? "font-semibold text-[#0050cb]"
                                            : "font-medium text-[#64748b] hover:text-[#0f172a]"
                                    }`}
                                >
                                    {label}
                                    {active && (
                                        <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-[#0050cb]" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Right: Upgrade Pro pill & User profile dropdown */}
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-1.5 rounded-lg border border-[#c7d7fe] bg-[#f0f4ff] px-3 py-1.5 text-xs font-semibold text-[#0050cb] shadow-xs transition hover:bg-[#e0eaff] hover:border-[#b2c8fd] active:scale-[0.98]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z"/>
                        </svg>
                        Upgrade Pro
                    </button>

                    {/* User profile dropdown container */}
                    <div className="relative" ref={userMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors border border-transparent ${
                                showUserMenu ? "bg-[#f1f5f9] border-[#e2e8f0]" : "hover:bg-[#f8fafc]"
                            }`}
                        >
                            {profile?.avatarUrl ? (
                                <Image src={profile.avatarUrl} alt="Avatar" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 rounded-full object-cover shadow-xs ring-1 ring-slate-200" />
                            ) : (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0050cb] text-xs font-bold text-white shadow-xs">
                                    {profile?.displayName?.[0]?.toUpperCase() ?? "U"}
                                </div>
                            )}
                            <span className="max-w-[130px] truncate text-xs font-semibold text-[#0f172a]">
                                {profile?.displayName ?? "…"}
                            </span>
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`shrink-0 text-[#94a3b8] transition-transform ${showUserMenu ? "rotate-180 text-[#0f172a]" : ""}`}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        {/* Floating Dropdown Menu */}
                        {showUserMenu && (
                            <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-52 rounded-2xl border border-[#e2e8f0] bg-white p-1.5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.06)] animate-in fade-in slide-in-from-top-2 duration-150">
                                <div className="border-b border-[#f1f5f9] px-3 py-2.5">
                                    <p className="truncate text-xs font-semibold text-[#0f172a]">{profile?.displayName ?? "…"}</p>
                                    <p className="truncate text-[11px] text-[#64748b]">{profile?.email ?? ""}</p>
                                </div>
                                <div className="pt-1 space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            router.push("/dashboard/profile");
                                        }}
                                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-[#1e293b] hover:bg-[#f1f5f9] transition-colors"
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#64748b]">
                                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                        </svg>
                                        Profile
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            handleLogout();
                                        }}
                                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-[#ba1a1a] hover:bg-[#fff5f5] transition-colors"
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#ba1a1a]">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                                        </svg>
                                        Log out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main content ── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
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
                                    router.push("/dashboard/profile");
                                }}
                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#111c2d] hover:bg-[#f0f3ff] transition-colors"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#64748b]">
                                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                </svg>
                                Profile
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
                                Log out
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
