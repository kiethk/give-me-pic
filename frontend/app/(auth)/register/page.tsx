"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      await register({ email, password, displayName });
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Đã có lỗi xảy ra.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="text-center lg:text-left">
        <h2 className="text-3xl font-bold tracking-tight text-[#111c2d]">Create an account</h2>
        <p className="mt-2 text-sm text-[#727687]">
          Set up your workspace to get started.
        </p>
      </div>

      {message && (
        <div className="mt-8 rounded-xl border border-[#ffdad6] bg-[#fff5f5] p-4 text-sm text-[#93000a]">
          <div className="flex gap-3">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{message}</p>
          </div>
        </div>
      )}

      <form className="mt-8 space-y-5 rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-sm" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-[#424656]">Display name</label>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#c2c6d8] bg-[#f9f9ff] px-4 text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
            placeholder="e.g. Alex Student"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#424656]">Email address</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#c2c6d8] bg-[#f9f9ff] px-4 text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
            placeholder="name@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#424656]">Password</label>
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#c2c6d8] bg-[#f9f9ff] px-4 text-sm text-[#111c2d] outline-none transition focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/15"
            placeholder="At least 8 characters"
          />
        </div>

        <button
          disabled={isSubmitting}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#0050cb] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0066ff] disabled:pointer-events-none disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Working...
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-[#727687]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#0050cb] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
