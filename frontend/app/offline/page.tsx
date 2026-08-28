"use client";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f0f3ff] px-6 text-center">
      {/* Icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#e7eeff]">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0050cb"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-[#111c2d]">
        You&apos;re offline
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#727687]">
        Give Me Pic needs an internet connection to load your notes and chat with AI.
        Check your connection and try again.
      </p>

      <button
        onClick={() => window.location.reload()}
        className="mt-8 flex items-center gap-2 rounded-xl bg-[#0050cb] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0066ff]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.36" />
        </svg>
        Try again
      </button>

      <p className="mt-12 text-xs text-[#727687]">
        Give Me Pic &mdash; your notes, in the right place.
      </p>
    </main>
  );
}
