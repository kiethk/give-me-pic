"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProfile, logout, UserProfile } from "@/lib/api-client";

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
function IconSettings({ active }: { active: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#0050cb" : "#727687"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

const navLinks = [
    { href: "/dashboard", label: "Subjects",   Icon: IconGrid },
    { href: "/dashboard/upload", label: "Upload",     Icon: IconUpload },
    { href: "/dashboard/chat",   label: "Ask AI",     Icon: IconChat },
    { href: "/dashboard/settings", label: "Settings", Icon: IconSettings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);

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
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    }

    return (
        <div className="flex h-full bg-[#f0f3ff]">
            {/* ── Sidebar ── */}
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#e2e8f0] bg-white">
                {/* Logo */}
                <div className="flex h-16 items-center gap-2.5 border-b border-[#e2e8f0] px-5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0050cb]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zM4 20a8 8 0 0 1 16 0H4z"/>
                        </svg>
                    </div>
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
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0050cb] text-[13px] font-semibold text-white">
                            {profile?.displayName?.[0]?.toUpperCase() ?? "U"}
                        </div>
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Top bar */}
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-8">
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

                {/* Page content */}
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
