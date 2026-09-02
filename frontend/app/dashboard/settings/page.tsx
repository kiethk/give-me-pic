"use client";

import { useEffect, useRef, useState } from "react";
import { getProfile, updateProfile, uploadAvatar, UserProfile } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [previewUrl, setPreviewUrl] = useState(""); // local blob preview
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        getProfile()
            .then((data) => {
                setProfile(data);
                setDisplayName(data.displayName);
                setAvatarUrl(data.avatarUrl || "");
                setPreviewUrl(data.avatarUrl || "");
            })
            .catch(() => router.push("/"));
    }, [router]);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate
        if (!file.type.startsWith("image/")) {
            setError("Vui lòng chọn file ảnh (JPG, PNG, WebP...)");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Ảnh quá lớn. Tối đa 5MB.");
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
            setSuccessMsg("Đã upload ảnh đại diện thành công!");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload thất bại. Thử lại nhé.");
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
            setError("Tên không được để trống");
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
            setSuccessMsg("Cập nhật thông tin thành công! ✓");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu.");
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
                Profile Settings
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
                                <img
                                    src={previewUrl}
                                    alt="Avatar"
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
                                {profile.subscriptionTier}
                            </span>
                        </div>
                    </div>

                    {/* Upload status */}
                    {isUploading && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#f0f3ff] px-3 py-2.5 text-[13px] text-[#424656]">
                            <div className="h-4 w-4 rounded-full border-2 border-[#0050cb] border-t-transparent animate-spin shrink-0" />
                            Đang tải lên hệ thống…
                        </div>
                    )}
                    {avatarUrl && !isUploading && avatarUrl !== (profile?.avatarUrl || "") && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#d3e5cf] px-3 py-2.5 text-[13px] text-[#2e5c26]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Ảnh đã upload thành công! Nhấn &quot;Save&quot; để lưu.
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
                        JPG, PNG, WebP · Tối đa 5MB · Tỷ lệ 1:1 tốt nhất
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
        </div>
    );
}
