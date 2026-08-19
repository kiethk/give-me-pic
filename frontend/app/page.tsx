"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api-client";

type Mode = "login" | "register";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await register({ email, password, displayName });
      } else {
        await login({ email, password });
      }
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Đã có lỗi xảy ra.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden px-5 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden border border-[var(--line)] bg-[#fbfaf6] shadow-[0_24px_80px_rgba(42,55,45,0.12)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex flex-col justify-between bg-[var(--forest)] p-8 text-[#f4f1ea] sm:p-12 lg:p-16">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[32px] border-[#d9e4d2]/15" />
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#d9e4d2]">Give Me Pic</p>
            <h1 className="mt-20 max-w-lg text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Your notes, in the right place.
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-[#d9e4d2] sm:text-lg">
              Capture the moment in class. Build a study archive you can return to when the details matter.
            </p>
          </div>
          <div className="relative mt-16 flex items-end justify-between border-t border-[#d9e4d2]/25 pt-5 text-sm text-[#d9e4d2]">
            <span>Private by default</span>
            <span>01 / Auth</span>
          </div>
        </section>

        <section className="flex items-center p-8 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--coral)]">
              {mode === "register" ? "Start your archive" : "Welcome back"}
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
              {mode === "register" ? "Create your account" : "Sign in to continue"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
              {mode === "register" ? "A calm place for the things you learn." : "Your study shelf is waiting."}
            </p>

            <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
              {mode === "register" && (
                <label className="block text-sm font-medium">
                  Display name
                  <input
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                    placeholder="Nguyen Van A"
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  required
                  minLength={8}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-12 w-full border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)]"
                  placeholder="At least 8 characters"
                />
              </label>
              <button
                disabled={isSubmitting}
                className="mt-3 flex h-13 w-full items-center justify-center bg-[var(--coral)] px-5 font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </form>

            {message && (
              <p className="mt-5 border-l-2 border-[var(--coral)] px-3 text-sm leading-6 text-[var(--ink-muted)]">{message}</p>
            )}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setMessage("");
              }}
              className="mt-8 text-sm font-medium text-[var(--forest)] underline decoration-[var(--coral)] decoration-2 underline-offset-4"
            >
              {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}