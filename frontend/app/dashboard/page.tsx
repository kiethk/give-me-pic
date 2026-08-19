"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProfile, logout, UserProfile } from "@/lib/api-client";

export default function Dashboard() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [error, setError] = useState("");

    async function handleLogout() {
        await logout();
        router.push("/");
    }

    useEffect(() => {
        getProfile()
            .then(setProfile)
            .catch(() => setError("Bạn cần đăng nhập để xem trang này."));
    }, []);

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
            <div className="mx-auto max-w-5xl">
                <header className="flex items-start justify-between border-b border-[var(--line)] pb-8">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--coral)]">
                            Give Me Pic
                        </p>
                        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
                            Good to have you, {profile.displayName}.
                        </h1>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-sm font-medium text-[var(--forest)] underline underline-offset-4"
                    >
                        Sign out
                    </button>
                </header>
                <section className="mt-10 grid gap-5 sm:grid-cols-3">
                    <div className="bg-[var(--forest)] p-6 text-[#f4f1ea] sm:col-span-2">
                        <p className="text-sm uppercase tracking-[0.18em] text-[#d9e4d2]">Your archive</p>
                        <p className="mt-12 max-w-md text-2xl leading-snug">
                            Your first study shelf is ready for the moments worth keeping.
                        </p>
                    </div>
                    <div className="border border-[var(--line)] bg-[#fbfaf6] p-6">
                        <p className="text-sm uppercase tracking-[0.18em] text-[var(--ink-muted)]">Account</p>
                        <p className="mt-6 break-words text-sm">{profile.email}</p>
                        <p className="mt-2 text-xs text-[var(--ink-muted)]">{profile.userId}</p>
                    </div>
                </section>
            </div>
        </main>
    );
}
