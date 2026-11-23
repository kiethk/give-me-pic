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
      setMessage(error instanceof Error ? error.message : "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/50 bg-white/95 p-6 sm:p-7 shadow-xl backdrop-blur-xl">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Welcome back
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sign in to access your notes
        </p>
      </div>

      {message && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800 animate-in fade-in">
          <svg className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="flex-1 font-medium leading-relaxed">{message}</p>
        </div>
      )}

      <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
        {/* Email Field */}
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Email
          </label>
          <div className="relative mt-1 flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/20"
              placeholder="name@email.com"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-700">
              Password
            </label>
            <a href="#" className="text-xs font-medium text-[#0050cb] hover:underline">
              Forgot?
            </a>
          </div>
          <div className="relative mt-1 flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/20"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <button
          disabled={isSubmitting}
          className="mt-1 flex h-10 w-full items-center justify-center rounded-lg bg-[#0050cb] text-sm font-semibold text-white shadow-sm transition hover:bg-[#0043b8] active:scale-[0.99] disabled:opacity-60"
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
        <div className="relative my-3.5 flex items-center justify-center">
          <div className="w-full border-t border-slate-200" />
          <span className="absolute bg-[#f4f4f5] px-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            or
          </span>
        </div>

        {/* Google sign-in */}
        <GoogleSignInButton mode="login" onError={setMessage} />
      </form>

      {/* Footer link inside card */}
      <div className="mt-4 border-t border-slate-200/80 pt-3.5 text-center text-xs text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-[#0050cb] hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}
