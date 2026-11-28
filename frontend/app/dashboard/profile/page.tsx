"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
    BillingSummary,
    getBillingOrderStatus,
    getBillingSummary,
    getProfile,
    updateProfile,
    uploadAvatar,
    UserProfile,
} from "@/lib/api-client";
import { useRouter } from "next/navigation";

function formatPlanLabel(summary: BillingSummary): string {
    if (summary.tier === "pro") {
        if (summary.activePlan === "pro_yearly") return "Pro Yearly";
        if (summary.activePlan === "pro_monthly") return "Pro Monthly";
        return "Pro";
    }
    return "Free";
}

function formatExpiryDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return null;
        return new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(date);
    } catch {
        return null;
    }
}

function formatStorage(bytes: number): string {
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    if (bytes >= gb) {
        const val = bytes / gb;
        return `${Number.isInteger(val) ? val : val.toFixed(2)} GB`;
    }
    const val = bytes / mb;
    return `${val >= 10 || val === 0 ? Math.round(val) : val.toFixed(1)} MB`;
}

function calcUsagePercent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

export default function ProfilePage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [previewUrl, setPreviewUrl] = useState(""); // local blob preview
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [paymentNotice, setPaymentNotice] = useState("");

    useEffect(() => {
        getProfile()
            .then((data) => {
                setProfile(data);
                setDisplayName(data.displayName);
                setAvatarUrl(data.avatarUrl || "");
                setPreviewUrl(data.avatarUrl || "");
            })
            .catch(() => router.push("/"));

        getBillingSummary()
            .then(setBillingSummary)
            .catch(() => {});

        function handleBillingUpdated() {
            getProfile().then(setProfile).catch(() => {});
            getBillingSummary().then(setBillingSummary).catch(() => {});
        }

        window.addEventListener("billing-updated", handleBillingUpdated);
        return () => window.removeEventListener("billing-updated", handleBillingUpdated);
    }, [router]);

    useEffect(() => {
        let active = true;
        const params = new URLSearchParams(window.location.search);
        const payment = params.get("payment");
        const orderCodeRaw = params.get("orderCode");
        const trimmedOrderCode = orderCodeRaw?.trim() ?? "";
        const parsedOrderCode = /^\d+$/.test(trimmedOrderCode) ? Number(trimmedOrderCode) : NaN;
        const hasValidOrderCode = Number.isSafeInteger(parsedOrderCode) && parsedOrderCode > 0;

        async function handlePayosReturn() {
            if (hasValidOrderCode) {
                try {
                    const order = await getBillingOrderStatus(parsedOrderCode);
                    if (!active) return;

                    const [freshProfile, freshSummary] = await Promise.all([
                        getProfile().catch(() => null),
                        getBillingSummary().catch(() => null),
                    ]);
                    if (!active) return;

                    if (freshProfile) setProfile(freshProfile);
                    if (freshSummary) setBillingSummary(freshSummary);
                    window.dispatchEvent(new Event("billing-updated"));

                    if (order.status === "active") {
                        setPaymentNotice("");
                        setError("");
                        setSuccessMsg("Pro subscription activated!");
                    } else if (order.status === "cancelled" || payment === "cancelled") {
                        setSuccessMsg("");
                        setError("");
                        setPaymentNotice("Payment was cancelled.");
                    } else {
                        setSuccessMsg("");
                        setError("");
                        setPaymentNotice("Payment is still pending verification.");
                    }
                } catch (err) {
                    if (!active) return;
                    setError(err instanceof Error ? err.message : "Could not verify payment status.");
                } finally {
                    if (active) {
                        router.replace("/dashboard/profile");
                    }
                }
            } else if (payment === "cancelled") {
                await Promise.resolve();
                if (!active) return;
                setSuccessMsg("");
                setError("");
                setPaymentNotice("Payment was cancelled.");
                router.replace("/dashboard/profile");
            }
        }

        if (hasValidOrderCode || payment === "cancelled") {
            void handlePayosReturn();
        }

        return () => {
            active = false;
        };
    }, [router]);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate
        if (!file.type.startsWith("image/")) {
            setError("Please select an image file (JPG, PNG, WebP...)");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Image is too large. Maximum 5MB.");
            return;
        }

        // Show local preview immediately
        const blob = URL.createObjectURL(file);
        setPreviewUrl(blob);
        setError("");

        // Upload to Backend (which stores in Supabase)
        setIsUploading(true);
        try {
            const updatedProfile = await uploadAvatar(file);
            setProfile(updatedProfile);
            setAvatarUrl(updatedProfile.avatarUrl || "");
            setPreviewUrl(updatedProfile.avatarUrl || "");
            setSuccessMsg("Avatar uploaded successfully!");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
            setPreviewUrl(profile?.avatarUrl || ""); // revert preview
        } finally {
            setIsUploading(false);
            // Reset input so same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = displayName.trim();
        if (!trimmed) {
            setError("Name cannot be blank");
            return;
        }

        setIsSaving(true);
        setError("");
        setSuccessMsg("");

        try {
            const updated = await updateProfile({
                displayName: trimmed,
                avatarUrl: avatarUrl || undefined,
            });
            setProfile(updated);
            setSuccessMsg("Profile updated successfully! ✓");
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred while saving.");
        } finally {
            setIsSaving(false);
        }
    }

    const isDirty =
        displayName.trim() !== profile?.displayName ||
        avatarUrl !== (profile?.avatarUrl || "");

    if (!profile) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-[#0050cb] border-t-transparent animate-spin" />
                    <p className="text-sm text-[#727687]">Loading profile…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111c2d]">
                Profile
            </h1>
            <p className="mt-1 text-sm text-[#727687]">
                Manage your account information and preferences.
            </p>

            {/* Alerts */}
            {error && (
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#d3e5cf] px-4 py-3 text-sm text-[#2e5c26]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {successMsg}
                </div>
            )}
            {paymentNotice && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {paymentNotice}
                </div>
            )}

            <form onSubmit={handleSave} className="mt-6 space-y-5">
                {/* ── Avatar section ── */}
                <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 md:p-6 shadow-sm">
                    <h2 className="text-[15px] font-semibold text-[#111c2d]">Profile Photo</h2>
                    <p className="mt-0.5 text-[13px] text-[#727687]">Tap your avatar to upload a new photo.</p>

                    <div className="mt-4 flex items-center gap-5">
                        {/* Avatar button */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden ring-4 ring-[#e7eeff] hover:ring-[#0050cb]/30 transition-all active:scale-95 group"
                        >
                            {previewUrl ? (
                                <Image
                                    src={previewUrl}
                                    alt="Avatar"
                                    width={80}
                                    height={80}
                                    unoptimized
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[#0050cb] text-3xl font-bold text-white">
                                    {profile.displayName?.[0]?.toUpperCase() ?? "U"}
                                </div>
                            )}

                            {/* Upload overlay */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isUploading ? (
                                    <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                ) : (
                                    <>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                        </svg>
                                        <span className="mt-1 text-[10px] font-bold text-white">Upload</span>
                                    </>
                                )}
                            </div>
                        </button>

                        <div className="min-w-0">
                            <p className="truncate text-[15px] font-bold text-[#111c2d]">{profile.displayName}</p>
                            <p className="truncate text-[13px] text-[#727687]">{profile.email}</p>
                            <span className="mt-2 inline-flex items-center rounded-full bg-[#e7eeff] px-2.5 py-0.5 text-[11px] font-bold text-[#0050cb] uppercase tracking-wider">
                                {billingSummary?.tier ?? profile.subscriptionTier}
                            </span>
                        </div>
                    </div>

                    {/* Upload status */}
                    {isUploading && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#f0f3ff] px-3 py-2.5 text-[13px] text-[#424656]">
                            <div className="h-4 w-4 rounded-full border-2 border-[#0050cb] border-t-transparent animate-spin shrink-0" />
                            Uploading…
                        </div>
                    )}
                    {avatarUrl && !isUploading && avatarUrl !== (profile?.avatarUrl || "") && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#d3e5cf] px-3 py-2.5 text-[13px] text-[#2e5c26]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Image uploaded successfully! Click &quot;Save&quot; to apply.
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <p className="mt-3 text-[11px] text-[#727687]">
                        JPG, PNG, WebP · Max 5MB · 1:1 aspect ratio recommended
                    </p>
                </div>

                {/* ── Info section ── */}
                <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 md:p-6 shadow-sm space-y-4">
                    <h2 className="text-[15px] font-semibold text-[#111c2d]">Account Info</h2>

                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Display Name</label>
                        <input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="mt-1.5 h-12 w-full rounded-xl border border-[#c2c6d8] bg-[#f9f9ff] px-4 text-[15px] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
                            placeholder="Your full name"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[#424656]">Email Address</label>
                        <input
                            value={profile.email}
                            disabled
                            className="mt-1.5 h-12 w-full rounded-xl border border-[#e2e8f0] bg-[#f0f3ff] px-4 text-[15px] text-[#727687] outline-none cursor-not-allowed"
                        />
                        <p className="mt-1.5 text-xs text-[#727687]">Email address cannot be changed.</p>
                    </div>
                </div>

                {/* Save button */}
                <button
                    type="submit"
                    disabled={isSaving || isUploading || !displayName.trim() || !isDirty}
                    className="h-12 w-full rounded-xl bg-[#0050cb] text-[15px] font-semibold text-white hover:bg-[#0066ff] disabled:opacity-50 transition-all active:scale-[0.98] shadow-[0_4px_12px_rgba(0,80,203,0.3)]"
                >
                    {isSaving ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            Saving…
                        </span>
                    ) : (
                        "Save changes"
                    )}
                </button>
            </form>

            {/* ── Billing & Usage section ── */}
            <div className="mt-6 rounded-2xl border border-[#e2e8f0] bg-white p-5 md:p-6 shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-[15px] font-semibold text-[#111c2d]">Billing &amp; Usage</h2>
                            {billingSummary && (
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                                        billingSummary.tier === "pro"
                                            ? "bg-[#0050cb] text-white"
                                            : "bg-[#e7eeff] text-[#0050cb]"
                                    }`}
                                >
                                    {formatPlanLabel(billingSummary)}
                                </span>
                            )}
                        </div>
                        {billingSummary?.tier === "pro" && formatExpiryDate(billingSummary.expiresAt) ? (
                            <p className="mt-1 text-[13px] text-[#727687]">
                                Valid until {formatExpiryDate(billingSummary.expiresAt)}
                            </p>
                        ) : (
                            <p className="mt-1 text-[13px] text-[#727687]">
                                Monthly quotas reset on the 1st of each month.
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("open-upgrade-modal"))}
                        className="rounded-xl bg-[#0050cb] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-[#0042a8]"
                    >
                        {billingSummary?.tier === "pro" ? "Renew / Extend Pro" : "Upgrade to Pro"}
                    </button>
                </div>

                {billingSummary ? (
                    <div className="space-y-4">
                        {[
                            {
                                label: "Photos this month",
                                valueLabel: `${billingSummary.photosUsed} / ${billingSummary.photosLimit}`,
                                percent: calcUsagePercent(billingSummary.photosUsed, billingSummary.photosLimit),
                            },
                            {
                                label: "AI questions this month",
                                valueLabel: `${billingSummary.questionsUsed} / ${billingSummary.questionsLimit}`,
                                percent: calcUsagePercent(billingSummary.questionsUsed, billingSummary.questionsLimit),
                            },
                            {
                                label: "Storage",
                                valueLabel: `${formatStorage(billingSummary.storageUsedBytes)} / ${formatStorage(billingSummary.storageQuotaBytes)}`,
                                percent: calcUsagePercent(billingSummary.storageUsedBytes, billingSummary.storageQuotaBytes),
                            },
                        ].map((item) => {
                            const barColor =
                                item.percent >= 90
                                    ? "bg-[#ba1a1a]"
                                    : item.percent >= 75
                                      ? "bg-amber-500"
                                      : "bg-[#0050cb]";
                            return (
                                <div key={item.label} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[13px]">
                                        <span className="font-medium text-[#424656]">{item.label}</span>
                                        <span className="font-semibold text-[#0f172a]">{item.valueLabel}</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0f3ff]">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                            style={{ width: `${item.percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 w-full rounded bg-[#f0f3ff]" />
                        <div className="h-4 w-full rounded bg-[#f0f3ff]" />
                        <div className="h-4 w-full rounded bg-[#f0f3ff]" />
                    </div>
                )}
            </div>
        </div>
    );
}
