"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api-client";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.push("/dashboard/chat");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Đã có lỗi xảy ra.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-3xl border border-[#e2e8f0] bg-white p-7 sm:p-9 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      {/* Header */}
      <div className="text-left">
        <h2 className="text-2xl font-bold tracking-tight text-[#0f172a] sm:text-3xl">
          Welcome back
        </h2>
        <p className="mt-1.5 text-sm text-[#64748b]">
          Enter your details to access your study archive.
        </p>
      </div>

      {message && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-sm text-rose-800 animate-in fade-in">
          <svg className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="flex-1 text-xs font-medium leading-relaxed">{message}</p>
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
            Email address
          </label>
          <div className="relative mt-1.5 flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#94a3b8]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white pl-10 pr-4 text-sm text-[#0f172a] placeholder-[#94a3b8] shadow-sm outline-none transition-all focus:border-[#0050cb] focus:ring-4 focus:ring-[#0050cb]/10"
              placeholder="name@example.com"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Password
            </label>
            <a href="#" className="text-xs font-semibold text-[#0050cb] hover:text-[#003d99] hover:underline">
              Forgot password?
            </a>
          </div>
          <div className="relative mt-1.5 flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#94a3b8]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white pl-10 pr-10 text-sm text-[#0f172a] placeholder-[#94a3b8] shadow-sm outline-none transition-all focus:border-[#0050cb] focus:ring-4 focus:ring-[#0050cb]/10"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#94a3b8] hover:text-[#475569] transition-colors"
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <button
          disabled={isSubmitting}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0050cb] to-[#0043b8] text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:from-[#0060f0] hover:to-[#0050cb] hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Signing in...
            </span>
          ) : (
            "Sign in"
          )}
        </button>

        {/* Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="w-full border-t border-[#e2e8f0]" />
          <span className="absolute bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
            or continue with
          </span>
        </div>

        {/* Google sign-in */}
        <GoogleSignInButton mode="login" onError={setMessage} />
      </form>

      {/* Footer link inside card */}
      <div className="mt-6 border-t border-[#f1f5f9] pt-5 text-center text-sm text-[#64748b]">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-[#0050cb] hover:text-[#003d99] hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
